package com.dossier.api.service;

import com.dossier.api.domain.ExtConnectCode;
import com.dossier.api.repository.ExtConnectCodeRepository;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one-time code that connects the browser extension to an enterprise account (decision O4, docs/enterprise-v2/19 section 6.3).
 *
 * <p>A code is 256 random bits (base64url, 43 characters), valid for {@value #VALID_SECONDS} seconds, stored only as its SHA-256, bound to the account and
 * its organization, and spent by ONE atomic conditional update: of any number of concurrent exchanges exactly one wins. A code that is unknown, spent,
 * expired or malformed is the same answer ({@link Optional#empty()}), so nothing about a code can be learned from the exchange.
 */
@Service
public class ExtensionConnectCodeService {

    public static final int VALID_SECONDS = 60;

    private static final Pattern SHAPE = Pattern.compile("^[A-Za-z0-9_-]{43}$");
    private static final SecureRandom RANDOM = new SecureRandom();

    /** What a spent code was bound to. */
    public record Spent(Long userId, Long orgId) {}

    private final ExtConnectCodeRepository codes;

    public ExtensionConnectCodeService(ExtConnectCodeRepository codes) {
        this.codes = codes;
    }

    /** A fresh code for {@code userId} in {@code orgId}. The raw value is returned once and never stored. */
    @Transactional
    public String mint(Long userId, Long orgId) {
        Instant now = Instant.now();
        codes.deleteExpiredBefore(now.minus(Duration.ofDays(1))); // housekeeping: nothing older than a day is of any use
        byte[] raw = new byte[32];
        RANDOM.nextBytes(raw);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        ExtConnectCode row = new ExtConnectCode();
        row.setCodeHash(hash(code));
        row.setUserId(userId);
        row.setOrgId(orgId);
        row.setCreatedAt(now);
        row.setExpiresAt(now.plusSeconds(VALID_SECONDS));
        codes.save(row);
        return code;
    }

    /** Spend {@code code}: what it was bound to, or empty when it is unknown, malformed, already spent or expired. */
    @Transactional
    public Optional<Spent> spend(String code) {
        if (code == null || !SHAPE.matcher(code).matches()) return Optional.empty();
        String hash = hash(code);
        if (codes.consume(hash, Instant.now()) != 1) return Optional.empty();
        return codes.findByCodeHash(hash).map(r -> new Spent(r.getUserId(), r.getOrgId()));
    }

    static String hash(String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
