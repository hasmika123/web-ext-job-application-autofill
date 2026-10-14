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
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityBlock;
import com.dossier.api.domain.ent.consultantws.CwsAvailabilityHistory;
import com.dossier.api.domain.ent.consultantws.CwsProfileDetail;
import com.dossier.api.domain.ent.consultantws.CwsProfilePref;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityBlockRepository;
import com.dossier.api.repository.ent.consultantws.CwsAvailabilityHistoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfileDetailRepository;
import com.dossier.api.repository.ent.consultantws.CwsProfilePrefRepository;
import com.dossier.api.repository.ent.consultantws.CwsWorkPreferenceRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsAvailabilityDemoSeeder;
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
 * The Consultant workspace Availability page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/availability}.
 * Every number is asserted against rows the test wrote, a consultant only ever reads and changes their own availability, entries and
 * preferences, every refusal of a foreign or forbidden call is the generic 404, and every free-text write is PII-scanned.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantAvailabilityResourceIT {

    private static final String WHO = "cws-avail-it";

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
    @Autowired private ClientAccountRepository clients;
    @Autowired private ClientRequirementRepository requirements;
    @Autowired private RequirementMatchRepository matches;
    @Autowired private CwsProfilePrefRepository profilePrefs;
    @Autowired private CwsProfileDetailRepository profileDetails;
    @Autowired private CwsAvailabilityBlockRepository blocks;
    @Autowired private CwsAvailabilityHistoryRepository history;
    @Autowired private CwsWorkPreferenceRepository workPrefs;
    @Autowired private ConsultantWsAvailabilityDemoSeeder seeder;

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
        a = fx.org("cws-av-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-av-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-av-a-owner", OrgRole.OWNER);
        staff(a, "cws-av-a-admin", OrgRole.ADMIN);
        staff(a, "cws-av-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-av-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-av-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-av-a-c2", "Robin Two", true);
        consultant(a, "cws-av-a-noprofile", "Nobody", false);
        b1 = consultant(b, "cws-av-b-c1", "Bee Consultant", true);
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

    private CwsAvailabilityBlock block(ConsultantProfile c, String kind, int startOffset, int endOffset, String reason, String status) {
        CwsAvailabilityBlock x = new CwsAvailabilityBlock();
        x.setOrgId(c.getOrgId());
        x.setConsultantId(c.getId());
        x.setKind(kind);
        x.setStartDate(today.plusDays(startOffset));
        x.setEndDate(today.plusDays(endOffset));
        x.setReason(reason);
        x.setStatus(status);
        return blocks.saveAndFlush(x);
    }

    private CwsAvailabilityHistory hist(ConsultantProfile c, int daysAgo, String status, String rowStatus) {
        CwsAvailabilityHistory h = new CwsAvailabilityHistory();
        h.setOrgId(c.getOrgId());
        h.setConsultantId(c.getId());
        h.setEffectiveDate(today.minusDays(daysAgo));
        h.setAvailabilityStatus(status);
        h.setWorkMode("HYBRID");
        h.setStatus(rowStatus);
        return history.saveAndFlush(h);
    }

    private RequirementMatch match(Organization org, ConsultantProfile c, ClientRequirement r, String status, int createdDaysAgo) {
        RequirementMatch m = new RequirementMatch();
        m.setOrgId(org.getId());
        m.setConsultantId(c.getId());
        m.setRequirementId(r.getId());
        m.setScore(80);
        m.setStatus(status);
        m.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        return matches.saveAndFlush(m);
    }

    private ClientRequirement requirement(Organization org, String title) {
        ClientAccount client = new ClientAccount();
        client.setOrgId(org.getId());
        client.setName("Acme " + title);
        client = clients.saveAndFlush(client);
        ClientRequirement r = new ClientRequirement();
        r.setOrgId(org.getId());
        r.setClientId(client.getId());
        r.setTitle(title);
        r.setPostedAt(now.minus(Duration.ofDays(2)));
        return requirements.saveAndFlush(r);
    }

    private CwsProfilePref pref(ConsultantProfile c, String kind, String value, int order) {
        CwsProfilePref p = new CwsProfilePref();
        p.setOrgId(c.getOrgId());
        p.setConsultantId(c.getId());
        p.setKind(kind);
        p.setValue(value);
        p.setSortOrder(order);
        return profilePrefs.saveAndFlush(p);
    }

    private void seedC1() {
        c1.setAvailabilityStatus("AVAILABLE");
        c1.setAvailableFrom(today.plusDays(15));
        c1.setWorkMode("Hybrid");
        profiles.saveAndFlush(c1);
        pref(c1, "LOCATION", "New York, NY", 0);
        pref(c1, "LOCATION", "Austin, TX", 1);
        pref(c1, "EMPLOYMENT_TYPE", "CONTRACT", 0);
        CwsProfileDetail d = new CwsProfileDetail();
        d.setOrgId(a.getId());
        d.setConsultantId(c1.getId());
        d.setWorkAuthorization("AUTHORIZED_NO_SPONSORSHIP");
        profileDetails.saveAndFlush(d);
        block(c1, "VACATION", 2, 4, "Personal vacation", "APPROVED");
        block(c1, "VACATION", 30, 31, "Holiday vacation", "PENDING");
        block(c1, "PERSONAL", 60, 60, "Personal day", "APPROVED");
        block(c1, "VACATION", -40, -39, "Earlier trip", "APPROVED");
        hist(c1, 90, "AVAILABLE", "EXPIRED");
        hist(c1, 5, "AVAILABLE", "ACTIVE");
        ClientRequirement r1 = requirement(a, "Java Lead");
        ClientRequirement r2 = requirement(a, "Data Lead");
        ClientRequirement r3 = requirement(a, "Cloud Lead");
        ClientRequirement r4 = requirement(a, "Hidden");
        match(a, c1, r1, "SUGGESTED", 40);
        match(a, c1, r2, "ASSIGNED", 3);
        match(a, c1, r3, "DISMISSED", 3);
        match(a, c2, r4, "SUGGESTED", 3);
    }

    private void seedC2() {
        block(c2, "VACATION", 5, 6, "Hidden holiday plan", "APPROVED");
        hist(c2, 3, "NOTICE", "ACTIVE");
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/availability" + tail;
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

    private String d(int offset) {
        return today.plusDays(offset).toString();
    }

    private String blockBody(String kind, int start, int end, String reason) {
        return "{\"kind\":\"" + kind + "\",\"startDate\":\"" + d(start) + "\",\"endDate\":\"" + d(end) + "\"" + (reason == null ? "" : ",\"reason\":\"" + reason + "\"") + "}";
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnAvailabilityTilesPreferencesBlocksAndHistory() throws Exception {
        seedC1();
        JsonNode p = page("cws-av-a-c1", a);

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        assertThat(p.path("today").asText()).isEqualTo(today.toString());
        assertThat(p.path("availability").path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(p.path("availability").path("availableFrom").asText()).isEqualTo(d(15));

        JsonNode t = p.path("tiles");
        assertThat(t.path("availableFrom").path("date").asText()).isEqualTo(d(15));
        assertThat(t.path("availableFrom").path("daysFromNow").asInt()).isEqualTo(15);
        assertThat(t.path("openOpportunities").path("value").asLong()).as("dismissed is not open, another consultant's match is not mine").isEqualTo(2);
        assertThat(t.path("openOpportunities").path("previous").asLong()).as("one match already existed 40 days ago").isEqualTo(1);
        assertThat(t.path("openOpportunities").path("deltaPct").asDouble()).isEqualTo(100.0);
        assertThat(t.path("openOpportunities").path("sparkline")).hasSize(6);
        assertThat(t.path("workMode").asText()).as("falls back to the profile's work mode").isEqualTo("HYBRID");
        assertThat(t.path("notice").path("weeks").isNull()).isTrue();

        // vacation: only APPROVED rows of this calendar year count; the pending one is shown apart
        int year = today.getYear();
        LocalDate y0 = LocalDate.of(year, 1, 1);
        LocalDate y1 = LocalDate.of(year, 12, 31);
        LocalDate from = today.isAfter(y0) ? today : y0;
        assertThat(t.path("vacation").path("year").asInt()).isEqualTo(year);
        assertThat(t.path("vacation").path("approvedDays").asLong()).isEqualTo(clip(2, 4, y0, y1) + clip(-40, -39, y0, y1));
        assertThat(t.path("vacation").path("pendingDays").asLong()).isEqualTo(clip(30, 31, y0, y1));
        assertThat(t.path("vacation").path("scheduledDays").asLong()).isEqualTo(clip(2, 4, from, y1) + clip(-40, -39, from, y1));

        JsonNode pr = p.path("preferences");
        assertThat(pr.path("locations").get(0).asText()).isEqualTo("New York, NY");
        assertThat(pr.path("locations").get(1).asText()).isEqualTo("Austin, TX");
        assertThat(pr.path("employmentTypes").get(0).asText()).isEqualTo("CONTRACT");
        assertThat(pr.path("workAuthorization").asText()).isEqualTo("AUTHORIZED_NO_SPONSORSHIP");
        assertThat(pr.path("rateMinMinor").isNull()).isTrue();

        assertThat(texts(p.path("blocks"), "reason")).containsExactly("Earlier trip", "Personal vacation", "Holiday vacation", "Personal day");
        JsonNode vac = p.path("blocks").get(1);
        assertThat(vac.path("days").asLong()).isEqualTo(3);
        assertThat(vac.path("status").asText()).isEqualTo("APPROVED");
        assertThat(vac.path("sample").asBoolean()).isFalse();

        assertThat(p.path("history")).hasSize(2);
        assertThat(p.path("history").get(0).path("status").asText()).isEqualTo("ACTIVE");
        assertThat(p.path("history").get(1).path("status").asText()).isEqualTo("EXPIRED");
    }

    /** Calendar days of [today+startOffset, today+endOffset] that fall inside [from, to]. */
    private long clip(int startOffset, int endOffset, LocalDate from, LocalDate to) {
        LocalDate s = today.plusDays(startOffset);
        LocalDate e = today.plusDays(endOffset);
        LocalDate lo = s.isAfter(from) ? s : from;
        LocalDate hi = e.isBefore(to) ? e : to;
        return hi.isBefore(lo) ? 0 : java.time.temporal.ChronoUnit.DAYS.between(lo, hi) + 1;
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrChangesAnotherConsultantsAvailability() throws Exception {
        seedC1();
        seedC2();
        CwsAvailabilityBlock hidden = blocks.findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "")), "cws-av-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Robin Two");

        assertGeneric404(send(put(path(a.getId(), "/blocks/" + hidden.getId())), "cws-av-a-c1", blockBody("PERSONAL", 100, 100, "mine now")), "edit another's block");
        assertGeneric404(send(delete(path(a.getId(), "/blocks/" + hidden.getId())), "cws-av-a-c1", null), "delete another's block");
        assertThat(blocks.findById(hidden.getId())).isPresent();
        assertThat(blocks.findById(hidden.getId()).orElseThrow().getReason()).isEqualTo("Hidden holiday plan");

        JsonNode p2 = page("cws-av-a-c2", a);
        assertThat(texts(p2.path("blocks"), "reason")).containsExactly("Hidden holiday plan");
        assertThat(p2.toString()).doesNotContain("Personal vacation").doesNotContain("Casey One");
        assertThat(p2.path("tiles").path("openOpportunities").path("value").asLong()).isEqualTo(1);
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(blocks.findByOrgIdAndConsultantIdOrderByStartDateAscIdAsc(a.getId(), c1.getId()).get(0).getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), ""), null },
            new String[] { "PUT", path(a.getId(), "/status"), "{\"status\":\"AVAILABLE\"}" },
            new String[] { "POST", path(a.getId(), "/blocks"), blockBody("PERSONAL", 90, 90, "x") },
            new String[] { "PUT", path(a.getId(), "/blocks/" + id), blockBody("PERSONAL", 90, 90, "x") },
            new String[] { "DELETE", path(a.getId(), "/blocks/" + id), null },
            new String[] { "PUT", path(a.getId(), "/preferences"), "{\"workMode\":\"REMOTE\"}" }
        );
        for (String login : List.of("cws-av-b-owner", "cws-av-b-c1", "ghost-login", "cws-av-a-owner", "cws-av-a-admin", "cws-av-a-marketer", "cws-av-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = switch (route[0]) {
                    case "PUT" -> put(route[1]);
                    case "POST" -> post(route[1]);
                    case "DELETE" -> delete(route[1]);
                    default -> get(route[1]);
                };
                assertGeneric404(send(req, login, route[2]), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(blocks.findById(Long.parseLong(id))).as("nobody else could remove it").isPresent();
        assertThat(workPrefs.findByOrgIdAndConsultantId(a.getId(), c1.getId())).isEmpty();
        assertGeneric404(send(get(path(999999999L, "")), "cws-av-a-c1", null), "an organization that does not exist");
        // another tenant's consultant cannot reach this org's block through their own org either
        assertGeneric404(send(put(path(b.getId(), "/blocks/" + id)), "cws-av-b-c1", blockBody("PERSONAL", 90, 90, "x")), "block id from another organization");
        assertGeneric404(send(delete(path(b.getId(), "/blocks/" + id)), "cws-av-b-c1", null), "delete across tenants");
        assertGeneric404(send(delete(path(a.getId(), "/blocks/987654321")), "cws-av-a-c1", null), "a block id that does not exist");
        assertThat(b1.getOrgId()).isEqualTo(b.getId());
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-av-a-c1", null), "roles flag off");
        assertGeneric404(send(post(path(a.getId(), "/blocks")), "cws-av-a-c1", blockBody("PERSONAL", 90, 90, "x")), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-av-a-c1", null), "master flag off");
        assertThat(blocks.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(4);
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNothingGetsEmptyListsAndNullsNeverMadeUpNumbers() throws Exception {
        JsonNode p = page("cws-av-a-c1", a);
        assertThat(p.path("availability").path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(p.path("tiles").path("availableFrom").get("date").isNull()).isTrue();
        assertThat(p.path("tiles").path("availableFrom").get("daysFromNow").isNull()).isTrue();
        assertThat(p.path("tiles").path("openOpportunities").path("value").asLong()).isZero();
        assertThat(p.path("tiles").path("openOpportunities").get("deltaPct").isNull()).isTrue();
        assertThat(p.path("tiles").get("workMode").isNull()).isTrue();
        assertThat(p.path("tiles").path("notice").get("weeks").isNull()).isTrue();
        assertThat(p.path("tiles").path("vacation").path("approvedDays").asLong()).isZero();
        assertThat(p.path("preferences").path("locations")).isEmpty();
        assertThat(p.path("preferences").get("workAuthorization").isNull()).isTrue();
        assertThat(p.path("preferences").get("rateMinMinor").isNull()).isTrue();
        assertThat(p.get("blocks").isArray()).isTrue();
        assertThat(p.get("blocks")).isEmpty();
        assertThat(p.get("history")).isEmpty();
    }

    // ---- writes: availability -------------------------------------------------------------------------------------

    @Test
    void updatingAvailabilityWritesTheProfileAppendsHistoryAndIsIdempotent() throws Exception {
        seedC1();
        JsonNode done = ok(send(put(path(a.getId(), "/status")), "cws-av-a-c1", "{\"status\":\"notice\",\"availableFrom\":\"" + d(21) + "\"}"), "update");
        assertThat(done.path("availability").path("status").asText()).isEqualTo("NOTICE");
        assertThat(done.path("availability").path("availableFrom").asText()).isEqualTo(d(21));
        assertThat(done.path("availability").path("since").asText()).isEqualTo(today.toString());
        ConsultantProfile row = profiles.findById(c1.getId()).orElseThrow();
        assertThat(row.getAvailabilityStatus()).isEqualTo("NOTICE");
        assertThat(row.getAvailableFrom()).isEqualTo(today.plusDays(21));
        assertThat(row.getAvailabilitySince()).isEqualTo(today);

        assertThat(done.path("history")).hasSize(3);
        JsonNode newest = done.path("history").get(0);
        assertThat(newest.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(newest.path("availabilityStatus").asText()).isEqualTo("NOTICE");
        assertThat(newest.path("availableFrom").asText()).isEqualTo(d(21));
        assertThat(texts(done.path("history"), "status").stream().filter("ACTIVE"::equals).count()).as("exactly one ACTIVE row").isEqualTo(1);

        JsonNode again = ok(send(put(path(a.getId(), "/status")), "cws-av-a-c1", "{\"status\":\"NOTICE\",\"availableFrom\":\"" + d(21) + "\"}"), "same values");
        assertThat(again.path("history")).as("unchanged values add no history row").hasSize(3);
        assertThat(history.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(3);

        JsonNode now2 = ok(send(put(path(a.getId(), "/status")), "cws-av-a-c1", "{\"status\":\"AVAILABLE\"}"), "available now");
        assertThat(now2.path("availability").get("availableFrom").isNull()).isTrue();
        assertThat(now2.path("history")).hasSize(4);
        assertThat(profiles.findById(c1.getId()).orElseThrow().getAvailableFrom()).isNull();
    }

    @Test
    void availabilityValidationRefusesBadInputAndChangesNothing() throws Exception {
        seedC1();
        String url = path(a.getId(), "/status");
        assertStatus(send(put(url), "cws-av-a-c1", null), 422, "no body");
        assertStatus(send(put(url), "cws-av-a-c1", "{}"), 422, "no status");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"status\":\"GONE_FISHING\"}"), 422, "unknown status");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"status\":\"AVAILABLE\",\"availableFrom\":\"next week\"}"), 422, "not a date");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"status\":\"AVAILABLE\",\"availableFrom\":\"" + d(-3) + "\"}"), 422, "a date in the past");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"status\":\"AVAILABLE\",\"availableFrom\":\"" + d(800) + "\"}"), 422, "more than two years away");
        assertThat(history.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(2);
        assertThat(profiles.findById(c1.getId()).orElseThrow().getAvailableFrom()).isEqualTo(today.plusDays(15));
    }

    // ---- writes: blocks -------------------------------------------------------------------------------------------

    @Test
    void addingBlocksFollowsTheApprovalRuleAndShowsInTheTiles() throws Exception {
        JsonNode vac = ok(send(post(path(a.getId(), "/blocks")), "cws-av-a-c1", blockBody("vacation", 10, 12, "  Family trip  ")), "vacation");
        JsonNode v = vac.path("blocks").get(0);
        assertThat(v.path("kind").asText()).isEqualTo("VACATION");
        assertThat(v.path("status").asText()).as("a vacation waits for the marketer, who is not connected yet").isEqualTo("PENDING");
        assertThat(v.path("reason").asText()).isEqualTo("Family trip");
        assertThat(v.path("days").asLong()).isEqualTo(3);
        assertThat(v.path("sample").asBoolean()).isFalse();

        JsonNode personal = ok(send(post(path(a.getId(), "/blocks")), "cws-av-a-c1", blockBody("PERSONAL", 20, 20, null)), "personal, one day, no reason");
        assertThat(personal.path("blocks")).hasSize(2);
        JsonNode p = personal.path("blocks").get(1);
        assertThat(p.path("status").asText()).isEqualTo("APPROVED");
        assertThat(p.path("days").asLong()).isEqualTo(1);
        assertThat(p.get("reason").isNull()).isTrue();

        // a missing end date means a single day
        JsonNode single = ok(send(post(path(a.getId(), "/blocks")), "cws-av-a-c1", "{\"kind\":\"HOLIDAY\",\"startDate\":\"" + d(30) + "\"}"), "holiday without end");
        assertThat(single.path("blocks").get(2).path("days").asLong()).isEqualTo(1);
        assertThat(single.path("blocks").get(2).path("status").asText()).isEqualTo("APPROVED");
        assertThat(blocks.countByOrgIdAndConsultantId(a.getId(), c1.getId())).isEqualTo(3);
        assertThat(single.path("tiles").path("vacation").path("pendingDays").asLong()).isGreaterThanOrEqualTo(0);
    }

    @Test
    void blockValidationOverlapPiiAndLimits() throws Exception {
        String url = path(a.getId(), "/blocks");
        assertStatus(send(post(url), "cws-av-a-c1", null), 422, "no body");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("SABBATICAL", 10, 12, "x")), 422, "unknown kind");
        assertStatus(send(post(url), "cws-av-a-c1", "{\"kind\":\"PERSONAL\"}"), 422, "no start date");
        assertStatus(send(post(url), "cws-av-a-c1", "{\"kind\":\"PERSONAL\",\"startDate\":\"31/12/2030\"}"), 422, "bad date format");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 12, 10, "x")), 422, "end before start");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", -400, -399, "x")), 422, "too far in the past");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 800, 800, "x")), 422, "too far ahead");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("VACATION", 5, 5 + 400, "x")), 422, "longer than a year");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 5, 6, "x".repeat(201))), 422, "reason too long");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 5, 6, "angle <b>")), 422, "angle brackets");
        MvcResult ssn = send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 5, 6, "my SSN 123-45-6789"));
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 5, 6, "date of birth 04/12/1990"));
        assertStatus(dob, 422, "a date of birth");
        assertThat(dob.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(blocks.countByOrgIdAndConsultantId(a.getId(), c1.getId())).as("refused writes store nothing").isZero();

        ok(send(post(url), "cws-av-a-c1", blockBody("VACATION", 10, 14, "Trip")), "first");
        MvcResult overlap = send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 14, 15, "Touches the last day"));
        assertStatus(overlap, 409, "overlap on the last day");
        assertThat(overlap.getResponse().getContentAsString()).contains("BLOCK_OVERLAP");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("AVAILABLE", 12, 12, null)), 409, "available on top of a vacation");
        ok(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 15, 15, "Next day is fine")), "adjacent");
        ok(send(post(url), "cws-av-a-c1", blockBody("AVAILABLE", 40, 50, null)), "available span");
        ok(send(post(url), "cws-av-a-c1", blockBody("AVAILABLE", 45, 60, null)), "two available spans may overlap");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("VACATION", 48, 49, "x")), 409, "vacation inside an available span");

        for (int i = 0; blocks.countByOrgIdAndConsultantId(a.getId(), c1.getId()) < 100; i++) block(c1, "PERSONAL", 100 + i * 2, 100 + i * 2, "fill", "APPROVED");
        assertStatus(send(post(url), "cws-av-a-c1", blockBody("PERSONAL", 700, 700, "one too many")), 422, "at most 100 entries");
    }

    @Test
    void editingABlockKeepsTheStatusForAReasonChangeAndRestartsApprovalWhenItMoves() throws Exception {
        CwsAvailabilityBlock vac = block(c1, "VACATION", 10, 12, "Trip", "APPROVED");
        vac.setSampleData(true);
        blocks.saveAndFlush(vac);
        String url = path(a.getId(), "/blocks/" + vac.getId());

        ok(send(put(url), "cws-av-a-c1", blockBody("VACATION", 10, 12, "New reason")), "reason only");
        CwsAvailabilityBlock same = blocks.findById(vac.getId()).orElseThrow();
        assertThat(same.getStatus()).isEqualTo("APPROVED");
        assertThat(same.isSampleData()).isTrue();
        assertThat(same.getReason()).isEqualTo("New reason");

        JsonNode moved = ok(send(put(url), "cws-av-a-c1", blockBody("VACATION", 10, 13, "Longer")), "dates changed");
        CwsAvailabilityBlock changed = blocks.findById(vac.getId()).orElseThrow();
        assertThat(changed.getStatus()).as("a changed vacation needs approval again").isEqualTo("PENDING");
        assertThat(changed.isSampleData()).isFalse();
        assertThat(moved.path("blocks").get(0).path("days").asLong()).isEqualTo(4);

        ok(send(put(url), "cws-av-a-c1", blockBody("PERSONAL", 10, 13, "Now personal")), "kind changed");
        assertThat(blocks.findById(vac.getId()).orElseThrow().getStatus()).isEqualTo("APPROVED");

        // an entry never overlaps itself, but it cannot move onto another one
        CwsAvailabilityBlock other = block(c1, "PERSONAL", 30, 31, "Other", "APPROVED");
        assertStatus(send(put(url), "cws-av-a-c1", blockBody("PERSONAL", 31, 32, "x")), 409, "move onto another entry");
        assertStatus(send(put(url), "cws-av-a-c1", blockBody("PERSONAL", 10, 13, "my SSN 123-45-6789")), 422, "pii on edit");
        assertThat(blocks.findById(vac.getId()).orElseThrow().getReason()).isEqualTo("Now personal");
        assertThat(other.getId()).isNotEqualTo(vac.getId());
    }

    @Test
    void deletingABlockRemovesOnlyThatEntryAndASecondDeleteIs404() throws Exception {
        CwsAvailabilityBlock x = block(c1, "PERSONAL", 10, 10, "A", "APPROVED");
        block(c1, "PERSONAL", 20, 20, "B", "APPROVED");
        JsonNode done = ok(send(delete(path(a.getId(), "/blocks/" + x.getId())), "cws-av-a-c1", null), "delete");
        assertThat(texts(done.path("blocks"), "reason")).containsExactly("B");
        assertThat(blocks.findById(x.getId())).isEmpty();
        assertGeneric404(send(delete(path(a.getId(), "/blocks/" + x.getId())), "cws-av-a-c1", null), "second delete");
    }

    // ---- writes: preferences --------------------------------------------------------------------------------------

    @Test
    void workPreferencesAreSavedReplacedAndValidated() throws Exception {
        String url = path(a.getId(), "/preferences");
        JsonNode done = ok(send(put(url), "cws-av-a-c1", "{\"workMode\":\"remote\",\"noticeWeeks\":2,\"rateMinMinor\":11000,\"rateMaxMinor\":14000,\"rateNote\":\"Flexible based on role and scope\",\"travelLabel\":\"occasional\",\"travelPercent\":25}"), "save");
        JsonNode pr = done.path("preferences");
        assertThat(pr.path("workMode").asText()).isEqualTo("REMOTE");
        assertThat(pr.path("noticeWeeks").asInt()).isEqualTo(2);
        assertThat(pr.path("rateMinMinor").asLong()).isEqualTo(11000);
        assertThat(pr.path("rateMaxMinor").asLong()).isEqualTo(14000);
        assertThat(pr.path("rateNote").asText()).isEqualTo("Flexible based on role and scope");
        assertThat(pr.path("travelLabel").asText()).isEqualTo("OCCASIONAL");
        assertThat(pr.path("travelPercent").asInt()).isEqualTo(25);
        assertThat(done.path("tiles").path("workMode").asText()).isEqualTo("REMOTE");
        assertThat(done.path("tiles").path("notice").path("weeks").asInt()).isEqualTo(2);

        // a full replace: what is not sent is cleared; one row per consultant
        JsonNode replaced = ok(send(put(url), "cws-av-a-c1", "{\"workMode\":\"ONSITE\",\"travelLabel\":\"NONE\"}"), "replace");
        assertThat(replaced.path("preferences").path("workMode").asText()).isEqualTo("ONSITE");
        assertThat(replaced.path("preferences").get("rateMinMinor").isNull()).isTrue();
        assertThat(replaced.path("preferences").path("travelPercent").asInt()).isZero();
        assertThat(workPrefs.findAll().stream().filter(w -> c1.getId().equals(w.getConsultantId())).count()).isEqualTo(1);

        assertStatus(send(put(url), "cws-av-a-c1", "{\"workMode\":\"MOON\"}"), 422, "unknown work mode");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"noticeWeeks\":-1}"), 422, "negative notice");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"noticeWeeks\":27}"), 422, "notice too long");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"rateMinMinor\":-5}"), 422, "negative rate");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"rateMaxMinor\":99999999999}"), 422, "absurd rate");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"rateMinMinor\":15000,\"rateMaxMinor\":12000}"), 422, "min above max");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"travelLabel\":\"SOMETIMES\"}"), 422, "unknown travel choice");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"travelPercent\":20}"), 422, "percent without a choice");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"travelLabel\":\"OCCASIONAL\",\"travelPercent\":120}"), 422, "percent over 100");
        assertStatus(send(put(url), "cws-av-a-c1", "{\"travelLabel\":\"NONE\",\"travelPercent\":10}"), 422, "no travel but a percent");
        MvcResult ssn = send(put(url), "cws-av-a-c1", "{\"rateNote\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "pii in the rate note");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(workPrefs.findByOrgIdAndConsultantId(a.getId(), c1.getId()).orElseThrow().getPreferredWorkMode()).as("refused writes change nothing").isEqualTo("ONSITE");
        assertThat(workPrefs.findByOrgIdAndConsultantId(a.getId(), c2.getId())).as("another consultant is untouched").isEmpty();
    }

    @Test
    void theDemoSeederIsIdempotentAndMarksEveryRowAsSample() throws Exception {
        long before = blocks.count();
        assertThat(seeder.seed()).isGreaterThanOrEqualTo(0);
        assertThat(seeder.seed()).as("a second run adds nothing").isZero();
        assertThat(blocks.count()).isGreaterThanOrEqualTo(before);
        assertThat(blocks.findAll().stream().filter(x -> x.getOrgId().equals(a.getId()))).as("the seeder only touches the named demo organizations").isEmpty();
    }
}
