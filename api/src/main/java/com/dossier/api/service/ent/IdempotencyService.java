package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.IdempotencyRecord;
import com.dossier.api.repository.ent.IdempotencyRecordRepository;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code Idempotency-Key} for the actions that must not run twice (40-api-specs.md section 6: bulk member actions, offboard apply, invites,
 * exports...). The first call with a key does the work and stores its reply for 24 hours; the same key with the same request returns that
 * reply again ({@code replayed}); the same key with a different request is 422 {@code IDEMPOTENCY_KEY_REUSED}; two callers racing on one key
 * end with one winner (the loser's whole transaction rolls back on the unique key and answers 409 {@code IDEMPOTENCY_IN_PROGRESS}).
 *
 * <p>The ledger row is written in the SAME transaction as the work, so a failed call stores nothing and can be retried with the same key.
 * The key itself is never stored: only {@code sha256(orgId:key)}, which also makes a key unusable across tenants. The request hash covers
 * the HTTP method, the path (which carries the organization and the member) and the canonical body.
 */
@Service
public class IdempotencyService {

    private static final Logger LOG = LoggerFactory.getLogger(IdempotencyService.class);

    public static final String CODE_KEY_MISSING = "IDEMPOTENCY_KEY_MISSING";
    public static final String CODE_KEY_INVALID = "IDEMPOTENCY_KEY_INVALID";
    public static final String CODE_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED";
    public static final String CODE_IN_PROGRESS = "IDEMPOTENCY_IN_PROGRESS";

    static final Duration TTL = Duration.ofHours(24);
    static final int MAX_BODY = 60_000;
    private static final Pattern KEY_SHAPE = Pattern.compile("[A-Za-z0-9._:-]{8,80}");

    /** What a call returned: the body, the HTTP status it carried, and whether it came from the ledger rather than from the work. */
    public record Outcome<T>(T body, int status, boolean replayed) {}

    private final IdempotencyRecordRepository records;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate tx;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public IdempotencyService(IdempotencyRecordRepository records, ObjectMapper json, PlatformTransactionManager txManager) {
        this(records, json, txManager, Clock.systemUTC());
    }

    IdempotencyService(IdempotencyRecordRepository records, ObjectMapper json, PlatformTransactionManager txManager, Clock clock) {
        this.records = records;
        this.json = json;
        this.clock = clock;
        this.tx = new TransactionTemplate(txManager);
    }

    /**
     * Runs {@code work} once per (actor, key). With no key: {@code required} refuses with 400 {@code IDEMPOTENCY_KEY_MISSING}; otherwise the work
     * simply runs (no ledger row). The refusals that need no work (key missing, key malformed, key reused for another request) are thrown BEFORE any
     * transaction is opened; only the first run of a key (work plus ledger row) is one transaction.
     */
    public <T> Outcome<T> execute(
        OrgMembership me,
        String key,
        boolean required,
        String method,
        String path,
        Object request,
        int successStatus,
        Class<T> type,
        Supplier<T> work
    ) {
        if (key == null || key.isBlank()) {
            if (required) throw OrgException.coded(400, CODE_KEY_MISSING, "Send an Idempotency-Key header (a UUID) with this request", Map.of());
            return new Outcome<>(work.get(), successStatus, false);
        }
        String trimmed = key.strip();
        if (!KEY_SHAPE.matcher(trimmed).matches()) {
            throw OrgException.coded(400, CODE_KEY_INVALID, "The Idempotency-Key must be 8 to 80 letters, digits, dots, dashes, colons or underscores", Map.of());
        }
        Long orgId = me.orgId();
        String keyHash = sha256(orgId + ":" + trimmed);
        String requestHash = sha256(method + "\n" + path + "\n" + canonical(request));
        Instant now = Instant.now(clock);

        Optional<IdempotencyRecord> existing = records.findByOrgIdAndActorLoginAndKeyHash(orgId, me.login(), keyHash);
        if (existing.isPresent() && existing.get().getExpiresAt().isAfter(now)) {
            IdempotencyRecord row = existing.get();
            if (!row.getRequestHash().equals(requestHash)) {
                throw OrgException.coded(422, CODE_KEY_REUSED, "This Idempotency-Key was already used for a different request", Map.of());
            }
            return new Outcome<>(read(row, type), row.getStatus(), true);
        }

        return tx.execute(status -> runOnce(me, existing, keyHash, requestHash, successStatus, now, work));
    }

    private <T> Outcome<T> runOnce(
        OrgMembership me,
        Optional<IdempotencyRecord> existing,
        String keyHash,
        String requestHash,
        int successStatus,
        Instant now,
        Supplier<T> work
    ) {
        Long orgId = me.orgId();
        T body = work.get();
        String text = write(body);
        IdempotencyRecord row = existing.orElseGet(IdempotencyRecord::new); // an expired row is reused in place (the unique key forbids a second one)
        row.setOrgId(orgId);
        row.setActorLogin(me.login());
        row.setKeyHash(keyHash);
        row.setRequestHash(requestHash);
        row.setStatus(successStatus);
        row.setResponseJson(text != null && text.length() <= MAX_BODY ? text : null);
        row.setState(IdempotencyRecord.DONE);
        row.setCreatedAt(now);
        row.setExpiresAt(now.plus(TTL));
        try {
            records.saveAndFlush(row);
        } catch (DataIntegrityViolationException e) {
            throw OrgException.coded(409, CODE_IN_PROGRESS, "The same request is already being processed", Map.of("retryAfterSeconds", 1));
        }
        return new Outcome<>(body, successStatus, false);
    }

    /** Hourly: forgets replies past their 24 hours. */
    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 600_000L)
    @Transactional
    public void purgeExpired() {
        int n = em.createQuery("delete from IdempotencyRecord r where r.expiresAt < :now").setParameter("now", Instant.now(clock)).executeUpdate();
        if (n > 0) LOG.info("Purged {} expired idempotency records", n);
    }

    private <T> T read(IdempotencyRecord row, Class<T> type) {
        if (row.getResponseJson() == null) return null; // too large to keep: the replay carries the status only
        try {
            return json.readValue(row.getResponseJson(), type);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("A stored idempotent reply no longer reads as " + type.getSimpleName(), e);
        }
    }

    private String write(Object body) {
        try {
            return body == null ? null : json.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private String canonical(Object request) {
        try {
            return request == null ? "" : json.writeValueAsString(request);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String sha256(String text) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
