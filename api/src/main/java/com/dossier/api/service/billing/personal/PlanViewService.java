package com.dossier.api.service.billing.personal;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.Plan;
import com.dossier.api.domain.catalog.PlanComponent;
import com.dossier.api.domain.catalog.PlanVersion;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PlanComponentRepository;
import com.dossier.api.repository.sub.PlanRepository;
import com.dossier.api.repository.sub.PlanVersionRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.dto.PlanDTO;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * {@code GET /api/billing/me} v3 (docs/subscriptions/09-apis.md section 3.3; story K5.7): today's {@link PlanDTO} plus the plan link, the held add-ons and
 * what the subscription bills. The v1 body is computed by {@link EntitlementService} exactly as before; this class only ADDS fields, and only for a
 * subscription already linked to a plan version, so a Free or not-yet-linked subscriber sees the v1 body unchanged. Read-only.
 *
 * <p>The usage meters, limits and past-due / lapse blocks of the full v3 shape come from the plan resolver (K7.x) and are added there.
 */
@Service
@Transactional(readOnly = true)
public class PlanViewService {

    private final EntitlementService entitlements;
    private final SubscriptionRepository subscriptions;
    private final PlanVersionRepository versions;
    private final PlanRepository plans;
    private final PlanComponentRepository components;
    private final FeatureDefinitionRepository features;
    private final PersonalBasket basket;
    private final PersonalSubscriptionChangeRepository changes;
    private final PriceLookupRepository priceLookup;
    private final ProductPriceRepository productPrices;

    public PlanViewService(
        EntitlementService entitlements,
        SubscriptionRepository subscriptions,
        PlanVersionRepository versions,
        PlanRepository plans,
        PlanComponentRepository components,
        FeatureDefinitionRepository features,
        PersonalBasket basket,
        PersonalSubscriptionChangeRepository changes,
        PriceLookupRepository priceLookup,
        ProductPriceRepository productPrices
    ) {
        this.entitlements = entitlements;
        this.subscriptions = subscriptions;
        this.versions = versions;
        this.plans = plans;
        this.components = components;
        this.features = features;
        this.basket = basket;
        this.changes = changes;
        this.priceLookup = priceLookup;
        this.productPrices = productPrices;
    }

    /** The plan view for the authenticated user. */
    public PlanDTO currentUserPlan() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return plan(login);
    }

    public PlanDTO plan(String login) {
        PlanDTO v1 = entitlements.plan(login);
        if (Constants.isEnterpriseLogin(login)) return v1;
        Subscription sub = subscriptions.findOneByUserLogin(login).orElse(null);
        if (sub == null || sub.getPlanVersionId() == null) return v1;
        PlanVersion version = versions.findById(sub.getPlanVersionId()).orElse(null);
        Plan plan = version == null ? null : plans.findById(version.getPlanId()).orElse(null);
        if (plan == null) return v1;

        Instant now = Instant.now();
        Map<String, FeatureDefinition> defs = features.findAllByOrderBySortOrderAsc().stream().collect(Collectors.toMap(FeatureDefinition::getFeatureKey, Function.identity(), (a, b) -> a));
        List<PlanDTO.Addon> addons = new ArrayList<>();
        Set<String> featureKeys = new LinkedHashSet<>();
        for (PlanComponent c : components.findByPlanVersionIdOrderBySortOrderAscIdAsc(version.getId())) {
            if ("BASE".equals(c.getRole()) || "INCLUDED".equals(c.getRole())) featureKeys.add(c.getFeatureKey());
        }
        long recurring = 0;
        ProductPrice base = sub.getPriceId() == null ? null : priceLookup.findFirstByStripePriceId(sub.getPriceId()).orElse(null);
        for (PersonalBasket.Held h : basket.held(sub.getId(), now)) {
            ProductPrice p = productPrices.findById(h.row().getPriceId()).orElse(null);
            Long unit = p == null ? null : p.getAmountMinor();
            FeatureDefinition d = defs.get(h.featureKey());
            Integer pending = h.scheduled() != null && h.row().getEndsAt() == null ? h.effectiveQuantity() : null;
            addons.add(new PlanDTO.Addon(h.featureKey(), d == null ? h.featureKey() : d.getName(), h.row().getQuantity(), unit, h.row().getEndsAt(), pending));
            featureKeys.add(h.featureKey());
            if (unit != null) recurring += unit * h.effectiveQuantity();
        }
        Long recurringMinor = base == null ? null : recurring + base.getAmountMinor();
        List<PlanDTO.PendingChange> pendingChanges = changes
            .findBySubscriptionIdAndStatusInOrderByIdAsc(sub.getId(), List.of("PENDING", "APPLYING", "FAILED"))
            .stream()
            .filter(c -> c.getEffectiveAt() != null && c.getEffectiveAt().isAfter(now) && (SubscriptionChangeApplier.isSwitch(c) || (c.getQuantityTo() != null && c.getQuantityFrom() != null && c.getQuantityTo() < c.getQuantityFrom())))
            .map(PlanViewService::pending)
            .toList();
        return new PlanDTO(
            v1.plan(),
            v1.status(),
            v1.currentPeriodEnd(),
            v1.cancelAtPeriodEnd(),
            v1.billingEnabled(),
            v1.hasCustomer(),
            plan.getPlanKey(),
            version.getVersion(),
            plan.getName(),
            sub.getBillingInterval(),
            sub.getCurrency(),
            sub.getCurrentPeriodStart(),
            recurringMinor,
            List.copyOf(addons),
            List.copyOf(featureKeys),
            List.copyOf(pendingChanges)
        );
    }

    private static PlanDTO.PendingChange pending(PersonalSubscriptionChange c) {
        return new PlanDTO.PendingChange(c.getId(), c.getKind(), c.getFeatureKey(), c.getQuantityFrom(), c.getQuantityTo(), c.getEffectiveAt(), c.getStatus());
    }
}
