package com.dossier.api.service.ent.billing;

import com.dossier.api.domain.ent.billing.UsageCounter;
import com.dossier.api.domain.ent.billing.UsageEvent;
import com.dossier.api.repository.ent.billing.UsageCounterRepository;
import com.dossier.api.repository.ent.billing.UsageEventRepository;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Database-backed matching reservation ledger. The existing counter is locked before the event is
 * inserted, so parallel runs for one consultant cannot both consume the last batch units.
 */
@Service
public final class JpaMatchingUsageLedger implements MatchingUsageLedger {

    private static final String RESERVED = "RESERVED";
    private static final String COMMITTED = "COMMITTED";
    private static final String RELEASED = "RELEASED";

    private final UsageEventRepository events;
    private final UsageCounterRepository counters;

    public JpaMatchingUsageLedger(UsageEventRepository events, UsageCounterRepository counters) {
        this.events = events;
        this.counters = counters;
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Reservation reserve(Request request) {
        Optional<UsageEvent> existing = events.findByOrgIdAndIdempotencyKey(request.orgId(), request.idempotencyKey());
        if (existing.isPresent()) return existing(existing.get());

        UsageCounter counter = counters
            .findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(request.orgId(), request.consultantProfileId(), request.featureKey(), request.periodKey())
            .orElseGet(() -> newCounter(request));
        long used = counter.getUsed() == null ? 0 : counter.getUsed();
        counter.setAllowance(request.allowance());
        if (request.allowance() - used < request.quantity()) return new Reservation(null, ReserveStatus.ALLOWANCE_EXHAUSTED, 0, null);

        counter.setUsed(used + request.quantity());
        counter.setUpdatedAt(request.now());
        counters.saveAndFlush(counter);

        UsageEvent event = new UsageEvent();
        event.setOrgId(request.orgId());
        event.setConsultantId(request.consultantProfileId()); // legacy FK retained by the billing foundation
        event.setMemberId(request.consultantMemberId());
        event.setActorMemberId(request.actorMemberId());
        event.setActorLogin(request.actorLogin());
        event.setBeneficiaryLogin(request.beneficiaryLogin());
        event.setFeatureKey(request.featureKey());
        event.setUnit(request.unit());
        event.setQuantity(request.quantity());
        event.setReservedQuantity(request.quantity());
        event.setAllowanceSnapshot(request.allowance());
        event.setPeriodKey(request.periodKey());
        event.setPeriodStartAt(request.periodStartAt());
        event.setPeriodEndAt(request.periodEndAt());
        event.setStatus(RESERVED);
        event.setSource("ORG_MATCH");
        event.setIdempotencyKey(request.idempotencyKey());
        event.setReferenceType(request.referenceType());
        event.setReferenceId(request.referenceId());
        event.setOccurredAt(request.now());
        event.setCreatedAt(request.now());
        event.setExpiresAt(request.now().plusSeconds(request.ttlSeconds()));
        UsageEvent saved = events.saveAndFlush(event);
        return new Reservation(saved.getId(), ReserveStatus.RESERVED, request.quantity(), RESERVED);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void commit(Long orgId, Long reservationId, long actualQuantity, Instant now) {
        UsageEvent event = locked(orgId, reservationId).orElse(null);
        if (event == null || COMMITTED.equals(event.getStatus()) || RELEASED.equals(event.getStatus())) return;
        if (!RESERVED.equals(event.getStatus())) return;
        long reserved = event.getReservedQuantity() == null ? event.getQuantity() : event.getReservedQuantity();
        if (actualQuantity < 0 || actualQuantity > reserved) throw new IllegalArgumentException("actual matching usage exceeds reservation");

        adjustCounter(event, -reserved + actualQuantity, now);
        event.setQuantity(actualQuantity);
        event.setStatus(COMMITTED);
        event.setCommittedAt(now);
        events.saveAndFlush(event);
    }

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void release(Long orgId, Long reservationId, String reason, Instant now) {
        UsageEvent event = locked(orgId, reservationId).orElse(null);
        if (event == null || COMMITTED.equals(event.getStatus()) || RELEASED.equals(event.getStatus())) return;
        if (!RESERVED.equals(event.getStatus())) return;
        long reserved = event.getReservedQuantity() == null ? event.getQuantity() : event.getReservedQuantity();
        adjustCounter(event, -reserved, now);
        event.setQuantity(0L);
        event.setStatus(RELEASED);
        event.setReleaseReason(normalizeReason(reason));
        event.setReleasedAt(now);
        events.saveAndFlush(event);
    }

    private Reservation existing(UsageEvent event) {
        String status = event.getStatus();
        long quantity = event.getReservedQuantity() == null ? Math.max(0, event.getQuantity()) : event.getReservedQuantity();
        if (RELEASED.equals(status)) return new Reservation(event.getId(), ReserveStatus.ALREADY_RELEASED, quantity, status);
        return new Reservation(event.getId(), ReserveStatus.EXISTING, quantity, status);
    }

    private UsageCounter newCounter(Request request) {
        UsageCounter counter = new UsageCounter();
        counter.setOrgId(request.orgId());
        counter.setConsultantId(request.consultantProfileId());
        counter.setFeatureKey(request.featureKey());
        counter.setPeriodKey(request.periodKey());
        counter.setUsed(0L);
        counter.setAllowance(request.allowance());
        counter.setUpdatedAt(request.now());
        return counter;
    }

    private void adjustCounter(UsageEvent event, long delta, Instant now) {
        UsageCounter counter = counters
            .findByOrgIdAndConsultantIdAndFeatureKeyAndPeriodKey(event.getOrgId(), event.getConsultantId(), event.getFeatureKey(), event.getPeriodKey())
            .orElse(null);
        if (counter == null) return;
        long used = counter.getUsed() == null ? 0 : counter.getUsed();
        counter.setUsed(Math.max(0, used + delta));
        counter.setUpdatedAt(now);
        counters.saveAndFlush(counter);
    }

    private Optional<UsageEvent> locked(Long orgId, Long reservationId) {
        if (orgId == null || reservationId == null) return Optional.empty();
        return events.findByOrgIdAndId(orgId, reservationId);
    }

    private static String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) return "FAILED";
        String value = reason.strip().toUpperCase(Locale.ROOT);
        return value.length() <= 16 ? value : value.substring(0, 16);
    }
}
