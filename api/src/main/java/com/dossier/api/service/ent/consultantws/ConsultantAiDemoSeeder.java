package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.DemoRoster;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The demo consultants' AI, from their LICENCE (decision 2026-11-15: organization-paid AI is for separate enterprise accounts, one budget from the
 * licence's AI add-ons). Runs only inside the enterprise demo bootstrap (never in production), for the demo organization Acme: the AI add-ons
 * {@link #AI_FEATURES} are put on the live licence of the walkthrough consultants Anika and Ben, so their monthly AI budget is the sum of those
 * services' {@code ai_budget_cents} (the catalog's own figures; {@code OrgLicenseGate.aiBudgetCents}). This replaces the platform admin's
 * per-consultant AI-quota override that {@code web/scripts/demo-setup.mjs} used to set.
 *
 * <p>The services themselves come from the subscription catalog (Liquibase {@code CatalogSeedChange}); a service that is missing is skipped with a
 * warning, never invented, so no AI budget figure is made up here. Idempotent: an add-on already on the licence is left alone, and no other seeder's
 * rows are edited.
 */
@Service
public class ConsultantAiDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantAiDemoSeeder.class);

    /** The AI add-ons of the demo consultants: tailoring, optimization, AI job matching and AI interview practice. */
    public static final List<String> AI_FEATURES = List.of(FeatureKeys.AI_RESUME_TAILORING, FeatureKeys.RESUME_OPTIMIZATION, FeatureKeys.AI_JOB_MATCHING, FeatureKeys.INTERVIEW_AI_PREP);

    static final Set<String> CONSULTANTS = Set.of(DemoRoster.anika(), DemoRoster.ben());

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final FeatureDefinitionRepository featureDefs;
    private final ProductRepository products;

    public ConsultantAiDemoSeeder(
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        FeatureDefinitionRepository featureDefs,
        ProductRepository products
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
        this.featureDefs = featureDefs;
        this.products = products;
    }

    @Transactional
    public int seed() {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElse(null);
        if (acme == null || !acme.isSeparateAccounts()) return 0;
        int made = 0;
        for (ConsultantProfile c : consultants.findByOrgId(acme.getId())) {
            if (c.getMemberId() == null || !CONSULTANTS.contains(c.getDisplayName())) continue;
            ConsultantLicense live = liveOrRevive(acme.getId(), c.getId());
            if (live == null) continue;
            for (String key : AI_FEATURES) made += ensureAddon(acme.getId(), live, key);
        }
        if (made > 0) LOG.info("Demo consultants' AI add-ons seeded ({} rows)", made);
        return made;
    }

    private int ensureAddon(Long orgId, ConsultantLicense live, String key) {
        FeatureDefinition def = featureDefs.findByFeatureKey(key).orElse(null);
        if (def == null || def.getAiBudgetCents() == null || def.getAiBudgetCents() <= 0) {
            LOG.warn("The catalog has no AI service {} with an AI budget; the demo consultants do not get it", key);
            return 0;
        }
        boolean has = features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, live.getId()).stream().anyMatch(f -> key.equals(f.getFeatureKey()));
        if (has) return 0;
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(orgId);
        f.setLicenseId(live.getId());
        f.setFeatureKey(key);
        f.setProductId(product(def).getId());
        f.setUnitAmountMinor(900L); // demo figure; real prices are admin inputs under the margin guard
        f.setQuantity(1);
        f.setStartsAt(live.getStartsAt());
        f.setLive(true);
        f.setCreatedAt(Instant.now());
        features.save(f);
        return 1;
    }

    /** The demo add-on product for a catalog service (demo data, no price): what a licence feature row points at. */
    private Product product(FeatureDefinition def) {
        String code = "DEMO_FEAT_" + def.getFeatureKey().toUpperCase(Locale.ROOT).replace('.', '_');
        return products.findByCode(code).orElseGet(() -> {
            Product p = new Product();
            p.setCode(code);
            p.setName(def.getName() + " Add-on");
            p.setKind("FEATURE");
            p.setFeatureKey(def.getFeatureKey());
            p.setDescription(def.getDescription());
            p.setActive(true);
            p.setSortOrder(def.getSortOrder() == null ? 100 : def.getSortOrder());
            p.setDemoData(true);
            p.setCreatedAt(Instant.now());
            return products.save(p);
        });
    }

    /**
     * The consultant's live licence, reviving the newest one when the billing shuffle left none ACTIVE (the same demo-only rule as
     * {@link ConsultantPrepareDemoSeeder}); null, with a warning, when the consultant has no licence at all.
     */
    private ConsultantLicense liveOrRevive(Long orgId, Long consultantId) {
        List<ConsultantLicense> all = licenses.findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, consultantId);
        ConsultantLicense live = all.stream().filter(l -> "ACTIVE".equals(l.getStatus())).findFirst().orElse(null);
        if (live != null) return live;
        if (all.isEmpty()) {
            LOG.warn("Demo consultant {} of org {} has no licence at all; the AI add-ons are not seeded", consultantId, orgId);
            return null;
        }
        ConsultantLicense l = all.get(0);
        Instant now = Instant.now();
        l.setStatus("ACTIVE");
        if (l.getStartsAt() == null || l.getStartsAt().isAfter(now)) l.setStartsAt(now.minus(1, ChronoUnit.DAYS));
        if (l.getRenewsAt() == null || l.getRenewsAt().isBefore(now)) l.setRenewsAt(l.getStartsAt().plus(365, ChronoUnit.DAYS));
        l.setEndsAt(null);
        l.setEndReason(null);
        l.setPaidThroughAt(null);
        l.setSuspendedAt(null);
        l.setSuspendReason(null);
        l.setUpdatedAt(now);
        return licenses.save(l);
    }
}
