package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.consultantws.CwsSetting;
import com.dossier.api.repository.ent.consultantws.CwsSettingEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsSettingRepository;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsSettingsDemoSeeder;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Availability page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/settings}.
 * Every number is asserted against rows the test wrote, a consultant only ever reads and changes their own availability, entries and
 * preferences, every refusal of a foreign or forbidden call is the generic 404, and every free-text write is PII-scanned.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantSettingsResourceIT {

    private static final String WHO = "cws-settings-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private UserRepository users;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private OrgRoleRepository roleRows;
    @Autowired private OrgMemberRoleRepository memberRoles;
    @Autowired private OrgRoleService roleService;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private ResumeBuilderSettings cache;
    @Autowired private ConsultantProfileRepository profiles;
    @Autowired private CwsProfilePrefRepository profilePrefs;
    @Autowired private CwsSettingRepository cwsSettings;
    @Autowired private CwsSettingEventRepository eventRows;
    @Autowired private ConsultantWsSettingsDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

    private ConsultantProfile c1;
    private ConsultantProfile c2;
    private ConsultantProfile b1;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-st-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-st-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-st-a-owner", OrgRole.OWNER);
        staff(a, "cws-st-a-admin", OrgRole.ADMIN);
        staff(a, "cws-st-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-st-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-st-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-st-a-c2", "Robin Two", true);
        consultant(a, "cws-st-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-st-b-c1", "Bee Consultant", true);
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        cache.invalidate();
    }

    private void flags(boolean master, boolean rolesOn) {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":" + master + "}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":" + rolesOn + "}", WHO, Instant.now()));
        cache.invalidate();
    }

    // ---- fixtures -------------------------------------------------------------------------------------------------

    private OrgMember staff(Organization org, String login, OrgRole role) {
        OrgMember m = fx.active(org, login, role);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        roleService.syncFromLegacy(m);
        return m;
    }

    private ConsultantProfile consultant(Organization org, String login, String name, boolean withProfile) {
        OrgMember m = fx.seat(org, login, LegacyRoleMirror.toEnum(RoleTemplates.CONSULTANT).orElse(OrgRole.MEMBER), OrgMemberStatus.ACTIVE);
        m.setJoinedAt(now.minus(Duration.ofDays(100)));
        members.saveAndFlush(m);
        OrgMemberRole row = new OrgMemberRole();
        row.setOrgId(org.getId());
        row.setMemberId(m.getId());
        row.setRoleId(roleRows.findSystemByRoleKey(RoleTemplates.CONSULTANT).orElseThrow().getId());
        row.setPrimary(true);
        row.setGrantedAt(Instant.now());
        memberRoles.saveAndFlush(row);
        m.setPrimaryRoleId(row.getRoleId());
        members.saveAndFlush(m);
        if (!withProfile) return null;
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        return profiles.saveAndFlush(p);
    }
    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/settings" + tail;
    }

    private MvcResult send(MockHttpServletRequestBuilder req, String login, String body) throws Exception {
        if (body != null) req = req.contentType(MediaType.APPLICATION_JSON).content(body);
        return mockMvc.perform(req.with(user(login)).contentType(MediaType.APPLICATION_JSON)).andReturn();
    }

    private JsonNode ok(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isBetween(200, 204);
        return body.isBlank() ? om.nullNode() : om.readTree(body);
    }

    private JsonNode page(String login, Organization org) throws Exception {
        return ok(send(get(path(org.getId(), "")), login, null), "page " + login);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private void assertStatus(MvcResult r, int status, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(status);
    }

    // ---- tests ----------------------------------------------------------------------------------------------------

    private CwsProfilePref pref(ConsultantProfile c, String kind, String value, int order) {
        CwsProfilePref p = new CwsProfilePref();
        p.setOrgId(c.getOrgId());
        p.setConsultantId(c.getId());
        p.setKind(kind);
        p.setValue(value);
        p.setSortOrder(order);
        return profilePrefs.saveAndFlush(p);
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    private static String privacy(String visibility, Boolean share, Boolean contact, Boolean analytics) {
        List<String> f = new ArrayList<>();
        if (visibility != null) f.add("\"profileVisibility\":\"" + visibility + "\"");
        if (share != null) f.add("\"shareProfileWithEmployers\":" + share);
        if (contact != null) f.add("\"showContactInformation\":" + contact);
        if (analytics != null) f.add("\"allowAnalytics\":" + analytics);
        return "{" + String.join(",", f) + "}";
    }

    @Test
    void aConsultantWithNoStoredRowGetsTheSafeDefaultsAndRealProfileFacts() throws Exception {
        c1.setLocationLabel("Austin, TX");
        c1.setProfileCompleteness(64);
        profiles.saveAndFlush(c1);
        JsonNode p = page("cws-st-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("account").path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("account").path("email").asText()).isEqualTo("cws-st-a-c1@example.org");
        assertThat(p.path("account").path("location").asText()).isEqualTo("Austin, TX");
        assertThat(p.path("account").has("phone")).as("a phone number is never collected").isFalse();
        JsonNode s = p.path("settings");
        assertThat(s.path("isDefault").asBoolean()).isTrue();
        assertThat(s.path("profileVisibility").asText()).isEqualTo("ORG_ONLY");
        assertThat(s.path("shareProfileWithEmployers").asBoolean()).isFalse();
        assertThat(s.path("showContactInformation").asBoolean()).isFalse();
        assertThat(s.path("allowAnalytics").asBoolean()).isFalse();
        assertThat(s.path("theme").asText()).isEqualTo("SYSTEM");
        assertThat(s.path("language").asText()).isEqualTo("en-US");
        assertThat(s.path("timezone").asText()).isEqualTo("UTC");
        assertThat(p.path("tiles").path("profileStatus").path("percent").asInt()).isEqualTo(64);
        assertThat(p.path("tiles").path("profileStatus").path("complete").asBoolean()).isFalse();
        assertThat(p.path("tiles").path("privacy").path("level").asText()).isEqualTo("PERSONAL");
        assertThat(p.path("tiles").path("privacy").path("orgName").asText()).isEqualTo(a.getName());
        assertThat(p.path("tiles").path("connectedTools").path("connected").asInt()).isZero();
        assertThat(p.path("tiles").path("connectedTools").path("total").asInt()).isEqualTo(4);
        assertThat(texts(p.path("tools"), "state")).containsOnly("NOT_AVAILABLE").hasSize(4);
        assertThat(p.path("documents").path("resumes").asLong()).isZero();
        assertThat(p.path("activity")).isEmpty();
        String raw = p.toString().toLowerCase();
        assertThat(raw).doesNotContain("password").doesNotContain("token").doesNotContain("phone");
        assertThat(cwsSettings.findByOrgIdAndConsultantId(a.getId(), c1.getId())).as("reading never creates a row").isEmpty();
    }

    @Test
    void privacyWritesPersistChangeTheDerivedLevelAndAppendAnEvent() throws Exception {
        JsonNode p = ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("APPROVED_EMPLOYERS", true, null, true)), "privacy");
        assertThat(p.path("settings").path("isDefault").asBoolean()).isFalse();
        assertThat(p.path("settings").path("profileVisibility").asText()).isEqualTo("APPROVED_EMPLOYERS");
        assertThat(p.path("settings").path("shareProfileWithEmployers").asBoolean()).isTrue();
        assertThat(p.path("settings").path("showContactInformation").asBoolean()).as("not sent, kept").isFalse();
        assertThat(p.path("settings").path("allowAnalytics").asBoolean()).isTrue();
        assertThat(p.path("tiles").path("privacy").path("level").asText()).isEqualTo("SHARED");
        assertThat(p.path("activity").get(0).path("label").asText()).isEqualTo("Privacy settings updated");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(1);

        CwsSetting row = cwsSettings.findByOrgIdAndConsultantId(a.getId(), c1.getId()).orElseThrow();
        assertThat(row.getProfileVisibility()).isEqualTo("APPROVED_EMPLOYERS");
        assertThat(row.isAllowAnalytics()).isTrue();

        // the same values again change nothing and add no event
        ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("APPROVED_EMPLOYERS", true, null, true)), "same again");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(1);

        JsonNode q = ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("PRIVATE", false, null, null)), "private");
        assertThat(q.path("tiles").path("privacy").path("level").asText()).isEqualTo("PRIVATE");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(2);
        assertThat(page("cws-st-a-c1", a).path("settings").path("profileVisibility").asText()).isEqualTo("PRIVATE");
    }

    @Test
    void appearanceWritesPersistAndAppendAnEvent() throws Exception {
        JsonNode p = ok(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"theme\":\"DARK\",\"language\":\"fr-FR\",\"timezone\":\"America/Los_Angeles\"}"), "appearance");
        assertThat(p.path("settings").path("theme").asText()).isEqualTo("DARK");
        assertThat(p.path("settings").path("language").asText()).isEqualTo("fr-FR");
        assertThat(p.path("settings").path("timezone").asText()).isEqualTo("America/Los_Angeles");
        assertThat(p.path("activity").get(0).path("label").asText()).isEqualTo("Appearance settings updated");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(1);
        // a partial write keeps the rest
        JsonNode q = ok(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"theme\":\"light\"}"), "theme only");
        assertThat(q.path("settings").path("theme").asText()).isEqualTo("LIGHT");
        assertThat(q.path("settings").path("timezone").asText()).isEqualTo("America/Los_Angeles");
    }

    @Test
    void invalidValuesAre422AndChangeNothing() throws Exception {
        ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("ORG_ONLY", true, null, null)), "seed row");
        long events = eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId());
        assertStatus(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", "{\"profileVisibility\":\"EVERYONE\"}"), 422, "bad visibility");
        assertStatus(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"theme\":\"NEON\"}"), 422, "bad theme");
        assertStatus(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"language\":\"xx-XX\"}"), 422, "bad language");
        assertStatus(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"timezone\":\"Mars/Olympus\"}"), 422, "bad timezone");
        assertStatus(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"timezone\":\"\"}"), 422, "blank timezone");
        assertStatus(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"theme\":\"DARK\",\"timezone\":\"Nope\"}"), 422, "one good one bad: nothing applied");
        CwsSetting row = cwsSettings.findByOrgIdAndConsultantId(a.getId(), c1.getId()).orElseThrow();
        assertThat(row.getTheme()).isEqualTo("SYSTEM");
        assertThat(row.getTimezone()).isEqualTo("UTC");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(events);
    }

    @Test
    void careerPreferencesAndProfileActivityAreReadFromTheProfileTables() throws Exception {
        pref(c1, "ROLE", "Business Analyst", 0);
        pref(c1, "LOCATION", "Austin, TX", 0);
        pref(c1, "EMPLOYMENT_TYPE", "CONTRACT", 0);
        JsonNode p = page("cws-st-a-c1", a);
        assertThat(p.path("careerPreferences").path("targetRoles").get(0).asText()).isEqualTo("Business Analyst");
        assertThat(p.path("careerPreferences").path("locations").get(0).asText()).isEqualTo("Austin, TX");
        assertThat(p.path("careerPreferences").path("employmentTypes").get(0).asText()).isEqualTo("CONTRACT");
        assertThat(texts(p.path("activity"), "label")).contains("Profile updated");
    }

    @Test
    void aConsultantNeverSeesOrChangesAnotherConsultantsSettings() throws Exception {
        ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c2", privacy("PRIVATE", true, true, true)), "c2 writes");
        ok(send(put(path(a.getId(), "/appearance")), "cws-st-a-c2", "{\"theme\":\"DARK\"}"), "c2 appearance");
        JsonNode p1 = page("cws-st-a-c1", a);
        assertThat(p1.path("settings").path("isDefault").asBoolean()).isTrue();
        assertThat(p1.path("activity")).isEmpty();
        assertThat(p1.toString()).doesNotContain("Robin Two");
        ok(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("ORG_ONLY", false, false, false)), "c1 writes");
        CwsSetting second = cwsSettings.findByOrgIdAndConsultantId(a.getId(), c2.getId()).orElseThrow();
        assertThat(second.getProfileVisibility()).isEqualTo("PRIVATE");
        assertThat(second.getTheme()).isEqualTo("DARK");
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c2.getId())).isEqualTo(2);
        assertThat(page("cws-st-a-c2", a).path("activity")).hasSize(2);
    }

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), ""), null },
            new String[] { "PUT", path(a.getId(), "/privacy"), privacy("PRIVATE", null, null, null) },
            new String[] { "PUT", path(a.getId(), "/appearance"), "{\"theme\":\"DARK\"}" }
        );
        for (String login : List.of("cws-st-b-owner", "cws-st-b-c1", "ghost-login", "cws-st-a-owner", "cws-st-a-admin", "cws-st-a-marketer", "cws-st-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = "PUT".equals(route[0]) ? put(route[1]) : get(route[1]);
                assertGeneric404(send(req, login, route[2]), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(cwsSettings.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
        assertThat(eventRows.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isZero();
        assertGeneric404(send(get(path(999999999L, "")), "cws-st-a-c1", null), "an organization that does not exist");
        // a consultant of another tenant writes only into their own org
        ok(send(put(path(b.getId(), "/privacy")), "cws-st-b-c1", privacy("PRIVATE", null, null, null)), "b writes in b");
        assertThat(cwsSettings.findByOrgIdAndConsultantId(a.getId(), b1.getId())).isEmpty();
        assertThat(cwsSettings.findByOrgIdAndConsultantId(b.getId(), b1.getId())).isPresent();
        assertGeneric404(send(put(path(a.getId(), "/privacy")), "cws-st-b-c1", privacy("ORG_ONLY", null, null, null)), "b into a");
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-st-a-c1", null), "roles flag off");
        assertGeneric404(send(put(path(a.getId(), "/privacy")), "cws-st-a-c1", privacy("PRIVATE", null, null, null)), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-st-a-c1", null), "master flag off");
        assertGeneric404(send(put(path(a.getId(), "/appearance")), "cws-st-a-c1", "{\"theme\":\"DARK\"}"), "master flag off, write");
        assertThat(cwsSettings.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
    }

    @Test
    void theDemoSeederIsIdempotent() {
        seeder.seed();
        long once = cwsSettings.count();
        assertThat(seeder.seed()).isZero();
        assertThat(cwsSettings.count()).isEqualTo(once);
    }
}
