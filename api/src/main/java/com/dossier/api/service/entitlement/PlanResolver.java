package com.dossier.api.service.entitlement;

import com.dossier.api.config.Constants;
import com.dossier.api.domain.billing.EntitlementGrant;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.sub.EntitlementGrantRepository;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.entitlement.PlanData.CompLine;
import com.dossier.api.service.entitlement.PlanData.LicenseFeatureLine;
import com.dossier.api.service.entitlement.PlanData.PlanVersionData;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resolves one person's plan, add-ons and comps (personal) or license on the organization's plan version (organization) into one
 * {@link EntitlementSet} (story K7.1, docs/subscriptions/06-entitlements-and-enforcement.md section 2). It loads rows and delegates every rule to the pure
 * {@link PlanResolverCore}; nothing is cached except the catalog (60 s).
 *
 * <p>Personal: the {@code subscription} row's plan version (or the plan its label names while the link is empty), FREE's live version when nothing paid
 * applies, the live add-ons from {@link PersonalAddonSource} (none while that port has no bean) and the comp/referral grants. Organization: the
 * beneficiary's current license, its live feature rows and the SEAT_INCLUDED components of the organization plan version. An enterprise account asking for
 * a personal set gets 404 (decision O4).
 */
@Service
public class PlanResolver {

    /** License states that grant their features (a license that is ending keeps them until it ends), plus SUSPENDED which is its own state. */
    private static final Set<String> RESOLVABLE = Set.of("ACTIVE", "CANCEL_AT_PERIOD_END", "SUSPENDED");

    private final PlanCatalogReader catalog;
    private final PersonalSubscriptionReader subscriptions;
    private final ObjectProvider<PersonalAddonSource> addonSource;
    private final EntitlementGrantRepository grants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository licenseFeatures;
    private final AiPolicy aiPolicy;

    public PlanResolver(
        PlanCatalogReader catalog,
        PersonalSubscriptionReader subscriptions,
        ObjectProvider<PersonalAddonSource> addonSource,
        EntitlementGrantRepository grants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository licenseFeatures,
        AiPolicy aiPolicy
    ) {
        this.catalog = catalog;
        this.subscriptions = subscriptions;
        this.addonSource = addonSource;
        this.grants = grants;
        this.licenses = licenses;
        this.licenseFeatures = licenseFeatures;
        this.aiPolicy = aiPolicy;
    }

    public EntitlementSet resolve(EntitlementContext ctx) {
        return resolve(ctx, Instant.now());
    }

    public EntitlementSet resolve(EntitlementContext ctx, Instant now) {
        if (ctx instanceof EntitlementContext.Personal p) return resolvePersonal(p.login(), now);
        return resolveOrg((EntitlementContext.Org) ctx, now);
    }

    /** The personal set for a login (unknown logins and users without a subscription get the Free set). */
    public EntitlementSet resolvePersonal(String login) {
        return resolvePersonal(login, Instant.now());
    }

    public EntitlementSet resolvePersonal(String login, Instant now) {
        boolean enterprise = Constants.isEnterpriseLogin(login);
        Optional<PersonalSubscriptionReader.Row> row = enterprise ? Optional.empty() : subscriptions.byLogin(login);
        PlanVersionData subVersion = null;
        String interval = null;
        if (row.isPresent() && row.get().hasSubscription()) {
            PersonalSubscriptionReader.Row r = row.get();
            interval = subscriptions.intervalOf(r);
            if (r.planVersionId() != null) subVersion = catalog.version(r.planVersionId()).orElse(null);
            if (subVersion == null && r.plan() != null && !"FREE".equalsIgnoreCase(r.plan())) subVersion = catalog.liveOrFirst(r.plan().toUpperCase()).orElse(null);
            // a subscription that Stripe says is Pro but whose label is still FREE (the label is derived at write time) names its plan through the price
            if (subVersion == null && com.dossier.api.service.EntitlementService.isProFor(r.status(), r.currentPeriodEnd(), now)) subVersion = catalog.liveOrFirst("PRO").orElse(null);
        }
        long userId = row.map(PersonalSubscriptionReader.Row::userId).orElse(0L);
        List<PersonalAddonSource.Addon> addons = List.of();
        PersonalAddonSource source = addonSource.getIfAvailable();
        if (source != null && userId > 0) addons = source.liveAddons(userId, now);
        List<CompLine> comps = new ArrayList<>();
        if (userId > 0) {
            for (EntitlementGrant g : grants.findActive(userId, now)) {
                catalog.version(g.getPlanVersionId()).ifPresent(v -> comps.add(new CompLine(v, g.getStartsAt(), g.getEndsAt())));
            }
        }
        PlanCatalogReader cat = catalog;
        Map<String, Integer> quarterly = new HashMap<>(PlanResolverCore.QUARTERLY_AI_CENTS);
        quarterly.put("PRO", (int) Math.round(aiPolicy.getPro3moBudgetUsd() * 100));
        PersonalSubscriptionReader.Row r = row.orElse(null);
        PlanResolverCore.PersonalInputs in = new PlanResolverCore.PersonalInputs(
            login,
            enterprise,
            r == null ? null : r.status(),
            r == null ? null : r.currentPeriodStart(),
            r == null ? null : r.currentPeriodEnd(),
            r != null && r.cancelAtPeriodEnd(),
            interval,
            subVersion,
            cat.liveOrFirst("FREE").orElse(null),
            addons,
            comps,
            cat.features(),
            quarterly
        );
        return PlanResolverCore.resolvePersonal(in, now);
    }

    private EntitlementSet resolveOrg(EntitlementContext.Org ctx, Instant now) {
        List<ConsultantLicense> mine = licenses.findByOrgIdAndMemberIdOrderByStartsAtDesc(ctx.orgId(), ctx.beneficiaryMemberId());
        ConsultantLicense chosen = null;
        for (ConsultantLicense l : mine) {
            if (RESOLVABLE.contains(l.getStatus()) && PlanResolverCore.within(l.getStartsAt(), l.getEndsAt(), now)) {
                chosen = l;
                break;
            }
        }
        if (chosen == null && !mine.isEmpty()) chosen = mine.get(0);
        List<LicenseFeatureLine> lines = new ArrayList<>();
        if (chosen != null) {
            for (LicenseFeature f : licenseFeatures.findByOrgIdAndLicenseIdOrderByIdAsc(ctx.orgId(), chosen.getId())) {
                lines.add(new LicenseFeatureLine(f.getFeatureKey(), f.getQuantity() == null ? 1 : f.getQuantity(), f.getAllowanceOverride(), f.getStartsAt(), f.getEndsAt(), Boolean.TRUE.equals(f.getLive())));
            }
        }
        PlanResolverCore.OrgInputs in = new PlanResolverCore.OrgInputs(
            ctx.orgId(),
            ctx.beneficiaryMemberId(),
            chosen == null ? null : chosen.getStatus(),
            chosen == null ? null : chosen.getStartsAt(),
            chosen == null ? null : chosen.getEndsAt(),
            catalog.liveOrFirst("ORG_STANDARD").orElse(null),
            lines,
            catalog.features()
        );
        return PlanResolverCore.resolveOrg(in, now);
    }

    /** 404 helper for callers that must refuse an enterprise account on a personal route. */
    public static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
    }
}
