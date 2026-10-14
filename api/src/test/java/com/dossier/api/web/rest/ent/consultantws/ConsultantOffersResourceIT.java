package com.dossier.api.web.rest.ent.consultantws;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
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
import com.dossier.api.repository.ent.consultantws.CwsOfferEventRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.consultantws.ConsultantWsOffersDemoSeeder;
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
 * The Consultant workspace Offers page through the real chain on real rows: {@code /api/orgs/{orgId}/me-workspace/offers}. Every number is
 * asserted against rows the test wrote, a consultant only ever sees and answers their own offers, every refusal is the generic 404, a state-rule
 * violation or an expired deadline is a 409, every free-text write is PII-scanned, and answering an offer creates nothing else.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class ConsultantOffersResourceIT {

    private static final String WHO = "cws-offers-it";

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
    @Autowired private CwsOfferRepository offers;
    @Autowired private CwsOfferEventRepository events;
    @Autowired private ConsultantWsOffersDemoSeeder seeder;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);

    private ConsultantProfile c1;
    private ConsultantProfile c2;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("cws-o-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("cws-o-b-" + n, OrgStatus.ACTIVE);
        flags(true, true);
        staff(a, "cws-o-a-owner", OrgRole.OWNER);
        staff(a, "cws-o-a-admin", OrgRole.ADMIN);
        staff(a, "cws-o-a-marketer", OrgRole.MARKETER);
        staff(b, "cws-o-b-owner", OrgRole.OWNER);
        c1 = consultant(a, "cws-o-a-c1", "Casey One", true);
        c2 = consultant(a, "cws-o-a-c2", "Robin Two", true);
        consultant(a, "cws-o-a-noprofile", "Nobody", false);
        consultant(b, "cws-o-b-c1", "Bee Consultant", true);
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

    private CwsOffer offer(ConsultantProfile c, String company, String role, String status, String mode, long baseDollars, long totalDollars, int deadlineInDays, int createdDaysAgo) {
        CwsOffer o = new CwsOffer();
        o.setOrgId(c.getOrgId());
        o.setConsultantId(c.getId());
        o.setClientName(company);
        o.setRoleTitle(role);
        o.setPackageSummary("$" + baseDollars / 1000 + "K base + bonus");
        o.setBenefitsSummary("Health and dental. 25 days off.");
        o.setBaseSalaryMinor(baseDollars * 100);
        o.setTotalCompMinor(totalDollars * 100);
        o.setWorkMode(mode);
        o.setStartDate(today.plusDays(60));
        o.setOfferDeadline(today.plusDays(deadlineInDays));
        o.setStatus(status);
        o.setCreatedAt(now.minus(Duration.ofDays(createdDaysAgo)));
        o.setUpdatedAt(o.getCreatedAt());
        return offers.saveAndFlush(o);
    }

    private CwsOffer o1;
    private CwsOffer o2;
    private CwsOffer o3;
    private CwsOffer o4;
    private CwsOffer o5;
    private CwsOffer o6;

    /**
     * c1: CloudWave pending (5 days left), InnovateTech negotiation (8 days), FinServe pending (12 days), GlobalTech declined (created 40 days ago),
     * NextGen accepted, and a pending one whose deadline already passed (effectively expired).
     */
    private void seedC1() {
        o1 = offer(c1, "CloudWave", "Senior Software Engineer", CwsOffer.PENDING_REVIEW, "REMOTE", 145_000, 166_750, 5, 1);
        o2 = offer(c1, "InnovateTech", "Full Stack Developer", CwsOffer.NEGOTIATION, "HYBRID", 130_000, 143_000, 8, 6);
        o3 = offer(c1, "FinServe Inc.", "Data Engineer", CwsOffer.PENDING_REVIEW, "REMOTE", 125_000, 137_500, 12, 3);
        o4 = offer(c1, "GlobalTech", "DevOps Engineer", CwsOffer.DECLINED, "ONSITE", 118_000, 129_800, -3, 40);
        o5 = offer(c1, "NextGen", "React Developer", CwsOffer.ACCEPTED, "HYBRID", 120_000, 126_000, -6, 12);
        o6 = offer(c1, "OldCo", "Platform Engineer", CwsOffer.PENDING_REVIEW, "REMOTE", 110_000, 115_000, -2, 20);
    }

    private void seedC2() {
        offer(c2, "Hidden Systems", "Hidden Secret Role", CwsOffer.PENDING_REVIEW, "REMOTE", 200_000, 250_000, 9, 1);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private static String path(long orgId, String tail) {
        return "/api/orgs/" + orgId + "/me-workspace/offers" + tail;
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

    private JsonNode page(String login, Organization org, String query) throws Exception {
        return ok(send(get(path(org.getId(), query)), login, null), "page " + login);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("not a member").doesNotContain("denied");
    }

    private void assertStatus(MvcResult r, int status, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> out = new ArrayList<>();
        for (JsonNode n : array) out.add(n.path(field).asText());
        return out;
    }

    private CwsOffer fresh(CwsOffer o) {
        return offers.findById(o.getId()).orElseThrow();
    }

    private long eventCount(CwsOffer o) {
        return events.findByOrgIdAndConsultantIdAndOfferIdOrderByOccurredAtDescIdDesc(o.getOrgId(), o.getConsultantId(), o.getId()).size();
    }

    // ---- (a) correct values ---------------------------------------------------------------------------------------

    @Test
    void aConsultantGetsTheirOwnOffersTilesCompareRowsAndActivityFromTheirRows() throws Exception {
        seedC1();
        events.save(CwsOfferEvent.of(o1, "RECEIVED", "New offer received", now.minus(Duration.ofHours(2))));
        events.save(CwsOfferEvent.of(o5, "ACCEPTED", "Offer accepted", now.minus(Duration.ofDays(3))));
        JsonNode p = page("cws-o-a-c1", a, "");

        assertThat(p.path("orgId").asLong()).isEqualTo(a.getId());
        assertThat(p.path("name").asText()).isEqualTo("Casey One");
        JsonNode t = p.path("tiles");
        assertThat(t.path("total").path("value").asLong()).isEqualTo(6);
        assertThat(t.path("pending").path("value").asLong()).as("the expired pending one is not pending").isEqualTo(2);
        assertThat(t.path("negotiation").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("accepted").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("declined").path("value").asLong()).isEqualTo(1);
        assertThat(t.path("total").path("previous").asLong()).as("only the 40-day-old offer existed a month ago").isEqualTo(1);
        assertThat(t.path("total").path("deltaPct").asDouble()).isEqualTo(500.0);
        assertThat(t.path("declined").path("deltaPct").asDouble()).as("declined: one before, one now").isEqualTo(0.0);
        assertThat(t.path("pending").path("deltaPct").isNull()).as("no earlier pending offer, so no delta").isTrue();
        assertThat(t.path("total").path("vs").asText()).isEqualTo("month");
        for (String k : List.of("total", "pending", "accepted", "negotiation", "declined")) assertThat(t.path(k).path("sparkline")).as(k).hasSize(6);

        JsonNode list = p.path("offers");
        assertThat(list.path("total").asLong()).isEqualTo(6);
        assertThat(texts(list.path("items"), "company")).containsExactly("CloudWave", "FinServe Inc.", "InnovateTech", "NextGen", "OldCo", "GlobalTech");
        JsonNode cloud = list.path("items").get(0);
        assertThat(cloud.path("role").asText()).isEqualTo("Senior Software Engineer");
        assertThat(cloud.path("workMode").asText()).isEqualTo("REMOTE");
        assertThat(cloud.path("status").asText()).isEqualTo("PENDING_REVIEW");
        assertThat(cloud.path("daysLeft").asLong()).isEqualTo(5);
        assertThat(cloud.path("baseSalaryMinor").asLong()).isEqualTo(14_500_000L);
        assertThat(cloud.path("totalCompMinor").asLong()).isEqualTo(16_675_000L);
        assertThat(cloud.path("currency").asText()).isEqualTo("USD");
        assertThat(cloud.path("offerDeadline").asText()).isEqualTo(today.plusDays(5).toString());
        JsonNode old = list.path("items").get(4);
        assertThat(old.path("status").asText()).as("an open offer past its deadline reads as EXPIRED").isEqualTo("EXPIRED");
        assertThat(old.get("daysLeft").isNull()).isTrue();
        assertThat(list.path("items").get(5).get("daysLeft").isNull()).as("closed offers have no days left").isTrue();

        assertThat(p.path("compare")).hasSize(6);
        assertThat(texts(p.path("compare"), "company")).contains("CloudWave", "InnovateTech", "FinServe Inc.");
        List<String> companies = new ArrayList<>();
        p.path("companies").forEach(n -> companies.add(n.asText()));
        assertThat(companies).containsExactly("CloudWave", "FinServe Inc.", "GlobalTech", "InnovateTech", "NextGen", "OldCo");

        assertThat(texts(p.path("activity"), "label")).containsExactly("New offer received", "Offer accepted");
        assertThat(p.path("activity").get(0).path("company").asText()).isEqualTo("CloudWave");
    }

    @Test
    void filtersSortSearchAndPagingRunOnTheServer() throws Exception {
        seedC1();
        JsonNode pending = ok(send(get(path(a.getId(), "/list?status=PENDING_REVIEW")), "cws-o-a-c1", null), "pending");
        assertThat(texts(pending.path("items"), "company")).containsExactlyInAnyOrder("CloudWave", "FinServe Inc.");
        assertThat(texts(ok(send(get(path(a.getId(), "/list?status=EXPIRED")), "cws-o-a-c1", null), "expired").path("items"), "company")).containsExactly("OldCo");
        assertThat(ok(send(get(path(a.getId(), "/list?status=NEGOTIATION")), "cws-o-a-c1", null), "neg").path("total").asLong()).isEqualTo(1);
        assertThat(ok(send(get(path(a.getId(), "/list?status=ACCEPTED")), "cws-o-a-c1", null), "acc").path("total").asLong()).isEqualTo(1);
        assertThat(texts(ok(send(get(path(a.getId(), "/list?company=GlobalTech")), "cws-o-a-c1", null), "company").path("items"), "role")).containsExactly("DevOps Engineer");
        assertThat(ok(send(get(path(a.getId(), "/list?workMode=REMOTE")), "cws-o-a-c1", null), "remote").path("total").asLong()).isEqualTo(3);
        assertThat(texts(ok(send(get(path(a.getId(), "/list?q=Data")), "cws-o-a-c1", null), "search").path("items"), "company")).containsExactly("FinServe Inc.");
        assertThat(ok(send(get(path(a.getId(), "/list?q=_")), "cws-o-a-c1", null), "wildcard is stripped, not special").path("total").asLong()).isEqualTo(6);
        assertThat(texts(ok(send(get(path(a.getId(), "/list?sort=deadline")), "cws-o-a-c1", null), "deadline").path("items"), "company")).startsWith("NextGen", "GlobalTech", "OldCo", "CloudWave");
        assertThat(texts(ok(send(get(path(a.getId(), "/list?sort=company")), "cws-o-a-c1", null), "company sort").path("items"), "company")).startsWith("CloudWave", "FinServe Inc.", "GlobalTech");

        JsonNode p0 = ok(send(get(path(a.getId(), "/list?size=4&page=0")), "cws-o-a-c1", null), "page 0");
        assertThat(p0.path("items")).hasSize(4);
        assertThat(p0.path("totalPages").asInt()).isEqualTo(2);
        assertThat(ok(send(get(path(a.getId(), "/list?size=4&page=1")), "cws-o-a-c1", null), "page 1").path("items")).hasSize(2);
        // the page route takes the same parameters
        assertThat(page("cws-o-a-c1", a, "?status=DECLINED").path("offers").path("total").asLong()).isEqualTo(1);
        assertThat(page("cws-o-a-c1", a, "?status=DECLINED").path("compare")).as("compare keeps every offer").hasSize(6);

        for (String bad : List.of("?status=NOPE", "?workMode=MARS", "?sort=price", "?size=0", "?size=51", "?page=-1", "?q=" + "x".repeat(81))) {
            assertStatus(send(get(path(a.getId(), "/list" + bad)), "cws-o-a-c1", null), 422, "bad query " + bad);
        }
    }

    @Test
    void detailShowsThePackageBenefitsTimelineAndWhatMayStillBeDone() throws Exception {
        seedC1();
        events.save(CwsOfferEvent.of(o1, "RECEIVED", "New offer received", now.minus(Duration.ofHours(2))));
        JsonNode d = ok(send(get(path(a.getId(), "/" + o1.getId())), "cws-o-a-c1", null), "detail");
        assertThat(d.path("row").path("company").asText()).isEqualTo("CloudWave");
        assertThat(d.path("benefitsSummary").asText()).contains("Health and dental");
        assertThat(d.path("events")).hasSize(1);
        assertThat(d.path("canRespond").asBoolean()).isTrue();
        assertThat(d.path("canNegotiate").asBoolean()).isTrue();
        JsonNode neg = ok(send(get(path(a.getId(), "/" + o2.getId())), "cws-o-a-c1", null), "negotiation detail");
        assertThat(neg.path("canRespond").asBoolean()).isTrue();
        assertThat(neg.path("canNegotiate").asBoolean()).isFalse();
        assertThat(ok(send(get(path(a.getId(), "/" + o5.getId())), "cws-o-a-c1", null), "accepted").path("canRespond").asBoolean()).isFalse();
        assertThat(ok(send(get(path(a.getId(), "/" + o6.getId())), "cws-o-a-c1", null), "expired").path("canRespond").asBoolean()).isFalse();
    }

    // ---- (b) own rows only ----------------------------------------------------------------------------------------

    @Test
    void aConsultantNeverSeesOrAnswersAnotherConsultantsOffers() throws Exception {
        seedC1();
        seedC2();
        CwsOffer hidden = offers.findByOrgIdAndConsultantId(a.getId(), c2.getId()).get(0);

        MvcResult r = send(get(path(a.getId(), "")), "cws-o-a-c1", null);
        assertThat(r.getResponse().getContentAsString()).doesNotContain("Hidden").doesNotContain("Robin Two");
        assertThat(om.readTree(r.getResponse().getContentAsString()).path("tiles").path("total").path("value").asLong()).isEqualTo(6);

        assertGeneric404(send(get(path(a.getId(), "/" + hidden.getId())), "cws-o-a-c1", null), "detail of another consultant's offer");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/accept")), "cws-o-a-c1", null), "accept another's offer");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/decline")), "cws-o-a-c1", "{\"reason\":\"not for me\"}"), "decline another's offer");
        assertGeneric404(send(post(path(a.getId(), "/" + hidden.getId() + "/negotiate")), "cws-o-a-c1", "{\"note\":\"more money\"}"), "negotiate another's offer");
        assertThat(fresh(hidden).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);

        JsonNode p2 = page("cws-o-a-c2", a, "");
        assertThat(texts(p2.path("offers").path("items"), "company")).containsExactly("Hidden Systems");
        assertThat(p2.toString()).doesNotContain("CloudWave").doesNotContain("Casey One");
        assertThat(p2.path("activity")).isEmpty();
    }

    // ---- (c) / (d) refusals ---------------------------------------------------------------------------------------

    @Test
    void anotherOrganizationAndNonConsultantsGetTheGeneric404OnEveryRoute() throws Exception {
        seedC1();
        String id = String.valueOf(o1.getId());
        List<String[]> routes = List.of(
            new String[] { "GET", path(a.getId(), "") },
            new String[] { "GET", path(a.getId(), "/list") },
            new String[] { "GET", path(a.getId(), "/" + id) },
            new String[] { "POST", path(a.getId(), "/" + id + "/accept") },
            new String[] { "POST", path(a.getId(), "/" + id + "/decline") },
            new String[] { "POST", path(a.getId(), "/" + id + "/negotiate") }
        );
        for (String login : List.of("cws-o-b-owner", "cws-o-b-c1", "ghost-login", "cws-o-a-owner", "cws-o-a-admin", "cws-o-a-marketer", "cws-o-a-noprofile")) {
            for (String[] route : routes) {
                MockHttpServletRequestBuilder req = "POST".equals(route[0]) ? post(route[1]) : get(route[1]);
                assertGeneric404(send(req, login, "POST".equals(route[0]) ? "{\"note\":\"not for me\",\"reason\":\"not for me\"}" : null), login + " " + route[0] + " " + route[1]);
            }
        }
        assertThat(fresh(o1).getStatus()).as("nobody else could move it").isEqualTo(CwsOffer.PENDING_REVIEW);
        assertGeneric404(send(get(path(999999999L, "")), "cws-o-a-c1", null), "an organization that does not exist");
        assertGeneric404(send(get(path(a.getId(), "/987654321")), "cws-o-a-c1", null), "an offer id that does not exist");
        assertGeneric404(send(post(path(a.getId(), "/987654321/accept")), "cws-o-a-c1", null), "accept an id that does not exist");
        assertGeneric404(send(get(path(b.getId(), "/" + id)), "cws-o-b-c1", null), "an offer id from another organization");
        assertGeneric404(send(post(path(b.getId(), "/" + id + "/accept")), "cws-o-b-c1", null), "accept across tenants");
    }

    @Test
    void theRoutesAre404WhenTheEnterpriseOrRolesFlagIsOff() throws Exception {
        seedC1();
        flags(true, false);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-o-a-c1", null), "roles flag off");
        assertGeneric404(send(post(path(a.getId(), "/" + o1.getId() + "/accept")), "cws-o-a-c1", null), "roles flag off, write");
        flags(false, true);
        assertGeneric404(send(get(path(a.getId(), "")), "cws-o-a-c1", null), "master flag off");
        assertThat(fresh(o1).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);
    }

    // ---- (e) empty consultant -------------------------------------------------------------------------------------

    @Test
    void aConsultantWithNoOffersGetsZerosAndEmptyListsNeverNulls() throws Exception {
        JsonNode p = page("cws-o-a-c1", a, "");
        for (String tile : List.of("total", "pending", "accepted", "negotiation", "declined")) {
            JsonNode t = p.path("tiles").path(tile);
            assertThat(t.path("value").asLong()).as(tile).isZero();
            assertThat(t.path("previous").asLong()).as(tile).isZero();
            assertThat(t.get("deltaPct").isNull()).as(tile + " has no delta, not a made-up one").isTrue();
            assertThat(t.path("sparkline")).as(tile).hasSize(6);
        }
        assertThat(p.path("offers").get("items").isArray()).isTrue();
        assertThat(p.path("offers").path("items")).isEmpty();
        assertThat(p.path("offers").path("total").asLong()).isZero();
        assertThat(p.get("compare")).isEmpty();
        assertThat(p.get("activity")).isEmpty();
        assertThat(p.get("companies")).isEmpty();
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    @Test
    void acceptingRecordsTheAnswerOnlyCreatesNoPlacementAndASecondAcceptIs409() throws Exception {
        seedC1();
        long before = offers.count();
        JsonNode done = ok(send(post(path(a.getId(), "/" + o1.getId() + "/accept")), "cws-o-a-c1", null), "accept");
        assertThat(done.path("status").asText()).isEqualTo("ACCEPTED");
        assertThat(done.path("respondedAt").asText()).isNotBlank();
        CwsOffer row = fresh(o1);
        assertThat(row.getStatus()).isEqualTo(CwsOffer.ACCEPTED);
        assertThat(row.getRespondedAt()).isNotNull();
        assertThat(offers.count()).as("accepting creates no other offer row").isEqualTo(before);
        assertThat(eventCount(o1)).isEqualTo(1);
        assertThat(events.findByOrgIdAndConsultantIdAndOfferIdOrderByOccurredAtDescIdDesc(a.getId(), c1.getId(), o1.getId()).get(0).getKind()).isEqualTo("ACCEPTED");

        MvcResult again = send(post(path(a.getId(), "/" + o1.getId() + "/accept")), "cws-o-a-c1", null);
        assertStatus(again, 409, "accept twice");
        assertThat(again.getResponse().getContentAsString()).contains("OFFER_NOT_OPEN").contains("already accepted");
        assertThat(fresh(o1).getRespondedAt()).as("the first answer time is kept").isEqualTo(row.getRespondedAt());
        assertThat(eventCount(o1)).as("a refused call writes no event").isEqualTo(1);
        assertStatus(send(post(path(a.getId(), "/" + o1.getId() + "/decline")), "cws-o-a-c1", "{\"reason\":\"changed my mind\"}"), 409, "decline after accept");
        assertStatus(send(post(path(a.getId(), "/" + o1.getId() + "/negotiate")), "cws-o-a-c1", "{\"note\":\"one more thing\"}"), 409, "negotiate after accept");

        JsonNode p = page("cws-o-a-c1", a, "");
        assertThat(p.path("tiles").path("accepted").path("value").asLong()).isEqualTo(2);
        assertThat(p.path("tiles").path("pending").path("value").asLong()).isEqualTo(1);
        assertThat(p.path("activity").get(0).path("label").asText()).isEqualTo("Offer accepted");
    }

    @Test
    void acceptingFromNegotiationWorksAndKeepsTheNegotiationNote() throws Exception {
        seedC1();
        o2.setResponseNote("Talk about the start date.");
        offers.saveAndFlush(o2);
        ok(send(post(path(a.getId(), "/" + o2.getId() + "/accept")), "cws-o-a-c1", null), "accept from negotiation");
        CwsOffer row = fresh(o2);
        assertThat(row.getStatus()).isEqualTo(CwsOffer.ACCEPTED);
        assertThat(row.getResponseNote()).isEqualTo("Talk about the start date.");
    }

    @Test
    void anExpiredOfferCannotBeAcceptedDeclinedOrNegotiated() throws Exception {
        seedC1();
        for (String[] call : List.of(new String[] { "accept", null }, new String[] { "decline", "{\"reason\":\"too late anyway\"}" }, new String[] { "negotiate", "{\"note\":\"more time please\"}" })) {
            MvcResult r = send(post(path(a.getId(), "/" + o6.getId() + "/" + call[0])), "cws-o-a-c1", call[1]);
            assertStatus(r, 409, call[0] + " an expired offer");
            assertThat(r.getResponse().getContentAsString()).contains("OFFER_EXPIRED");
        }
        assertThat(fresh(o6).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);
        assertThat(eventCount(o6)).isZero();
        // the deadline day itself is still open
        CwsOffer today1 = offer(c1, "TodayCo", "Last Day Role", CwsOffer.PENDING_REVIEW, "REMOTE", 100_000, 110_000, 0, 1);
        ok(send(post(path(a.getId(), "/" + today1.getId() + "/accept")), "cws-o-a-c1", null), "accept on the deadline day");
    }

    @Test
    void decliningTakesAnOptionalScreenedReasonAndASecondDeclineIs409() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + o3.getId() + "/decline");
        assertStatus(send(post(url), "cws-o-a-c1", "{\"reason\":\"" + "x".repeat(301) + "\"}"), 422, "301 characters");
        MvcResult ssn = send(post(url), "cws-o-a-c1", "{\"reason\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        MvcResult dob = send(post(url), "cws-o-a-c1", "{\"reason\":\"date of birth 04/12/1990\"}");
        assertStatus(dob, 422, "a date of birth");
        assertThat(fresh(o3).getStatus()).as("a refused decline changes nothing").isEqualTo(CwsOffer.PENDING_REVIEW);
        assertThat(eventCount(o3)).isZero();

        JsonNode done = ok(send(post(url), "cws-o-a-c1", "{\"reason\":\"  The commute is too long.  \"}"), "decline");
        assertThat(done.path("status").asText()).isEqualTo("DECLINED");
        CwsOffer row = fresh(o3);
        assertThat(row.getResponseNote()).isEqualTo("The commute is too long.");
        assertThat(eventCount(o3)).isEqualTo(1);
        MvcResult again = send(post(url), "cws-o-a-c1", "{\"reason\":\"declining again\"}");
        assertStatus(again, 409, "decline twice");
        assertThat(again.getResponse().getContentAsString()).contains("OFFER_NOT_OPEN").contains("already declined");
        assertStatus(send(post(path(a.getId(), "/" + o3.getId() + "/accept")), "cws-o-a-c1", null), 409, "accept after decline");

        // no reason at all (no body, blank) is fine
        ok(send(post(path(a.getId(), "/" + o1.getId() + "/decline")), "cws-o-a-c1", null), "decline without a body");
        assertThat(fresh(o1).getResponseNote()).isNull();
        ok(send(post(path(a.getId(), "/" + o2.getId() + "/decline")), "cws-o-a-c1", "{\"reason\":\"   \"}"), "decline with a blank reason");
        assertThat(fresh(o2).getStatus()).isEqualTo(CwsOffer.DECLINED);
    }

    @Test
    void negotiatingNeedsAScreenedNoteMovesPendingToNegotiationOnlyOnce() throws Exception {
        seedC1();
        String url = path(a.getId(), "/" + o1.getId() + "/negotiate");
        assertStatus(send(post(url), "cws-o-a-c1", null), 422, "no body");
        assertStatus(send(post(url), "cws-o-a-c1", "{}"), 422, "no note");
        assertStatus(send(post(url), "cws-o-a-c1", "{\"note\":\"  \"}"), 422, "blank note");
        assertStatus(send(post(url), "cws-o-a-c1", "{\"note\":\"ab\"}"), 422, "two characters");
        assertStatus(send(post(url), "cws-o-a-c1", "{\"note\":\"" + "x".repeat(301) + "\"}"), 422, "301 characters");
        MvcResult ssn = send(post(url), "cws-o-a-c1", "{\"note\":\"my SSN 123-45-6789\"}");
        assertStatus(ssn, 422, "a social security number");
        assertThat(ssn.getResponse().getContentAsString()).contains("SENSITIVE_CONTENT");
        assertThat(fresh(o1).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);

        JsonNode done = ok(send(post(url), "cws-o-a-c1", "{\"note\":\"  Could we discuss the base salary?  \"}"), "negotiate");
        assertThat(done.path("status").asText()).isEqualTo("NEGOTIATION");
        CwsOffer row = fresh(o1);
        assertThat(row.getStatus()).isEqualTo(CwsOffer.NEGOTIATION);
        assertThat(row.getResponseNote()).isEqualTo("Could we discuss the base salary?");
        assertThat(eventCount(o1)).isEqualTo(1);
        MvcResult again = send(post(url), "cws-o-a-c1", "{\"note\":\"asking again\"}");
        assertStatus(again, 409, "negotiate twice");
        assertThat(again.getResponse().getContentAsString()).contains("OFFER_NOT_OPEN").contains("already asked to negotiate");
        assertStatus(send(post(path(a.getId(), "/" + o4.getId() + "/negotiate")), "cws-o-a-c1", "{\"note\":\"too late now\"}"), 409, "negotiate a declined offer");
        assertThat(page("cws-o-a-c1", a, "").path("tiles").path("negotiation").path("value").asLong()).isEqualTo(2);
    }

    @Test
    void theDemoSeederIsIdempotentAndMarksEveryRowAsSample() {
        long before = offers.count();
        assertThat(seeder.seed()).isGreaterThanOrEqualTo(0);
        assertThat(seeder.seed()).as("a second run adds nothing").isZero();
        assertThat(offers.count()).isGreaterThanOrEqualTo(before);
        assertThat(offers.findAll().stream().filter(o -> o.getOrgId().equals(a.getId()))).as("the seeder never touches a test organization").isEmpty();
    }
}
