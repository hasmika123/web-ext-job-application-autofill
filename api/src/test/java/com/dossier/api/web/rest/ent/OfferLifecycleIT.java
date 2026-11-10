package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.ent.consultantws.CwsOffer;
import com.dossier.api.domain.ent.consultantws.CwsOfferEvent;
import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.ent.consultantws.CwsOfferRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.offers.OfferCommandService;
import com.dossier.api.service.ent.offers.OfferExpiryJob;
import com.dossier.api.service.ent.placements.PlacementStartJob;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
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
 * The offers-to-placement lifecycle (X9.8, X10.4, X10.6) through the real chain with a second tenant: the Account Manager side RECORDS an offer
 * ({@code /api/orgs/{orgId}/offers}), the CONSULTANT alone accepts it ({@code /me-workspace/offers/{id}/accept}), the accepted offer creates the placement
 * (PENDING_START or ACTIVE), the daily job starts it, notice and termination end it, and the consultant's availability follows. Every refusal is the generic 404.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class OfferLifecycleIT {

    private static final String WHO = "offer-lifecycle-it";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private EntityManager em;
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
    @Autowired private TalentPlacementRepository placements;
    @Autowired private OfferExpiryJob expiryJob;
    @Autowired private OfferCommandService offerCommands;
    @Autowired private PlacementStartJob startJob;
    @Autowired private com.dossier.api.repository.org.OrgAuditEventRepository audit;

    private OrgFixtures fx;
    private Organization a;
    private Organization b;
    private final Instant now = Instant.now();
    private final LocalDate today = LocalDate.now(ZoneOffset.UTC);
    private ConsultantProfile casey;
    private ConsultantProfile robin;
    private ConsultantProfile bee;
    private ClientAccount acme;
    private ClientAccount beeClient;

    @BeforeEach
    void seed() {
        fx = new OrgFixtures(users, orgs, members);
        String n = String.valueOf(System.nanoTime());
        a = fx.org("ofl-a-" + n, OrgStatus.ACTIVE);
        b = fx.org("ofl-b-" + n, OrgStatus.ACTIVE);
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, "{\"on\":true}", WHO, Instant.now()));
        settingRows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ROLES, "{\"on\":true}", WHO, Instant.now()));
        cache.invalidate();
        staff(a, "ofl-a-owner", OrgRole.OWNER);
        staff(a, "ofl-a-marketer", OrgRole.MARKETER);
        staff(b, "ofl-b-owner", OrgRole.OWNER);
        casey = consultant(a, "ofl-a-casey", "Casey One");
        robin = consultant(a, "ofl-a-robin", "Robin Two");
        bee = consultant(b, "ofl-b-bee", "Bee Consultant");
        acme = ApplicationItSupport.client(em, a.getId(), "Acme Corp");
        beeClient = ApplicationItSupport.client(em, b.getId(), "Bee Client");
        em.flush();
    }

    @AfterEach
    void clean() {
        for (AppSetting s : settingRows.findAll()) if (WHO.equals(s.getUpdatedBy())) settingRows.delete(s);
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

    private ConsultantProfile consultant(Organization org, String login, String name) {
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
        ConsultantProfile p = new ConsultantProfile();
        p.setOrgId(org.getId());
        p.setMemberId(m.getId());
        p.setDisplayName(name);
        p.setEmail(login + "@example.org");
        p.setJobTitle("Senior Engineer");
        p.setAvailabilityStatus("AVAILABLE");
        return profiles.saveAndFlush(p);
    }

    // ---- calls ----------------------------------------------------------------------------------------------------

    private String offersPath(Organization org, String tail) {
        return "/api/orgs/" + org.getId() + "/offers" + tail;
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

    private void assertStatus(MvcResult r, int status, String what) throws Exception {
        assertThat(r.getResponse().getStatus()).as(what + " -> " + r.getResponse().getContentAsString()).isEqualTo(status);
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(body.toLowerCase()).as(what).contains("\"code\":\"not_found\"").doesNotContain("forbidden").doesNotContain("permission").doesNotContain("denied");
    }

    private String body(ConsultantProfile c, ClientAccount client, LocalDate start, boolean extend) {
        return "{\"consultantId\":" + c.getId() + ",\"clientId\":" + client.getId() + ",\"roleTitle\":\"Platform Engineer\",\"placementType\":\"CONTRACT\",\"startDate\":\"" + start + "\"," +
            "\"endDate\":\"" + start.plusMonths(6) + "\",\"rateMinor\":9500,\"ratePeriod\":\"HOUR\",\"currency\":\"USD\",\"workMode\":\"REMOTE\",\"extend\":" + extend + "}";
    }

    private JsonNode record(String login, ConsultantProfile c, ClientAccount client, LocalDate start, boolean extend) throws Exception {
        return ok(send(post(offersPath(a, "")), login, body(c, client, start, extend)), "record offer");
    }

    private long idOf(JsonNode detail) {
        return detail.path("offer").path("id").asLong();
    }

    private CwsOffer row(long id) {
        em.flush();
        em.clear();
        return offers.findByOrgIdAndId(a.getId(), id).orElseThrow();
    }

    private JsonNode consultantAccept(String login, long offerId) throws Exception {
        return ok(send(post("/api/orgs/" + a.getId() + "/me-workspace/offers/" + offerId + "/accept"), login, null), "consultant accepts");
    }

    private TalentPlacement placementOf(ConsultantProfile c) {
        em.flush();
        em.clear();
        List<TalentPlacement> all = placements.findByOrgIdAndConsultantId(a.getId(), c.getId());
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    private String availability(ConsultantProfile c) {
        em.flush();
        em.clear();
        return profiles.findByOrgIdAndId(a.getId(), c.getId()).orElseThrow().getAvailabilityStatus();
    }

    // ---- the lifecycle --------------------------------------------------------------------------------------------

    @Test
    void aDraftIsInvisibleToTheConsultantUntilItIsRecordedAsExtended() throws Exception {
        JsonNode draft = record("ofl-a-owner", casey, acme, today.plusDays(30), false);
        long id = idOf(draft);
        assertThat(draft.path("offer").path("state").asText()).isEqualTo("DRAFT");
        assertThat(draft.path("actions").path("extend").asBoolean()).isTrue();

        JsonNode mine = ok(send(get("/api/orgs/" + a.getId() + "/me-workspace/offers/list"), "ofl-a-casey", null), "consultant list");
        assertThat(mine.path("items")).as("a draft is not the consultant's yet").isEmpty();
        assertGeneric404(send(get("/api/orgs/" + a.getId() + "/me-workspace/offers/" + id), "ofl-a-casey", null), "consultant opens a draft");
        assertGeneric404(send(post("/api/orgs/" + a.getId() + "/me-workspace/offers/" + id + "/accept"), "ofl-a-casey", null), "consultant accepts a draft");

        JsonNode extended = ok(send(post(offersPath(a, "/" + id + "/extend")), "ofl-a-owner", null), "extend");
        assertThat(extended.path("offer").path("state").asText()).isEqualTo("EXTENDED");
        assertThat(extended.path("offer").path("deadline").asText()).as("the deadline defaults from the admin expiry days").isNotBlank();
        JsonNode after = ok(send(get("/api/orgs/" + a.getId() + "/me-workspace/offers/list"), "ofl-a-casey", null), "consultant list");
        assertThat(after.path("items")).hasSize(1);
        assertThat(after.path("items").get(0).path("status").asText()).isEqualTo("PENDING_REVIEW");
    }

    @Test
    void theConsultantAcceptingCreatesAPendingStartPlacementAndTheTimelineNamesWhoActed() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today.plusDays(21), true));
        JsonNode done = consultantAccept("ofl-a-casey", id);
        assertThat(done.path("status").asText()).isEqualTo("ACCEPTED");

        CwsOffer o = row(id);
        assertThat(o.getStatus()).isEqualTo(CwsOffer.ACCEPTED);
        assertThat(o.getPlacementId()).isNotNull();
        TalentPlacement p = placementOf(casey);
        assertThat(p.getStatus()).isEqualTo("PENDING_START");
        assertThat(p.getOfferId()).isEqualTo(id);
        assertThat(p.getClientId()).isEqualTo(acme.getId());
        assertThat(p.getStartDate()).isEqualTo(today.plusDays(21));
        assertThat(p.getBillRateMinor()).isEqualTo(9500L);
        assertThat(availability(casey)).as("not on a project before the start date").isEqualTo("AVAILABLE");

        JsonNode detail = ok(send(get(offersPath(a, "/" + id)), "ofl-a-owner", null), "detail");
        assertThat(detail.path("offer").path("state").asText()).isEqualTo("ACCEPTED");
        assertThat(detail.path("placement").path("status").asText()).isEqualTo("PENDING_START");
        assertThat(detail.path("actions").path("createPlacement").asBoolean()).isFalse();
        List<String> kinds = new java.util.ArrayList<>();
        for (JsonNode e : detail.path("timeline")) kinds.add(e.path("kind").asText() + ":" + e.path("actorKind").asText());
        assertThat(kinds).contains("DRAFTED:MEMBER", "EXTENDED:MEMBER", "ACCEPTED:CONSULTANT", "HIRED:SYSTEM");
        assertThat(detail.toString()).doesNotContain("Kiwiply signed");
    }

    @Test
    void startDateTodayMakesTheHireActiveAndTheConsultantOnAProject() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today, true));
        consultantAccept("ofl-a-casey", id);
        assertThat(placementOf(casey).getStatus()).isEqualTo("ACTIVE");
        assertThat(availability(casey)).isEqualTo("ON_PROJECT");
    }

    @Test
    void theDailyJobMovesPendingStartToActiveOnTheStartDateAndRecordsIt() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today.plusDays(1), true));
        consultantAccept("ofl-a-casey", id);
        TalentPlacement p = placementOf(casey);
        assertThat(p.getStatus()).isEqualTo("PENDING_START");
        // the start day arrives: move the planned start to today, as a day passing would
        p.setStartDate(today);
        placements.saveAndFlush(p);
        assertThat(startJob.runOnce()).containsEntry(a.getId(), 1);
        assertThat(startJob.runOnce().get(a.getId())).as("a second run is a no-op").isNull();
        TalentPlacement started = placementOf(casey);
        assertThat(started.getStatus()).isEqualTo("ACTIVE");
        Number events = (Number) em.createQuery("select count(e) from PlacementEvent e where e.orgId = :o and e.placementId = :p and e.eventType = 'STARTED'").setParameter("o", a.getId()).setParameter("p", started.getId()).getSingleResult();
        assertThat(events.intValue()).isEqualTo(1);
        assertThat(availability(casey)).isEqualTo("ON_PROJECT");
    }

    @Test
    void noticeThenTerminationUpdatesTheStatusTheReasonAndTheAvailability() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today, true));
        consultantAccept("ofl-a-casey", id);
        long pid = placementOf(casey).getId();
        String url = "/api/orgs/" + a.getId() + "/placements/" + pid;

        assertStatus(send(post(url + "/terminate"), "ofl-a-owner", "{\"reason\":\"\"}"), 422, "terminate without a reason");
        JsonNode notice = ok(send(post(url + "/notice"), "ofl-a-owner", "{\"endDate\":\"" + today.plusDays(14) + "\",\"note\":\"Client scaling down\"}"), "notice");
        assertThat(notice.path("status").asText()).isEqualTo("ENDING");
        assertThat(notice.path("noticeOn").asText()).isEqualTo(today.toString());
        assertThat(availability(casey)).isEqualTo("NOTICE");
        assertStatus(send(post(url + "/notice"), "ofl-a-owner", "{\"endDate\":\"" + today.plusDays(20) + "\"}"), 409, "second notice");

        JsonNode ended = ok(send(post(url + "/terminate"), "ofl-a-owner", "{\"reason\":\"Client ended the project early\"}"), "terminate");
        assertThat(ended.path("status").asText()).isEqualTo("TERMINATED");
        assertThat(ended.path("endReason").asText()).isEqualTo("Client ended the project early");
        assertThat(ended.path("endDate").asText()).isEqualTo(today.toString());
        assertThat(availability(casey)).isEqualTo("AVAILABLE");
        assertStatus(send(post(url + "/terminate"), "ofl-a-owner", "{\"reason\":\"again\"}"), 422, "terminate twice");

        // the ended placement leaves the consultant free to be placed again
        long second = idOf(record("ofl-a-owner", casey, acme, today.plusDays(40), true));
        consultantAccept("ofl-a-casey", second);
        assertThat(placements.findByOrgIdAndConsultantId(a.getId(), casey.getId())).hasSize(2);
    }

    @Test
    void anAcceptedOfferWhoseConsultantIsAlreadyPlacedKeepsTheAnswerAndOffersARetry() throws Exception {
        long first = idOf(record("ofl-a-owner", casey, acme, today, true));
        consultantAccept("ofl-a-casey", first);
        long second = idOf(record("ofl-a-owner", casey, acme, today.plusDays(90), true));
        consultantAccept("ofl-a-casey", second);
        CwsOffer o = row(second);
        assertThat(o.getStatus()).isEqualTo(CwsOffer.ACCEPTED);
        assertThat(o.getPlacementId()).isNull();
        JsonNode detail = ok(send(get(offersPath(a, "/" + second)), "ofl-a-owner", null), "detail");
        assertThat(detail.path("placementNote").asText()).isNotBlank();
        assertThat(detail.path("actions").path("createPlacement").asBoolean()).isTrue();
        MvcResult retry = send(post(offersPath(a, "/" + second + "/placement")), "ofl-a-owner", null);
        assertStatus(retry, 422, "retry while the first placement is open");
        assertThat(retry.getResponse().getContentAsString()).contains("PLACEMENT_NOT_CREATED");
    }

    @Test
    void theOrgSideCannotAcceptOrDeclineForTheConsultant() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today.plusDays(10), true));
        for (String verb : List.of("accept", "decline", "negotiate")) {
            MvcResult r = send(post(offersPath(a, "/" + id + "/" + verb)), "ofl-a-owner", "{}");
            assertThat(r.getResponse().getStatus()).as("org-side " + verb).isBetween(400, 405);
        }
        // and the owner is not the consultant, so the consultant route is the generic 404 for them too
        assertGeneric404(send(post("/api/orgs/" + a.getId() + "/me-workspace/offers/" + id + "/accept"), "ofl-a-owner", null), "owner accepts as the consultant");
        assertThat(row(id).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);
    }

    @Test
    void withdrawingAndRevisingFollowTheStateRulesAndTellTheConsultant() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today.plusDays(10), true));
        JsonNode revised = ok(send(put(offersPath(a, "/" + id)), "ofl-a-owner", "{\"rateMinor\":10500,\"ratePeriod\":\"HOUR\"}"), "revise");
        assertThat(revised.path("offer").path("rateMinor").asLong()).isEqualTo(10500L);
        JsonNode notes = ok(send(get("/api/orgs/" + a.getId() + "/me-workspace/notifications"), "ofl-a-casey", null), "consultant notifications");
        assertThat(notes.toString()).contains("New offer received");

        JsonNode withdrawn = ok(send(post(offersPath(a, "/" + id + "/withdraw")), "ofl-a-owner", "{\"reason\":\"Client changed their mind\"}"), "withdraw");
        assertThat(withdrawn.path("offer").path("state").asText()).isEqualTo("WITHDRAWN");
        assertStatus(send(put(offersPath(a, "/" + id)), "ofl-a-owner", "{\"rateMinor\":1}"), 409, "revise a withdrawn offer");
        assertStatus(send(post(offersPath(a, "/" + id + "/withdraw")), "ofl-a-owner", "{}"), 409, "withdraw twice");
        assertStatus(send(post("/api/orgs/" + a.getId() + "/me-workspace/offers/" + id + "/accept"), "ofl-a-casey", null), 409, "accepting a withdrawn offer");
    }

    @Test
    void sensitiveDataInFreeTextIsRefusedAndNothingIsStored() throws Exception {
        long before = offers.countByOrgId(a.getId());
        MvcResult r = send(post(offersPath(a, "")), "ofl-a-owner", body(casey, acme, today.plusDays(5), false).replace("\"extend\":false", "\"notes\":\"SSN 123-45-6789\",\"extend\":false"));
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isBetween(400, 422);
        assertThat(offers.countByOrgId(a.getId())).isEqualTo(before);
        assertStatus(send(post(offersPath(a, "")), "ofl-a-owner", "{\"consultantId\":" + casey.getId() + ",\"clientId\":" + acme.getId() + ",\"roleTitle\":\"X\",\"bankAccount\":\"123\"}"), 422, "an unknown (bank) property");
    }

    @Test
    void theNightlyJobExpiresOnlyOpenOffersPastTheirDeadlineAndRecordsItBySystem() throws Exception {
        long open = idOf(record("ofl-a-owner", casey, acme, today.plusDays(30), true));
        long late = idOf(record("ofl-a-owner", robin, acme, today.plusDays(30), true));
        CwsOffer l = row(late);
        l.setOfferDeadline(today.minusDays(2));
        offers.saveAndFlush(l);
        assertThat(expiryJob.runOnce()).containsEntry(a.getId(), 1);
        assertThat(expiryJob.runOnce().get(a.getId())).isNull();
        assertThat(row(late).getStatus()).isEqualTo(CwsOffer.EXPIRED);
        assertThat(row(late).getUpdatedByKind()).isEqualTo(CwsOfferEvent.BY_SYSTEM);
        assertThat(row(open).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);
        JsonNode detail = ok(send(get(offersPath(a, "/" + late)), "ofl-a-owner", null), "detail");
        assertThat(detail.path("offer").path("state").asText()).isEqualTo("EXPIRED");
        assertThat(detail.toString()).contains("\"actorKind\":\"SYSTEM\"");
        assertStatus(send(post("/api/orgs/" + a.getId() + "/me-workspace/offers/" + late + "/accept"), "ofl-a-robin", null), 409, "accept an expired offer");
    }

    @Test
    void theTabsAndCountsComeFromTheSameRowsTheConsultantReads() throws Exception {
        record("ofl-a-owner", casey, acme, today.plusDays(30), false);
        record("ofl-a-owner", robin, acme, today.plusDays(30), true);
        long accepted = idOf(record("ofl-a-owner", casey, acme, today, true));
        consultantAccept("ofl-a-casey", accepted);
        JsonNode counts = ok(send(get(offersPath(a, "/counts")), "ofl-a-owner", null), "counts");
        assertThat(counts.path("all").asInt()).isEqualTo(3);
        assertThat(counts.path("draft").asInt()).isEqualTo(1);
        assertThat(counts.path("open").asInt()).isEqualTo(1);
        assertThat(counts.path("accepted").asInt()).isEqualTo(1);
        assertThat(counts.path("placed").asInt()).isEqualTo(1);
        assertThat(ok(send(get(offersPath(a, "?tab=draft")), "ofl-a-owner", null), "draft tab").path("total").asInt()).isEqualTo(1);
        assertThat(ok(send(get(offersPath(a, "?tab=open&q=robin")), "ofl-a-owner", null), "search").path("total").asInt()).isEqualTo(1);
        assertStatus(send(get(offersPath(a, "?tab=nonsense")), "ofl-a-owner", null), 422, "bad tab");
        assertStatus(send(get(offersPath(a, "?sort=nonsense")), "ofl-a-owner", null), 400, "bad sort");
    }

    @Test
    void anotherTenantNeverSeesOrTouchesTheOffersAndANonManagerGetsTheSame404() throws Exception {
        long id = idOf(record("ofl-a-owner", casey, acme, today.plusDays(10), true));
        // B's owner, with A's ids, in both orgs
        for (String path : List.of(offersPath(a, ""), offersPath(a, "/counts"), offersPath(a, "/" + id), offersPath(a, "/pickers?kind=consultant"))) {
            assertGeneric404(send(get(path), "ofl-b-owner", null), "B owner reads " + path);
        }
        assertGeneric404(send(get("/api/orgs/" + b.getId() + "/offers/" + id), "ofl-b-owner", null), "A's offer id inside B");
        assertGeneric404(send(post(offersPath(a, "/" + id + "/withdraw")), "ofl-b-owner", "{}"), "B withdraws A's offer");
        assertGeneric404(send(put(offersPath(a, "/" + id)), "ofl-b-owner", "{\"rateMinor\":1}"), "B revises A's offer");
        assertGeneric404(send(post(offersPath(b, "")), "ofl-b-owner", body(casey, beeClient, today.plusDays(5), false)), "B records an offer for A's consultant");
        assertGeneric404(send(post(offersPath(b, "")), "ofl-b-owner", body(bee, acme, today.plusDays(5), false)), "B records an offer with A's client");
        assertThat(ok(send(get(offersPath(b, "")), "ofl-b-owner", null), "B list").path("items")).isEmpty();
        // a marketer holds no offers.manage
        assertGeneric404(send(get(offersPath(a, "")), "ofl-a-marketer", null), "marketer lists");
        assertGeneric404(send(post(offersPath(a, "")), "ofl-a-marketer", body(casey, acme, today.plusDays(5), false)), "marketer records");
        assertThat(row(id).getStatus()).isEqualTo(CwsOffer.PENDING_REVIEW);
    }

    @Test
    void offerWritesAndPlacementEndsWriteExactlyOneAuditRowEach() throws Exception {
        long before = audit.countByOrgId(a.getId());
        long id = idOf(record("ofl-a-owner", casey, acme, today, false));
        em.flush();
        assertThat(audit.countByOrgId(a.getId()) - before).as("record").isEqualTo(1);
        before = audit.countByOrgId(a.getId());
        ok(send(post(offersPath(a, "/" + id + "/extend")), "ofl-a-owner", null), "extend");
        em.flush();
        assertThat(audit.countByOrgId(a.getId()) - before).as("extend").isEqualTo(1);
        before = audit.countByOrgId(a.getId());
        ok(send(post(offersPath(a, "/" + id + "/withdraw")), "ofl-a-owner", "{}"), "withdraw");
        em.flush();
        assertThat(audit.countByOrgId(a.getId()) - before).as("withdraw").isEqualTo(1);
    }

    @Test
    void submissionsAreReadOnlyRecordsOfTheOrgOnly() throws Exception {
        ClientRequirement job = ApplicationItSupport.job(em, a.getId(), acme, "Backend Role");
        ClientRequirement beeJob = ApplicationItSupport.job(em, b.getId(), beeClient, "Bee Role");
        em.flush();
        persistSubmission(a, "SUB-A-1", casey, job, acme);
        persistSubmission(b, "SUB-B-1", bee, beeJob, beeClient);
        String base = "/api/orgs/" + a.getId() + "/submissions";
        JsonNode page = ok(send(get(base), "ofl-a-owner", null), "submissions");
        assertThat(page.path("total").asInt()).isEqualTo(1);
        assertThat(page.path("items").get(0).path("code").asText()).isEqualTo("SUB-A-1");
        assertThat(page.path("items").get(0).path("requirementTitle").asText()).isEqualTo("Backend Role");
        assertThat(page.toString()).doesNotContain("SUB-B-1").doesNotContain("Bee Role");
        assertThat(ok(send(get(base + "/counts"), "ofl-a-owner", null), "counts").path("total").asInt()).isEqualTo(1);
        assertThat(ok(send(get(base + "?status=SUBMITTED"), "ofl-a-owner", null), "filter").path("total").asInt()).isZero();
        assertStatus(send(get(base + "?status=NOPE"), "ofl-a-owner", null), 422, "bad status");
        // no write route exists
        MvcResult write = send(post(base), "ofl-a-owner", "{}");
        assertThat(write.getResponse().getStatus()).isBetween(400, 405);
        assertGeneric404(send(get(base), "ofl-b-owner", null), "B reads A's submissions");
    }

    private void persistSubmission(Organization org, String code, ConsultantProfile c, ClientRequirement job, ClientAccount client) {
        MktSubmission s = new MktSubmission();
        s.setOrgId(org.getId());
        s.setCode(code);
        s.setConsultantId(c.getId());
        s.setRequirementId(job.getId());
        s.setClientId(client.getId());
        em.persist(s);
        em.flush();
    }
}
