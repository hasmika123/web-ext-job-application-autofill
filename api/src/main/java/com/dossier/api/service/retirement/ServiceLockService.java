package com.dossier.api.service.retirement;

import com.dossier.api.domain.sub.ServiceLock;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.ServiceLockRepository;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.PlanResolver;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read-only lock a Free fallback leaves behind (docs/subscriptions/11 sections 7.1 and 7.2; story K10.5 and K10.6). A lock row says "this person held this service and
 * Free does not include it": the service answers {@code LOCKED} (reads fine, writes refused {@code FEATURE_LOCKED}) instead of an anonymous {@code DENIED}. A lock is an
 * overlay and never a source of entitlement: {@code EntitlementService} asks whether the feature is held FIRST, so a person who picks a plan or add-on that includes it again
 * is {@code ALLOWED} on the very next call with no job in between; {@link #reconcile} only closes the rows afterwards, for tidiness and for the history.
 * Nothing here deletes or hides any data: a lock has no effect on lists, downloads, exports or deleting your own rows.
 */
@Service
public class ServiceLockService {

    private static final Logger LOG = LoggerFactory.getLogger(ServiceLockService.class);

    /** A live lock as the gates and the pages need it. */
    public record Lock(String featureKey, String name, Instant lockedSince, String lockedFromPlanKey) {}

    private final ServiceLockRepository locks;
    private final FeatureDefinitionRepository features;
    private final PlanVersionRepository versions;
    private final PlanRepository plans;
    private final UserRepository users;
    private final PlanResolver resolver;

    public ServiceLockService(
        ServiceLockRepository locks,
        FeatureDefinitionRepository features,
        PlanVersionRepository versions,
        PlanRepository plans,
        UserRepository users,
        PlanResolver resolver
    ) {
        this.locks = locks;
        this.features = features;
        this.versions = versions;
        this.plans = plans;
        this.users = users;
        this.resolver = resolver;
    }

    /** Lock {@code featureKeys} for a user (idempotent: a feature already locked keeps its row). Returns how many new rows were written. */
    @Transactional
    public int lock(Long userId, Collection<String> featureKeys, Long fromPlanVersionId, Long retirementId, Instant now) {
        int n = 0;
        for (String key : featureKeys) {
            if (locks.findFirstByUserIdAndFeatureKeyAndReleasedAtIsNull(userId, key).isPresent()) continue;
            ServiceLock l = new ServiceLock();
            l.setUserId(userId);
            l.setFeatureKey(key);
            l.setLockedAt(now);
            l.setLockedFromPlanVersionId(fromPlanVersionId);
            l.setRetirementId(retirementId);
            l.setReason(ServiceLock.REASON_FALLBACK);
            locks.save(l);
            n++;
        }
        return n;
    }

    /** The live lock of one service for one account, if any. */
    @Transactional(readOnly = true)
    public Optional<Lock> live(Long userId, String featureKey) {
        return locks.findFirstByUserIdAndFeatureKeyAndReleasedAtIsNull(userId, featureKey).map(this::view);
    }

    /** The live lock of one service for the account with this login, if any (the gates know logins). */
    @Transactional(readOnly = true)
    public Optional<Lock> liveByLogin(String login, String featureKey) {
        return users.findOneByLogin(login).flatMap(u -> live(u.getId(), featureKey));
    }

    /** Every live lock of an account, oldest first. Callers drop the ones whose feature is held again ({@code EntitlementService.has}) before showing them. */
    @Transactional(readOnly = true)
    public List<Lock> live(Long userId) {
        List<Lock> out = new ArrayList<>();
        for (ServiceLock l : locks.findByUserIdAndReleasedAtIsNullOrderByIdAsc(userId)) out.add(view(l));
        return out;
    }

    /** Close the lock rows of an account whose feature the resolver says is held now (an upgrade or an add-on). Returns how many were closed. */
    @Transactional
    public int reconcile(Long userId, String login) {
        List<ServiceLock> live = locks.findByUserIdAndReleasedAtIsNullOrderByIdAsc(userId);
        if (live.isEmpty()) return 0;
        EntitlementSet set;
        try {
            set = resolver.resolvePersonal(login);
        } catch (RuntimeException e) {
            LOG.debug("lock reconcile skipped for user {}: {}", userId, e.toString());
            return 0;
        }
        Instant now = Instant.now();
        int n = 0;
        for (ServiceLock l : live) {
            if (set.has(l.getFeatureKey())) {
                l.setReleasedAt(now);
                locks.save(l);
                n++;
            }
        }
        return n;
    }

    /** The same for every account that has a live lock (hourly housekeeping; the gates never wait for it). */
    public int reconcileAll() {
        int n = 0;
        for (Long userId : locks.findUsersWithLiveLocks()) {
            try {
                String login = users.findById(userId).map(u -> u.getLogin()).orElse(null);
                if (login != null) n += reconcile(userId, login);
            } catch (RuntimeException e) {
                LOG.warn("lock reconcile failed for user {}: {}", userId, e.toString());
            }
        }
        return n;
    }

    private Lock view(ServiceLock l) {
        String name = features.findByFeatureKey(l.getFeatureKey()).map(d -> d.getName() == null || d.getName().isBlank() ? l.getFeatureKey() : d.getName()).orElse(l.getFeatureKey());
        String from = l.getLockedFromPlanVersionId() == null ? null : versions.findById(l.getLockedFromPlanVersionId()).flatMap(v -> plans.findById(v.getPlanId())).map(p -> p.getPlanKey()).orElse(null);
        return new Lock(l.getFeatureKey(), name, l.getLockedAt(), from);
    }
}
