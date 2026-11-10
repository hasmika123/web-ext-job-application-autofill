package com.dossier.api.service.billing.personal;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.billing.BillingScopeRouter;
import com.dossier.api.service.dto.EntitlementSetDTO;
import com.dossier.api.service.dto.EntitlementSetDTO.FeatureEntry;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@code GET /api/entitlements/me} and {@code /check} for a personal account (docs/subscriptions/09-apis.md section 3.4; story K5.7). The set is built from
 * the plan version the subscriber bought (or, for a Pro subscriber not yet linked, the PRO plan; for everyone else the FREE plan) plus the live add-ons. The
 * DTO shape is final, the SOURCE is provisional: the plan resolver (K7.1) will produce the same set and this class then reads it. Nothing here gates anything
 * yet; the gates still ask {@code EntitlementService}. An enterprise account gets the generic 404 (it never has a personal plan).
 */
@Service
@Transactional(readOnly = true)
public class PersonalEntitlementService {

    private final UserRepository users;
    private final BillingScopeRouter router;
    private final SubscriptionRepository subscriptions;
    private final PlanRepository plans;
    private final PlanVersionRepository versions;
    private final PlanComponentRepository components;
    private final FeatureDefinitionRepository features;
    private final PersonalBasket basket;

    public PersonalEntitlementService(
        UserRepository users,
        BillingScopeRouter router,
        SubscriptionRepository subscriptions,
        PlanRepository plans,
        PlanVersionRepository versions,
        PlanComponentRepository components,
        FeatureDefinitionRepository features,
        PersonalBasket basket
    ) {
        this.users = users;
        this.router = router;
        this.subscriptions = subscriptions;
        this.plans = plans;
        this.versions = versions;
        this.components = components;
        this.features = features;
        this.basket = basket;
    }

    public EntitlementSetDTO me(String login) {
        User user = users.findOneByLogin(login).orElseThrow(() -> new BillingException(401, "UNAUTHENTICATED", "Sign in to continue"));
        router.requirePersonal(user);
        Instant now = Instant.now();
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElse(null);
        boolean paid = sub != null && EntitlementService.isProFor(sub.getStatus(), sub.getCurrentPeriodEnd(), now);

        PlanVersion version = null;
        Plan plan = null;
        if (sub != null && sub.getPlanVersionId() != null) {
            version = versions.findById(sub.getPlanVersionId()).orElse(null);
            plan = version == null ? null : plans.findById(version.getPlanId()).orElse(null);
        }
        if (version == null) {
            plan = plans.findByPlanKey(paid ? "PRO" : "FREE").orElse(null);
            if (plan != null) {
                Long planId = plan.getId();
                version = versions.findLive(planId).or(() -> versions.findByPlanIdOrderByVersionDesc(planId).stream().findFirst()).orElse(null);
            }
        }

        Map<String, FeatureDefinition> defs = features.findAllByOrderBySortOrderAsc().stream().collect(Collectors.toMap(FeatureDefinition::getFeatureKey, Function.identity(), (a, b) -> a));
        List<FeatureEntry> entries = new ArrayList<>();
        if (version != null) {
            for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(version.getId())) {
                if (!"BASE".equals(c.getRole()) && !"INCLUDED".equals(c.getRole())) continue;
                FeatureDefinition d = defs.get(c.getFeatureKey());
                Long allowance = c.getAllowanceOverride() != null ? c.getAllowanceOverride() : d == null ? null : d.getDefaultAllowance();
                entries.add(entry(c.getFeatureKey(), d, "PLAN", 1, allowance));
            }
        }
        if (sub != null && paid) {
            for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
                FeatureDefinition d = defs.get(h.featureKey());
                int qty = h.row().getQuantity();
                Long unitAllowance = h.row().getAllowanceOverride() != null ? h.row().getAllowanceOverride() : d == null ? null : d.getDefaultAllowance();
                Long allowance = unitAllowance == null ? null : unitAllowance * qty;
                entries.add(entry(h.featureKey(), d, "ADDON", qty, allowance));
            }
        }
        Map<String, Long> limits = new LinkedHashMap<>();
        Set<String> capabilities = new LinkedHashSet<>();
        for (FeatureEntry e : entries) {
            capabilities.add(e.featureKey());
            FeatureDefinition d = defs.get(e.featureKey());
            if (d != null && d.getLimitKey() != null && e.allowance() != null) limits.merge(d.getLimitKey(), e.allowance(), Long::sum);
        }
        return new EntitlementSetDTO(
            plan == null ? null : plan.getPlanKey(),
            version == null ? null : version.getVersion(),
            sub == null ? null : sub.getBillingInterval(),
            sub == null ? null : sub.getCurrentPeriodStart(),
            sub == null || !paid ? null : sub.getCurrentPeriodEnd(),
            List.copyOf(entries),
            List.copyOf(capabilities),
            limits,
            null,
            state(sub, paid),
            lockedOf(user, capabilities)
        );
    }

    private com.dossier.api.service.retirement.ServiceLockService locks;

    /** Optional (story K10.6): without it the body has no {@code locked} member, exactly as before the retirement lifecycle. */
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    public void setServiceLocks(com.dossier.api.service.retirement.ServiceLockService locks) {
        this.locks = locks;
    }

    /** The services read-only after a retirement fallback, minus any the account holds again; null when there are none (the body then has no such member). */
    private List<EntitlementSetDTO.LockedEntry> lockedOf(User user, Set<String> held) {
        if (locks == null) return null;
        List<EntitlementSetDTO.LockedEntry> out = new ArrayList<>();
        for (var l : locks.live(user.getId())) {
            if (held.contains(l.featureKey())) continue;
            out.add(new EntitlementSetDTO.LockedEntry(l.featureKey(), l.name(), l.lockedSince(), l.lockedFromPlanKey()));
        }
        return out.isEmpty() ? null : List.copyOf(out);
    }

    public EntitlementSetDTO.Check check(String login, String featureKey) {
        if (featureKey == null || featureKey.isBlank()) throw new BillingException(400, "FEATURE_REQUIRED", "Name the feature to check");
        EntitlementSetDTO set = me(login);
        boolean allowed = set.capabilities().contains(featureKey.trim());
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("featureKey", featureKey.trim());
        if (set.planKey() != null) details.put("planKey", set.planKey());
        boolean locked = !allowed && set.locked() != null && set.locked().stream().anyMatch(l -> l.featureKey().equals(featureKey.trim()));
        if (locked) {
            // a service that is read-only after a retirement: readable, not usable, one tap to unlock
            details.put("lockedSince", set.locked().stream().filter(l -> l.featureKey().equals(featureKey.trim())).findFirst().get().lockedSince().toString());
            return new EntitlementSetDTO.Check(false, "FEATURE_LOCKED", details, Map.of("path", "/settings/plan"), "LOCKED");
        }
        return new EntitlementSetDTO.Check(allowed, allowed ? "OK" : "FEATURE_NOT_IN_PLAN", details, null, allowed ? "ALLOWED" : "DENIED");
    }

    private static FeatureEntry entry(String key, FeatureDefinition d, String source, int quantity, Long allowance) {
        String limit = d == null ? null : d.getLimitKey();
        return new FeatureEntry(key, d == null || d.getName() == null ? key : d.getName(), source, quantity, allowance, null, null, null, limit == null ? List.of() : List.of(limit));
    }

    private static String state(Subscription sub, boolean paid) {
        if (sub == null || !paid) return "FREE";
        if ("past_due".equalsIgnoreCase(sub.getStatus())) return "PAST_DUE";
        if (sub.isCancelAtPeriodEnd()) return "CANCEL_PENDING";
        return "ACTIVE";
    }
}
