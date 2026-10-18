package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.consultant.PrepareBatchEntitlement;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for "Prepare selected openings" (decision 2026-10-18: the Org Admin controls it). Runs only inside the enterprise demo bootstrap (never in
 * production), for the demo organization Acme:
 * <ul>
 *   <li>the Kiwiply master switch is turned on, but only when nobody has set it yet (a value an admin chose is never overwritten);</li>
 *   <li>Acme's own opt-in is turned on (it is OFF by default for every organization);</li>
 *   <li>the add-on {@value PrepareBatchEntitlement#FEATURE} ("Autopilot prepare") is on the live license of the demo consultants Anika and Ben, the way
 *       {@link ConsultantInboxDemoSeeder} does it for the inbox, so the Assigned openings page shows the checkboxes.</li>
 * </ul>
 * Idempotent: every row is looked up before it is made, and no other seeder's rows are edited.
 */
@Service
public class ConsultantPrepareDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantPrepareDemoSeeder.class);
    static final String PRODUCT_CODE = "DEMO_FEAT_AUTOMATION_APPROVED_APPLY";
    static final Set<String> CONSULTANTS = Set.of("Anika Rao", "Ben Okafor");
    private static final String WHO = "enterprise-demo-seed";

    private final OrganizationRepository orgs;
    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final FeatureDefinitionRepository featureDefs;
    private final ProductRepository products;
    private final OrgSettingRepository orgSettings;
    private final AppSettingRepository platformSettings;
    private final ResumeBuilderSettings settings;

    public ConsultantPrepareDemoSeeder(
        OrganizationRepository orgs,
        ConsultantProfileRepository consultants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        FeatureDefinitionRepository featureDefs,
        ProductRepository products,
        OrgSettingRepository orgSettings,
        AppSettingRepository platformSettings,
        ResumeBuilderSettings settings
    ) {
        this.orgs = orgs;
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
        this.featureDefs = featureDefs;
        this.products = products;
        this.orgSettings = orgSettings;
        this.platformSettings = platformSettings;
        this.settings = settings;
    }

    @Transactional
    public int seed() {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElse(null);
        if (acme == null) return 0;
        int made = 0;
        made += ensurePlatformSwitch();
        made += ensureOrgSwitch(acme.getId());
        Product product = ensureCatalog();
        for (ConsultantProfile c : consultants.findByOrgId(acme.getId())) {
            if (c.getMemberId() != null && CONSULTANTS.contains(c.getDisplayName())) made += ensureAddon(acme.getId(), c.getId(), product);
        }
        if (made > 0) {
            settings.invalidate();
            LOG.info("Prepare selected openings demo seeded ({} rows)", made);
        }
        return made;
    }

    /** The master switch, set only when no row exists yet. */
    private int ensurePlatformSwitch() {
        if (platformSettings.findById(EnterpriseSettingKeys.PREPARE_ENABLED).isPresent()) return 0;
        platformSettings.save(new AppSetting(EnterpriseSettingKeys.PREPARE_ENABLED, "true", WHO, Instant.now()));
        return 1;
    }

    /** Acme's opt-in, set only when the organization has no row yet (an Org Admin's own choice is never overwritten). */
    private int ensureOrgSwitch(Long orgId) {
        if (orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.PREPARE_ENABLED).isPresent()) return 0;
        OrgSetting s = new OrgSetting();
        s.setOrgId(orgId);
        s.setSettingKey(EnterpriseSettingKeys.PREPARE_ENABLED);
        s.setValueJson("true");
        s.setUpdatedBy(WHO);
        orgSettings.saveAndFlush(s);
        return 1;
    }

    private Product ensureCatalog() {
        Instant now = Instant.now();
        if (featureDefs.findByFeatureKey(PrepareBatchEntitlement.FEATURE).isEmpty()) {
            FeatureDefinition d = new FeatureDefinition();
            d.setFeatureKey(PrepareBatchEntitlement.FEATURE);
            d.setName("Autopilot prepare");
            d.setDescription("Prepares approved applications in your own browser and stops before submit. You always submit.");
            d.setUsageType("AI_FEATURE");
            d.setUsageUnit("operations");
            d.setDefaultAllowance(300L);
            d.setAllowancePeriod("MONTH");
            d.setActive(true);
            d.setSortOrder(120);
            d.setDemoData(true);
            d.setCreatedAt(now);
            featureDefs.save(d);
        }
        return products.findByCode(PRODUCT_CODE).orElseGet(() -> {
            Product p = new Product();
            p.setCode(PRODUCT_CODE);
            p.setName("Autopilot prepare Add-on");
            p.setKind("FEATURE");
            p.setFeatureKey(PrepareBatchEntitlement.FEATURE);
            p.setDescription("Prepare selected openings in your own browser; you review and submit.");
            p.setActive(true);
            p.setSortOrder(120);
            p.setDemoData(true);
            p.setCreatedAt(now);
            return products.save(p);
        });
    }

    private int ensureAddon(Long orgId, Long consultantId, Product product) {
        ConsultantLicense live = licenses
            .findByOrgIdAndConsultantIdOrderByStartsAtDesc(orgId, consultantId)
            .stream()
            .filter(l -> "ACTIVE".equals(l.getStatus()))
            .findFirst()
            .orElse(null);
        if (live == null) return 0; // no live license to put it on: the billing seed decides that, never this one
        boolean has = features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, live.getId()).stream().anyMatch(f -> PrepareBatchEntitlement.FEATURE.equals(f.getFeatureKey()));
        if (has) return 0;
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(orgId);
        f.setLicenseId(live.getId());
        f.setFeatureKey(PrepareBatchEntitlement.FEATURE);
        f.setProductId(product.getId());
        f.setUnitAmountMinor(1900L); // demo figure; real prices are admin inputs under the margin guard
        f.setQuantity(1);
        f.setStartsAt(live.getStartsAt());
        f.setLive(true);
        f.setCreatedAt(Instant.now());
        features.save(f);
        return 1;
    }
}
