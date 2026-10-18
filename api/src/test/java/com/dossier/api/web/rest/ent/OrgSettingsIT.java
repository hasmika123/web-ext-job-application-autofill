package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.service.ent.settings.OrgSecurityPolicy;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Organization Settings, General and Security (X2.9): validated, bounded by the admin registry, a reason for every Security change, audited, read by the
 * enforcement seams (password minimum, idle timeout), scoped to the caller's own organization and the generic 404 for everyone else.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OrgSettingsIT extends MemberItSupport {

    @Autowired
    OrgSecurityPolicy securityPolicy;

    private static String url(Organization o) {
        return "/api/orgs/" + o.getId() + "/org-settings";
    }

    @Test
    void anAdminReadsTheCurrentValuesWithTheBoundsAndTheReadOnlyLegalName() throws Exception {
        JsonNode r = json(call(login("admin"), get(url(a))));
        assertThat(r.path("general").path("legalName").asText()).isEqualTo(a.getName());
        assertThat(r.path("general").path("timeZone").asText()).isNotBlank();
        assertThat(r.path("general").path("locale").asText()).isEqualTo("en");
        assertThat(r.path("security").path("sessionTimeoutMinutes").isNull()).isTrue();
        assertThat(r.path("security").path("passwordMinLength").isNull()).isTrue();
        assertThat(r.path("security").path("bounds").path("passwordMinFloor").asInt()).isGreaterThanOrEqualTo(4);
        assertThat(r.path("security").path("reasonMinChars").asInt()).isGreaterThan(0);
        assertThat(r.path("locales")).extracting(JsonNode::asText).contains("en");
    }

    @Test
    void generalChangesAreValidatedSavedAndAudited() throws Exception {
        long before = auditCount(a, "ORG_SETTINGS");
        JsonNode r = json(call(login("admin"), put(url(a) + "/general"), "{\"displayName\":\"Acme Talent\",\"timeZone\":\"America/New_York\",\"locale\":\"en-GB\",\"contactEmail\":\"Help@Acme.example\"}"));
        assertThat(r.path("general").path("displayName").asText()).isEqualTo("Acme Talent");
        assertThat(r.path("general").path("timeZone").asText()).isEqualTo("America/New_York");
        assertThat(r.path("general").path("locale").asText()).isEqualTo("en-GB");
        assertThat(r.path("general").path("contactEmail").asText()).isEqualTo("help@acme.example");
        assertThat(r.path("general").path("legalName").asText()).isEqualTo(a.getName());
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before + 1);
        assertThat(newestAudit(a).getDetails()).contains("section=general").contains("displayName").contains("timeZone").doesNotContain("help@acme.example");
        // the same body again changes nothing and writes nothing
        call(login("admin"), put(url(a) + "/general"), "{\"displayName\":\"Acme Talent\",\"timeZone\":\"America/New_York\"}");
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before + 1);
        // an empty contact e-mail clears it; an empty display name goes back to the legal name
        JsonNode cleared = json(call(login("admin"), put(url(a) + "/general"), "{\"contactEmail\":\"\",\"displayName\":null}"));
        assertThat(cleared.path("general").path("contactEmail").isNull()).isTrue();
        assertThat(cleared.path("general").path("displayName").asText()).isEqualTo(a.getName());
    }

    @Test
    void badGeneralValuesAreRefusedNamingTheField() throws Exception {
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"timeZone\":\"Mars/Olympus\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"locale\":\"xx-ZZ\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"contactEmail\":\"not an email\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"displayName\":\"" + "x".repeat(121) + "\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"legalName\":\"Hijack\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/general"), "{\"orgId\":" + b.getId() + "}"), 422, "ORG_INVALID");
    }

    @Test
    void aSecurityChangeNeedsAReasonAndStaysInsideTheBounds() throws Exception {
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"passwordMinLength\":12}"), 400, "REASON_REQUIRED");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"passwordMinLength\":12,\"reason\":\"short\"}"), 400, "REASON_REQUIRED");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"passwordMinLength\":2,\"reason\":\"Company security review\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"passwordMinLength\":9999,\"reason\":\"Company security review\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"sessionTimeoutMinutes\":1,\"reason\":\"Company security review\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"sessionTimeoutMinutes\":99999999,\"reason\":\"Company security review\"}"), 422, "ORG_INVALID");
        assertCode(call(login("admin"), put(url(a) + "/security"), "{\"sessionTimeoutMinutes\":\"soon\",\"reason\":\"Company security review\"}"), 422, "ORG_INVALID");
        assertThat(securityPolicy.passwordMinLength(a.getId())).as("nothing was saved").isEqualTo(OrgSecurityPolicy.PLATFORM_PASSWORD_MIN);
    }

    @Test
    void aSecurityChangeIsSavedAuditedWithItsReasonAndReadByTheEnforcementSeams() throws Exception {
        long before = auditCount(a, "ORG_SETTINGS");
        JsonNode r = json(call(login("owner"), put(url(a) + "/security"), "{\"passwordMinLength\":12,\"sessionTimeoutMinutes\":120,\"reason\":\"Customer security questionnaire 2026\"}"));
        assertThat(r.path("security").path("passwordMinLength").asInt()).isEqualTo(12);
        assertThat(r.path("security").path("sessionTimeoutMinutes").asInt()).isEqualTo(120);
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before + 1);
        assertThat(newestAudit(a).getDetails()).contains("section=security").contains("passwordMinLength old=default new=12").contains("sessionTimeoutMinutes old=default new=120").contains("reason=Customer security questionnaire 2026");
        em.flush();
        em.clear();
        assertThat(securityPolicy.passwordMinLength(a.getId())).isEqualTo(12);
        assertThat(securityPolicy.passwordMinLength(b.getId())).as("another organization is untouched").isEqualTo(OrgSecurityPolicy.PLATFORM_PASSWORD_MIN);
        assertThat(securityPolicy.refreshSeconds(a.getId(), 30L * 24 * 3600)).isEqualTo(120 * 60L);
        assertThat(securityPolicy.refreshSeconds(a.getId(), 60L)).as("never longer than the platform's own").isEqualTo(60L);
        assertThat(securityPolicy.refreshSeconds(b.getId(), 3600L)).isEqualTo(3600L);
        // null puts a value back to the platform behaviour (also needs a reason)
        assertCode(call(login("owner"), put(url(a) + "/security"), "{\"passwordMinLength\":null}"), 400, "REASON_REQUIRED");
        JsonNode back = json(call(login("owner"), put(url(a) + "/security"), "{\"passwordMinLength\":null,\"reason\":\"Back to the default\"}"));
        assertThat(back.path("security").path("passwordMinLength").isNull()).isTrue();
        assertThat(back.path("security").path("sessionTimeoutMinutes").asInt()).isEqualTo(120);
    }

    @Test
    void unchangedSecurityValuesNeedNoReasonAndWriteNoAudit() throws Exception {
        long before = auditCount(a, "ORG_SETTINGS");
        assertStatus(call(login("admin"), put(url(a) + "/security"), "{\"passwordMinLength\":null}"), 200);
        assertThat(auditCount(a, "ORG_SETTINGS")).isEqualTo(before);
    }

    @Test
    void theSupportPageContactComesFromTheGeneralSettings() throws Exception {
        call(login("admin"), put(url(a) + "/general"), "{\"contactEmail\":\"support@acme.example\"}");
        em.flush();
        assertThat(contactOf(a)).isEqualTo("support@acme.example");
        assertThat(contactOf(b)).isNull();
    }

    @Autowired
    com.dossier.api.service.ent.settings.OrgSettingsService settingsService;

    private String contactOf(Organization o) {
        return settingsService.contactEmail(o.getId());
    }

    @Test
    void onlyAnOrgSettingsManagerReadsOrWritesAndEveryoneElseGetsTheGeneric404() throws Exception {
        for (String who : new String[] { "plain", "c1", "spec", "hr", "bowner" }) {
            assertGeneric404(call(login(who), get(url(a))), who + " read");
            assertGeneric404(call(login(who), put(url(a) + "/general"), "{\"timeZone\":\"UTC\"}"), who + " general");
            assertGeneric404(call(login(who), put(url(a) + "/security"), "{\"passwordMinLength\":9,\"reason\":\"Company security review\"}"), who + " security");
        }
        assertThat(securityPolicy.passwordMinLength(a.getId())).isEqualTo(OrgSecurityPolicy.PLATFORM_PASSWORD_MIN);
    }
}
