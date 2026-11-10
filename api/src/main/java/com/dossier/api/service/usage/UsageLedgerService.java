package com.dossier.api.service.usage;

import com.dossier.api.domain.usage.PersonalUsageCounter;
import com.dossier.api.domain.usage.PersonalUsageEvent;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.PlanCatalogReader;
import com.dossier.api.service.entitlement.PlanData.FeatureDef;
import com.dossier.api.service.entitlement.PlanResolver;
import com.dossier.api.service.usage.AllowanceResolver.PeriodWindow;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The personal usage ledger (story K7.5, docs/subscriptions/08-data-model.md section 4.6 and 06 section 5): reserve, commit and release against a counter
 * per account, service, limit and period, with the discipline of the organization ledger (decision S-14 keeps the two apart).
 *
 * <ul>
 *   <li><b>Reserve</b> counts at once: the counter row is read FOR UPDATE, so two reservations of the last unit queue and exactly one wins. The same
 *       idempotency key twice is one row; a key whose reservation was released answers {@code ALREADY_RELEASED}.</li>
 *   <li><b>Commit</b> keeps the usage (a partial commit gives the difference back); <b>release</b> returns it; a reservation nobody settles is released as
 *       TIMEOUT by {@link #sweepExpired}.</li>
 * </ul>
 */
@Service
public class UsageLedgerService {

    private static final Logger LOG = LoggerFactory.getLogger(UsageLedgerService.class);

    /** How long an unsettled reservation holds its units. */
    public static final Duration DEFAULT_TTL = Duration.ofMinutes(15);

    public enum Status {
        /** The units are held. */
        RESERVED,
        /** The same idempotency key was reserved before; nothing new was held. */
        REPLAYED,
        /** The allowance is spent; nothing was held. */
        EXHAUSTED,
    }

    /** @param used units used in the window after this call; @param allowance the window's allowance */
    public record Result(Status status, Long eventId, long used, long allowance, String periodKey) {
        public boolean granted() {
            return status != Status.EXHAUSTED;
        }
    }

    /** A reservation to decide; {@code allowance} and {@code window} are already resolved (see {@link #reserve(String, long, String, String, long, String)}). */
    public record Request(
        long userId,
        String login,
        String featureKey,
        String limitKey,
        long quantity,
        long allowance,
        PeriodWindow window,
        String unit,
        String idempotencyKey,
        Duration ttl
    ) {}

    private final PersonalLedgerRepository ledger;
    private final Clock clock;
    private PlanResolver resolver;
    private PlanCatalogReader catalog;

    public UsageLedgerService(PersonalLedgerRepository ledger, Clock clock) {
        this.ledger = ledger;
        this.clock = clock;
    }

    @Autowired
    public UsageLedgerService(PersonalLedgerRepository ledger, PlanResolver resolver, PlanCatalogReader catalog) {
        this(ledger, Clock.systemUTC());
        this.resolver = resolver;
        this.catalog = catalog;
    }

    /**
     * Reserve {@code quantity} units of a service for a personal account: the allowance and the window come from the resolved entitlements and the
     * service's period, then the pure {@link #reserve(Request)} decides.
     */
    @Transactional
    public Result reserve(String login, long userId, String featureKey, String limitKey, long quantity, String idempotencyKey) {
        EntitlementSet set = resolver.resolvePersonal(login);
        FeatureDef def = catalog.features().get(featureKey);
        if (def == null || !set.has(featureKey)) return new Result(Status.EXHAUSTED, null, 0, 0, null);
        Instant now = clock.instant();
        String lk = limitKey == null ? AllowanceResolver.DEFAULT_LIMIT : limitKey;
        return reserve(
            new Request(userId, login, featureKey, lk, quantity, AllowanceResolver.allowance(set, def, limitKey), AllowanceResolver.window(def.allowancePeriod(), set, now), "units", idempotencyKey, DEFAULT_TTL)
        );
    }

    @Transactional
    public Result reserve(Request r) {
        if (r.quantity() <= 0) throw new UsageLedgerException(UsageLedgerException.INVALID_QUANTITY, "quantity must be positive");
        Optional<PersonalUsageEvent> prior = ledger.findEventByKey(r.idempotencyKey());
        if (prior.isPresent()) {
            PersonalUsageEvent e = prior.get();
            if (PersonalUsageEvent.RELEASED.equals(e.getStatus())) {
                throw new UsageLedgerException(UsageLedgerException.ALREADY_RELEASED, "this reservation was released; use a new idempotency key");
            }
            return new Result(Status.REPLAYED, e.getId(), 0, e.getAllowanceSnapshot(), e.getPeriodKey());
        }
        String limit = r.limitKey() == null ? AllowanceResolver.DEFAULT_LIMIT : r.limitKey();
        PersonalUsageCounter c = ledger.lockCounter(r.userId(), r.featureKey(), limit, r.window().key(), r.allowance());
        // the same key may have been created by a concurrent request while we waited for the lock
        Optional<PersonalUsageEvent> raced = ledger.findEventByKey(r.idempotencyKey());
        if (raced.isPresent()) return new Result(Status.REPLAYED, raced.get().getId(), c.getUsed(), c.getAllowance(), r.window().key());
        c.setAllowance(r.allowance());
        if (c.getUsed() + r.quantity() > r.allowance()) {
            ledger.saveCounter(c);
            return new Result(Status.EXHAUSTED, null, c.getUsed(), r.allowance(), r.window().key());
        }
        Instant now = clock.instant();
        c.setUsed(c.getUsed() + r.quantity());
        c.setUpdatedAt(now);
        ledger.saveCounter(c);

        PersonalUsageEvent e = new PersonalUsageEvent();
        e.setUserId(r.userId());
        e.setLogin(r.login());
        e.setFeatureKey(r.featureKey());
        e.setLimitKey(limit);
        e.setQuantity(r.quantity());
        e.setReservedQuantity(r.quantity());
        e.setUnit(r.unit() == null ? "units" : r.unit());
        e.setStatus(PersonalUsageEvent.RESERVED);
        e.setAllowanceSnapshot(r.allowance());
        e.setPeriodKey(r.window().key());
        e.setPeriodStartAt(r.window().start());
        e.setPeriodEndAt(r.window().end());
        e.setIdempotencyKey(r.idempotencyKey());
        e.setCreatedAt(now);
        e.setExpiresAt(now.plus(r.ttl() == null ? DEFAULT_TTL : r.ttl()));
        e = ledger.saveEvent(e);
        return new Result(Status.RESERVED, e.getId(), c.getUsed(), r.allowance(), r.window().key());
    }

    /** Settle a reservation as used; {@code actual} (null = all) below the reserved quantity gives the difference back. Committing twice is a no-op. */
    @Transactional
    public void commit(Long eventId, Long actual) {
        PersonalUsageEvent e = ledger.lockEvent(eventId).orElseThrow(() -> new UsageLedgerException(UsageLedgerException.NOT_FOUND, "no such reservation"));
        if (PersonalUsageEvent.COMMITTED.equals(e.getStatus())) return;
        if (PersonalUsageEvent.RELEASED.equals(e.getStatus())) {
            throw new UsageLedgerException(UsageLedgerException.ALREADY_RELEASED, "the reservation was released");
        }
        long used = actual == null ? e.getReservedQuantity() : actual;
        if (used < 0 || used > e.getReservedQuantity()) {
            throw new UsageLedgerException(UsageLedgerException.INVALID_QUANTITY, "a commit cannot exceed what was reserved");
        }
        long back = e.getReservedQuantity() - used;
        if (back > 0) giveBack(e, back);
        e.setQuantity(used);
        e.setStatus(PersonalUsageEvent.COMMITTED);
        e.setCommittedAt(clock.instant());
        e.setExpiresAt(null);
        ledger.saveEvent(e);
    }

    /** Give a reservation back (FAILED, TIMEOUT, DENIED, CANCELLED). Releasing twice is a no-op; a committed one cannot be released. */
    @Transactional
    public void release(Long eventId, String reason) {
        PersonalUsageEvent e = ledger.lockEvent(eventId).orElseThrow(() -> new UsageLedgerException(UsageLedgerException.NOT_FOUND, "no such reservation"));
        if (PersonalUsageEvent.RELEASED.equals(e.getStatus())) return;
        if (PersonalUsageEvent.COMMITTED.equals(e.getStatus())) {
            throw new UsageLedgerException(UsageLedgerException.ALREADY_COMMITTED, "the reservation was committed");
        }
        giveBack(e, e.getReservedQuantity());
        e.setStatus(PersonalUsageEvent.RELEASED);
        e.setReleaseReason(reason == null ? "CANCELLED" : reason);
        e.setReleasedAt(clock.instant());
        ledger.saveEvent(e);
    }

    /** Push an unsettled reservation's expiry out (a long-running call). */
    @Transactional
    public void extend(Long eventId, Duration by) {
        PersonalUsageEvent e = ledger.lockEvent(eventId).orElseThrow(() -> new UsageLedgerException(UsageLedgerException.NOT_FOUND, "no such reservation"));
        if (PersonalUsageEvent.RESERVED.equals(e.getStatus())) {
            e.setExpiresAt(clock.instant().plus(by));
            ledger.saveEvent(e);
        }
    }

    /** Release every reservation whose time-to-live ran out, as TIMEOUT. Returns how many. */
    @Transactional
    public int sweepExpired(Instant now, int max) {
        List<PersonalUsageEvent> expired = ledger.expiredReservations(now, max);
        int n = 0;
        for (PersonalUsageEvent e : expired) {
            try {
                release(e.getId(), "TIMEOUT");
                n++;
            } catch (UsageLedgerException ex) {
                LOG.debug("reservation {} settled while sweeping: {}", e.getId(), ex.getCode());
            }
        }
        return n;
    }

    private void giveBack(PersonalUsageEvent e, long units) {
        PersonalUsageCounter c = ledger.lockCounter(e.getUserId(), e.getFeatureKey(), e.getLimitKey(), e.getPeriodKey(), e.getAllowanceSnapshot());
        c.setUsed(Math.max(0, c.getUsed() - units));
        c.setUpdatedAt(clock.instant());
        ledger.saveCounter(c);
    }
}
