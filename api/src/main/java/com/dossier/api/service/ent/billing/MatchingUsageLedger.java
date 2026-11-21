package com.dossier.api.service.ent.billing;

import java.time.Instant;

/** Narrow reservation contract consumed by organization matching; the general usage API can grow behind it. */
public interface MatchingUsageLedger {

    enum ReserveStatus {
        RESERVED,
        EXISTING,
        ALREADY_RELEASED,
        ALLOWANCE_EXHAUSTED
    }

    record Request(
        Long orgId,
        Long consultantMemberId,
        Long consultantProfileId,
        Long actorMemberId,
        String actorLogin,
        String beneficiaryLogin,
        String featureKey,
        String unit,
        long quantity,
        long allowance,
        String periodKey,
        Instant periodStartAt,
        Instant periodEndAt,
        String idempotencyKey,
        String referenceType,
        Long referenceId,
        Instant now,
        long ttlSeconds
    ) {
        public Request {
            if (orgId == null || consultantMemberId == null || consultantProfileId == null || actorMemberId == null) throw new IllegalArgumentException("matching usage identities are required");
            if (featureKey == null || featureKey.isBlank() || unit == null || unit.isBlank()) throw new IllegalArgumentException("matching usage feature and unit are required");
            if (quantity < 1 || allowance < 0) throw new IllegalArgumentException("matching usage quantity is invalid");
            if (periodKey == null || periodKey.isBlank() || idempotencyKey == null || idempotencyKey.isBlank()) throw new IllegalArgumentException("matching usage period and idempotency key are required");
            if (now == null) throw new IllegalArgumentException("matching usage time is required");
            if (ttlSeconds < 1) throw new IllegalArgumentException("matching usage ttl must be positive");
        }
    }

    record Reservation(Long id, ReserveStatus status, long reservedQuantity, String eventStatus) {
        public boolean allowed() {
            return status == ReserveStatus.RESERVED || status == ReserveStatus.EXISTING;
        }

        public boolean newlyReserved() {
            return status == ReserveStatus.RESERVED;
        }
    }

    Reservation reserve(Request request);

    void commit(Long orgId, Long reservationId, long actualQuantity, Instant now);

    void release(Long orgId, Long reservationId, String reason, Instant now);
}
