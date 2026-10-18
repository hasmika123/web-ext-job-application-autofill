package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.billing.FeatureDefinition;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.ent.billing.ConsultantLicense;
import com.dossier.api.domain.ent.billing.LicenseFeature;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.catalog.FeatureDefinitionRepository;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.ent.billing.ConsultantLicenseRepository;
import com.dossier.api.repository.ent.billing.LicenseFeatureRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.inbox.DemoInboxApplications;
import com.dossier.api.service.inbox.InboxEntitlement;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Demo data for the consultant Inbox page (ent-inbox, docs/enterprise-v2/18-consultant-inbox.md section 7). Runs only inside the enterprise demo
 * bootstrap (never in production), and only for the demo consultant Anika:
 * <ul>
 *   <li>the add-on {@code inbox.monitoring} exists in the demo catalog and is on Anika's live license (Ben's is not, so his page shows the "not
 *       included" state; the stories switch Anika's add-on off to watch reading stop);</li>
 *   <li>two applications on her own tracker (Orbit Freight, Cedar Analytics) for the sample mailbox's mails to move.</li>
 * </ul>
 * The sample mailbox itself is {@code DemoImapGateway}; both read {@code demo/inbox-demo.json}, whose values are test values. Idempotent: every row
 * is looked up before it is made, and it never edits another seeder's rows (it adds the one add-on to a license that already exists).
 */
@Service
public class ConsultantInboxDemoSeeder {

    private static final Logger LOG = LoggerFactory.getLogger(ConsultantInboxDemoSeeder.class);
    static final String PRODUCT_CODE = "DEMO_FEAT_INBOX_MONITORING";

    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final ConsultantProfileRepository consultants;
    private final ConsultantLicenseRepository licenses;
    private final LicenseFeatureRepository features;
    private final FeatureDefinitionRepository featureDefs;
    private final ProductRepository products;
    private final DemoInboxApplications demoApplications;

    public ConsultantInboxDemoSeeder(
        OrganizationRepository orgs,
        UserRepository users,
        ConsultantProfileRepository consultants,
        ConsultantLicenseRepository licenses,
        LicenseFeatureRepository features,
        FeatureDefinitionRepository featureDefs,
        ProductRepository products,
        DemoInboxApplications demoApplications
    ) {
        this.orgs = orgs;
        this.users = users;
        this.consultants = consultants;
        this.licenses = licenses;
        this.features = features;
        this.featureDefs = featureDefs;
        this.products = products;
        this.demoApplications = demoApplications;
    }

    @Transactional
    public int seed() {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElse(null);
        if (acme == null) return 0;
        JsonNode fixture = fixture();
        int made = 0;
        Product product = ensureCatalog();
        for (JsonNode a : fixture.path("applications")) {
            User user = users.findOneByLogin(a.path("user").asText()).orElse(null);
            if (user == null) continue;
            made += ensureApplication(user, a);
        }
        ConsultantProfile anika = consultants.findByOrgId(acme.getId()).stream().filter(c -> "Anika Rao".equals(c.getDisplayName()) && c.getMemberId() != null).findFirst().orElse(null);
        if (anika != null) made += ensureAddon(acme.getId(), anika.getId(), product);
        if (made > 0) LOG.info("Consultant inbox demo seeded ({} rows)", made);
        return made;
    }

    private Product ensureCatalog() {
        Instant now = Instant.now();
        if (featureDefs.findByFeatureKey(InboxEntitlement.FEATURE).isEmpty()) {
            FeatureDefinition d = new FeatureDefinition();
            d.setFeatureKey(InboxEntitlement.FEATURE);
            d.setName("Inbox monitoring");
            d.setDescription("The consultant's own Gmail over IMAP: application mail moves their applications. The organization never sees the mail.");
            d.setUsageType("INTEGRATION");
            d.setUsageUnit("connections");
            d.setDefaultAllowance(1L);
            d.setAllowancePeriod("MONTH");
            d.setIconKey("mail");
            d.setActive(true);
            d.setSortOrder(60);
            d.setDemoData(true);
            d.setCreatedAt(now);
            featureDefs.save(d);
        }
        return products.findByCode(PRODUCT_CODE).orElseGet(() -> {
            Product p = new Product();
            p.setCode(PRODUCT_CODE);
            p.setName("Inbox monitoring Add-on");
            p.setKind("FEATURE");
            p.setFeatureKey(InboxEntitlement.FEATURE);
            p.setDescription("Connect your own Gmail and let your applications update themselves.");
            p.setActive(true);
            p.setSortOrder(60);
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
        boolean has = features.findByOrgIdAndLicenseIdOrderByIdAsc(orgId, live.getId()).stream().anyMatch(f -> InboxEntitlement.FEATURE.equals(f.getFeatureKey()));
        if (has) return 0;
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(orgId);
        f.setLicenseId(live.getId());
        f.setFeatureKey(InboxEntitlement.FEATURE);
        f.setProductId(product.getId());
        f.setUnitAmountMinor(1900L); // demo figure; real prices are admin inputs under the margin guard
        f.setQuantity(1);
        f.setStartsAt(live.getStartsAt());
        f.setLive(true);
        f.setCreatedAt(Instant.now());
        features.save(f);
        return 1;
    }

    private int ensureApplication(User user, JsonNode spec) {
        return demoApplications.ensure(user, spec.path("company").asText(), spec.path("role").asText(), ApplicationStatus.valueOf(spec.path("status").asText("APPLIED")), spec.path("daysAgo").asLong(7));
    }

    private static JsonNode fixture() {
        try (InputStream in = ConsultantInboxDemoSeeder.class.getClassLoader().getResourceAsStream("demo/inbox-demo.json")) {
            if (in == null) throw new IllegalStateException("Missing demo/inbox-demo.json");
            return new ObjectMapper().readTree(in);
        } catch (IOException e) {
            throw new IllegalStateException("Unreadable demo/inbox-demo.json", e);
        }
    }
}
