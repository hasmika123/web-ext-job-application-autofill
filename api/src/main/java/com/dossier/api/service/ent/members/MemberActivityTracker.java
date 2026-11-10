package com.dossier.api.service.ent.members;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * "Last active" of the Employees board (X4.3): a member's {@code org_member.last_active_at} moves forward at most once an hour, so reading the
 * board costs the member nothing and a busy person is not one UPDATE per request. The throttle is in process memory (a second API instance may
 * write once more inside the hour, which is harmless) and the UPDATE repeats the one-hour test in SQL so two instances can never move the time
 * backwards or write twice inside the window. A failure here never fails the request being served.
 */
@Component
public class MemberActivityTracker {

    private static final Logger LOG = LoggerFactory.getLogger(MemberActivityTracker.class);

    static final Duration INTERVAL = Duration.ofHours(1);
    private static final int MAX_TRACKED = 50_000;

    private final ConcurrentHashMap<Long, Instant> lastWrite = new ConcurrentHashMap<>();
    private final Clock clock;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public MemberActivityTracker() {
        this(Clock.systemUTC());
    }

    MemberActivityTracker(Clock clock) {
        this.clock = clock;
    }

    /** Records that {@code memberId} of {@code orgId} was active now, unless it was recorded within the last hour. */
    @Transactional
    public void touch(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return;
        Instant now = Instant.now(clock);
        Instant seen = lastWrite.get(memberId);
        if (seen != null && seen.plus(INTERVAL).isAfter(now)) return;
        try {
            em
                .createQuery("update OrgMember m set m.lastActiveAt = :now where m.orgId = :orgId and m.id = :id and (m.lastActiveAt is null or m.lastActiveAt < :threshold)")
                .setParameter("now", now)
                .setParameter("orgId", orgId)
                .setParameter("id", memberId)
                .setParameter("threshold", now.minus(INTERVAL))
                .executeUpdate();
            if (lastWrite.size() > MAX_TRACKED) lastWrite.clear();
            lastWrite.put(memberId, now);
        } catch (RuntimeException e) {
            LOG.debug("last_active_at not recorded for member {}: {}", memberId, e.toString());
        }
    }
}
