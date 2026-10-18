package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
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
import com.dossier.api.service.ent.consultant.PrepareBatchEntitlement;
import com.dossier.api.service.ent.consultant.PrepareBatchSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Organization Settings, "Prepare selected openings" (decision 2026-10-18): the Org Admin opts the organization in (off by default), may set its own limits
 * up to the platform maximum, every change is audited, the licensed-consultant count is the organization's own, the platform switch gates writes, and
 * everyone but an org-settings manager (and every other tenant) gets the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgPrepareSettingsIT extends MemberItSupport {

    private static final String WRITER = "org-prepare-settings-it";

    @Autowired PrepareBatchSettings prepareSettings;
    @Autowired ConsultantProfileRepository consultants;
    @Autowired ConsultantLicenseRepository licenses;
    @Autowired LicenseFeatureRepository licenseFeatures;
    @Autowired ProductRepository products;
    @Autowired FeatureDefinitionRepository featureDefs;

    @AfterEach
    void cleanPlatform() {
        for (AppSetting s : settingRows.findAll()) if (WRITER.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingsCache.invalidate();
    }

    private void platform(String key, String value) {
        settingRows.findById(key).ifPresent(settingRows::delete);
        settingRows.flush();
        settingRows.save(new AppSetting(key, value, WRITER, Instant.now()));
        settingsCache.invalidate();
    }

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/org-settings/prepare";
    }

    @Test
    void offByDefaultForTheOrganizationEvenWhenThePlatformHasItOn() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        JsonNode r = json(call(login("admin"), get(url(a))));
        assertThat(r.path("platformEnabled").asBoolean()).isTrue();
        assertThat(r.path("enabled").asBoolean()).as("an organization starts opted out").isFalse();
        assertThat(r.path("dailyCap").path("value").asInt()).isEqualTo(30);
        assertThat(r.path("dailyCap").path("platformMax").asInt()).isEqualTo(30);
        assertThat(r.path("dailyCap").path("custom").asBoolean()).isFalse();
        assertThat(r.path("monthlyCap").path("platformMax").asInt()).isEqualTo(300);
        assertThat(r.path("maxBatch").path("platformMax").asInt()).isEqualTo(10);
        assertThat(r.path("maxBatch").path("min").asInt()).isEqualTo(1);
        assertThat(r.path("licensed").path("featureName").asText()).isEqualTo("Autopilot prepare");
        assertThat(prepareSettings.enabledFor(a.getId())).isFalse();
    }

    @Test
    void theAdminOptsTheOrganizationInAndOutAndEachChangeIsAudited() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        long before = auditCount(a, "ORG_SETTINGS");
        JsonNode on = json(call(login("admin"), put(url(a)), "{\"enabled\":true}"));
        assertThat(on.path("enabled").asBoolean()).isTrue();
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before + 1);
        assertThat(newestAudit(a).getDetails()).contains("section=prepare").contains("enabled old=off new=on");
        assertThat(newestAudit(a).getActorLogin()).isEqualTo(login("admin"));
        em.flush();
        em.clear();
        assertThat(prepareSettings.enabledFor(a.getId())).isTrue();
        assertThat(prepareSettings.enabledFor(b.getId())).as("another organization is untouched").isFalse();
        // the same value again changes nothing and writes nothing
        call(login("admin"), put(url(a)), "{\"enabled\":true}");
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before + 1);
        JsonNode off = json(call(login("owner"), put(url(a)), "{\"enabled\":false}"));
        assertThat(off.path("enabled").asBoolean()).isFalse();
        assertThat(newestAudit(a).getDetails()).contains("enabled old=on new=off");
        em.flush();
        em.clear();
        assertThat(prepareSettings.enabledFor(a.getId())).isFalse();
    }

    @Test
    void limitsAreSavedLowerThanThePlatformClampedAboveItAndRefusedBelowTheMinimum() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        JsonNode r = json(call(login("admin"), put(url(a)), "{\"dailyCap\":12,\"monthlyCap\":120,\"maxBatch\":4}"));
        assertThat(r.path("dailyCap").path("value").asInt()).isEqualTo(12);
        assertThat(r.path("dailyCap").path("custom").asBoolean()).isTrue();
        assertThat(r.path("monthlyCap").path("value").asInt()).isEqualTo(120);
        assertThat(r.path("maxBatch").path("value").asInt()).isEqualTo(4);
        assertThat(newestAudit(a).getDetails()).contains("dailyCap old=default new=12").contains("monthlyCap old=default new=120").contains("maxBatch old=default new=4");
        em.flush();
        em.clear();
        assertThat(prepareSettings.dailyCap(a.getId())).isEqualTo(12);
        assertThat(prepareSettings.maxBatch(a.getId())).isEqualTo(4);
        assertThat(prepareSettings.dailyCap(b.getId())).isEqualTo(30);

        // above the platform maximum: kept at the maximum
        JsonNode clamped = json(call(login("admin"), put(url(a)), "{\"dailyCap\":999,\"maxBatch\":50}"));
        assertThat(clamped.path("dailyCap").path("value").asInt()).isEqualTo(30);
        assertThat(clamped.path("maxBatch").path("value").asInt()).isEqualTo(10);

        // a lower platform maximum lowers the organization at once
        platform(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "8");
        assertThat(json(call(login("admin"), get(url(a)))).path("dailyCap").path("value").asInt()).isEqualTo(8);
        assertThat(json(call(login("admin"), get(url(a)))).path("dailyCap").path("platformMax").asInt()).isEqualTo(8);

        // null goes back to following the platform
        JsonNode back = json(call(login("admin"), put(url(a)), "{\"monthlyCap\":null}"));
        assertThat(back.path("monthlyCap").path("custom").asBoolean()).isFalse();
        assertThat(back.path("monthlyCap").path("value").asInt()).isEqualTo(300);
        assertThat(newestAudit(a).getDetails()).contains("monthlyCap old=120 new=default");

        // refused: below the minimum, not a number, unknown field, not an object
        assertCode(call(login("admin"), put(url(a)), "{\"dailyCap\":0}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"dailyCap\":-3}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"maxBatch\":\"many\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"dailyCap\":2.5}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"enabled\":\"yes\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"sessionMinutes\":5}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a)), "{\"orgId\":" + b.getId() + "}"), 422, "ORG_INVALID");
    }

    @Test
    void whileThePlatformHasItOffTheSectionReadsDisabledAndNothingCanBeChanged() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "false");
        JsonNode r = json(call(login("admin"), get(url(a))));
        assertThat(r.path("platformEnabled").asBoolean()).isFalse();
        long before = auditCount(a, "ORG_SETTINGS");
        assertCode(call(login("admin"), put(url(a)), "{\"enabled\":true}"), 409, "PREPARE_PLATFORM_OFF");
        assertCode(call(login("admin"), put(url(a)), "{\"dailyCap\":5}"), 409, "PREPARE_PLATFORM_OFF");
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before);
        assertThat(prepareSettings.orgEnabled(a.getId())).isFalse();
    }

    @Test
    void theLicensedCountIsTheOrganizationsOwnActiveConsultantsWithTheAddOn() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        ConsultantProfile one = consultant(a, c1, "Anika Khan");
        ConsultantProfile two = consultant(a, c2, "Anita Rao");
        ConsultantProfile elsewhere = consultant(b, bMember, "Bea Member");
        license(a, one, true);
        license(a, two, false);
        license(b, elsewhere, true);
        JsonNode r = json(call(login("admin"), get(url(a))));
        assertThat(r.path("licensed").path("consultants").asInt()).isEqualTo(1);
        assertThat(r.path("licensed").path("total").asInt()).isEqualTo(2);
        JsonNode other = json(call(login("bowner"), get(url(b))));
        assertThat(other.path("licensed").path("consultants").asInt()).isEqualTo(1);
        assertThat(other.path("licensed").path("total").asInt()).isEqualTo(1);
    }

    @Test
    void onlyAnOrgSettingsManagerReadsOrWritesAndEveryoneElseGetsTheGeneric404() throws Exception {
        platform(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        for (String who : new String[] { "plain", "c1", "spec", "hr", "bowner" }) {
            assertGeneric404(call(login(who), get(url(a))), who + " read");
            assertGeneric404(call(login(who), put(url(a)), "{\"enabled\":true,\"dailyCap\":3}"), who + " write");
        }
        // the other tenant's owner can read and write only his own organization, never mine
        assertGeneric404(call(login("bowner"), get("/api/orgs/" + a.getId() + "/org-settings/prepare")), "second tenant, my id");
        assertStatus(call(login("bowner"), put(url(b)), "{\"enabled\":true}"), 200);
        em.flush();
        em.clear();
        assertThat(prepareSettings.orgEnabled(a.getId())).as("nothing of mine changed").isFalse();
        assertThat(prepareSettings.orgEnabled(b.getId())).isTrue();
        assertThat(prepareSettings.dailyCap(a.getId())).isEqualTo(30);
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private ConsultantProfile consultant(Organization org, com.dossier.api.domain.org.OrgMember seat, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setOrgId(org.getId());
        c.setDisplayName(name);
        c.setEmail(name.toLowerCase().replace(' ', '.') + "@example.test");
        c.setMemberId(seat.getId());
        return consultants.saveAndFlush(c);
    }

    private void license(Organization org, ConsultantProfile c, boolean withPrepare) {
        String code = "OPS-" + System.nanoTime() + "-" + c.getId();
        Instant now = Instant.now();
        Product base = new Product();
        base.setCode(code);
        base.setName("Base " + code);
        base.setKind("BASE_LICENSE");
        base.setActive(true);
        base.setSortOrder(1);
        base.setDemoData(true);
        base.setCreatedAt(now);
        base = products.save(base);
        ConsultantLicense l = new ConsultantLicense();
        l.setOrgId(org.getId());
        l.setConsultantId(c.getId());
        l.setStatus("ACTIVE");
        l.setBaseProductId(base.getId());
        l.setBaseAmountMinor(100L);
        l.setStartsAt(now.minus(30, ChronoUnit.DAYS));
        l = licenses.saveAndFlush(l);
        if (!withPrepare) return;
        if (featureDefs.findByFeatureKey(PrepareBatchEntitlement.FEATURE).isEmpty()) {
            FeatureDefinition d = new FeatureDefinition();
            d.setFeatureKey(PrepareBatchEntitlement.FEATURE);
            d.setName("Autopilot prepare");
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
        Product addon = new Product();
        addon.setCode(code + "-FEAT");
        addon.setName("Prepare " + code);
        addon.setKind("FEATURE");
        addon.setFeatureKey(PrepareBatchEntitlement.FEATURE);
        addon.setActive(true);
        addon.setSortOrder(2);
        addon.setDemoData(true);
        addon.setCreatedAt(now);
        addon = products.save(addon);
        LicenseFeature f = new LicenseFeature();
        f.setOrgId(org.getId());
        f.setLicenseId(l.getId());
        f.setFeatureKey(PrepareBatchEntitlement.FEATURE);
        f.setProductId(addon.getId());
        f.setUnitAmountMinor(100L);
        f.setQuantity(1);
        f.setStartsAt(now.minus(30, ChronoUnit.DAYS));
        f.setLive(true);
        licenseFeatures.saveAndFlush(f);
    }
}
