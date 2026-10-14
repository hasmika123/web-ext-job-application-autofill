package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.PlacementExtension;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Placements API through the real chain: tabs and the four tiles with honest deltas, filters / search / sort, the scope a role reads at, bill rates only
 * for those who may see them, the generic 404 for every kind of outsider and for another tenant, the recorded actions (extend, request, decide, complete,
 * redeploy, note, create) each with its event and one audit row, Undo, idempotency, strict bodies, PII refusal and the organization's own windows.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@org.junit.jupiter.api.Timeout(120)
class OrgPlacementResourceIT extends MemberItSupport {

    private final LocalDate today = LocalDate.now();
    private ClientAccount initech;
    private ClientAccount globex;
    private ClientContact cora;
    private ConsultantProfile k1;
    private ConsultantProfile k2;
    private ConsultantProfile k3;
    private ConsultantProfile k4;
    private ConsultantProfile k5;
    private ConsultantProfile spare;
    private TalentPlacement p1; // ACTIVE, ends in 10 days (red), manager mktSpec, rate $125/hr
    private TalentPlacement p2; // ACTIVE, ends in 40 days (amber), manager mktMgr, in the pool since 5 days
    private TalentPlacement p3; // ACTIVE, ends in 300 days, manager owner, extension requested
    private TalentPlacement p4; // upcoming: starts in 10 days
    private TalentPlacement p5; // completed 20 days ago
    private OrgMember fin;
    private OrgMember acct;
    private OrgMember scoped;

    @BeforeEach
    void placementsWorld() {
        initech = ApplicationItSupport.client(em, a.getId(), "Initech");
        globex = ApplicationItSupport.client(em, a.getId(), "Globex");
        cora = new ClientContact();
        cora.setOrgId(a.getId());
        cora.setClientId(initech.getId());
        cora.setName("Cora Client");
        cora.setTitle("Engineering Director");
        em.persist(cora);
        k1 = ApplicationItSupport.consultant(em, a.getId(), "Kara One");
        k2 = ApplicationItSupport.consultant(em, a.getId(), "Kyle Two");
        k3 = ApplicationItSupport.consultant(em, a.getId(), "Kim Three");
        k4 = ApplicationItSupport.consultant(em, a.getId(), "Kurt Four");
        k5 = ApplicationItSupport.consultant(em, a.getId(), "Kay Five");
        spare = ApplicationItSupport.consultant(em, a.getId(), "Sky Spare");
        p1 = placement(k1, initech, "Data Engineer", "ACTIVE", -100, 10, mktSpec, 12500L);
        p1.setClientContactId(cora.getId());
        p2 = placement(k2, globex, "QA Lead", "ACTIVE", -200, 40, mktMgr, 9000L);
        p3 = placement(k3, initech, "Data Engineer", "ACTIVE", -60, 300, owner, 11000L);
        p4 = placement(k4, globex, "Platform Engineer", "PENDING_START", 10, 200, mktSpec, 13000L);
        p5 = placement(k5, initech, "Analyst", "ENDED", -300, -20, mktSpec, 8000L);
        p5.setCompletedAt(Instant.now().minus(20, ChronoUnit.DAYS));
        p2.setRedeploymentPool(true);
        p2.setRedeploymentDate(today.plusDays(41));
        em.persist(p2);
        event(p2, "REDEPLOY_STARTED", 5, mktMgr);
        extension(p3, "REQUESTED", p3.getEndDate(), p3.getEndDate().plusDays(90), owner);
        for (TalentPlacement p : List.of(p1, p2, p3, p4, p5)) event(p, "CREATED", 30, owner);

        fin = extra(a, "fin", OrgRole.MEMBER, "Fiona", "Finance");
        assign(fin, "FINANCE_SPECIALIST");
        acct = extra(a, "acct", OrgRole.MEMBER, "Amara", "Silva");
        assign(acct, "ACCOUNT_MANAGER");
        scoped = extra(a, "scoped", OrgRole.MEMBER, "Sid", "Scoped");
        OrgRoleDefinition ownerRole = roleRepo.findSystemByRoleKey("MARKETING_SPECIALIST").orElseThrow();
        OrgRoleDefinition custom = new OrgRoleDefinition();
        custom.setOrgId(a.getId());
        custom.setRoleKey("CUSTOM_PL_" + p.toUpperCase());
        custom.setName("Placement reader " + p);
        custom = roleRepo.saveAndFlush(custom);
        permissionRepo.saveAndFlush(new OrgRolePermission(custom.getId(), "placements.view", PermissionScope.ASSIGNED, null, null));
        assertThat(ownerRole).isNotNull();
        assignRole(scoped, custom);
        // the scoped reader is the account manager of p4 and p5 only
        p4.setAccountManagerMemberId(scoped.getId());
        p5.setAccountManagerMemberId(scoped.getId());
        em.flush();
    }

    private TalentPlacement placement(ConsultantProfile c, ClientAccount cl, String role, String status, int startOffset, int endOffset, OrgMember manager, long rateMinor) {
        TalentPlacement p = new TalentPlacement();
        p.setOrgId(a.getId());
        p.setConsultantId(c.getId());
        p.setClientId(cl.getId());
        p.setRoleTitle(role);
        p.setStatus(status);
        p.setStartDate(today.plusDays(startOffset));
        p.setEndDate(today.plusDays(endOffset));
        p.setBillRateMinor(rateMinor);
        p.setRateUnit("HOUR");
        p.setAccountManagerMemberId(manager.getId());
        p.setCreatedAt(startOffset > 0 ? Instant.now().minus(3, ChronoUnit.DAYS) : Instant.now().plus(startOffset, ChronoUnit.DAYS));
        em.persist(p);
        em.flush();
        return p;
    }

    private void event(TalentPlacement p, String type, int daysAgo, OrgMember actor) {
        PlacementEvent e = new PlacementEvent();
        e.setOrgId(a.getId());
        e.setPlacementId(p.getId());
        e.setEventType(type);
        e.setActorMemberId(actor.getId());
        e.setDetail("Fixture");
        e.setOccurredAt(Instant.now().minus(daysAgo, ChronoUnit.DAYS));
        em.persist(e);
        em.flush();
    }

    private PlacementExtension extension(TalentPlacement p, String status, LocalDate from, LocalDate to, OrgMember by) {
        PlacementExtension x = new PlacementExtension();
        x.setOrgId(a.getId());
        x.setPlacementId(p.getId());
        x.setStatus(status);
        x.setFromEndDate(from);
        x.setRequestedEndDate(to);
        x.setRequestedByMemberId(by.getId());
        x.setCreatedAt(Instant.now().minus(3, ChronoUnit.DAYS));
        em.persist(x);
        em.flush();
        return x;
    }

    private String url() {
        return "/api/orgs/" + a.getId() + "/placements";
    }

    private MvcResult read(String who, String path) throws Exception {
        return call(login(who), get(url() + path));
    }

    private MvcResult send(String who, MockHttpServletRequestBuilder req, String body) throws Exception {
        return call(login(who), req, body, null, key());
    }

    // ---- reading ---------------------------------------------------------------------------------------------------------------

    @Test
    void theActiveTabIsTheDefaultAndReadsSoonestEndFirstWithRealRows() throws Exception {
        MvcResult r = read("owner", "");
        assertStatus(r, 200);
        JsonNode page = json(r);
        assertThat(page.path("total").asInt()).isEqualTo(3);
        assertThat(r.getResponse().getHeader("X-Total-Count")).isEqualTo("3");
        assertThat(ids(page)).containsExactly(p1.getId(), p2.getId(), p3.getId());
        JsonNode first = page.path("items").get(0);
        assertThat(first.path("consultant").path("name").asText()).isEqualTo("Kara One");
        assertThat(first.path("client").path("name").asText()).isEqualTo("Initech");
        assertThat(first.path("client").path("initials").asText()).isEqualTo("IN");
        assertThat(first.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(first.path("accountManager").path("name").asText()).isEqualTo("Sam Spec");
        assertThat(first.path("billRateMinor").asLong()).isEqualTo(12500L);
        assertThat(first.path("rateUnit").asText()).isEqualTo("HOUR");
        // the Next Action pill: red inside the urgent window, amber inside the ending-soon window, blue "Schedule review" when an extension waits
        assertThat(first.path("nextAction").path("label").asText()).isEqualTo("Ends in 10 days");
        assertThat(first.path("nextAction").path("tone").asText()).isEqualTo("red");
        assertThat(page.path("items").get(1).path("nextAction").path("tone").asText()).isEqualTo("amber");
        assertThat(page.path("items").get(2).path("nextAction").path("label").asText()).isEqualTo("Schedule review");
        assertThat(page.path("items").get(2).path("extensionPending").asBoolean()).isTrue();
    }

    @Test
    void everyTabReadsItsOwnRows() throws Exception {
        assertThat(ids(json(read("owner", "?tab=upcoming")))).containsExactly(p4.getId());
        assertThat(ids(json(read("owner", "?tab=completed")))).containsExactly(p5.getId());
        assertThat(ids(json(read("owner", "?tab=extensions")))).containsExactly(p3.getId());
        JsonNode upcoming = json(read("owner", "?tab=upcoming")).path("items").get(0);
        assertThat(upcoming.path("status").asText()).isEqualTo("UPCOMING");
        assertThat(upcoming.path("nextAction").path("label").asText()).isEqualTo("Starts in 10 days");
        assertThat(json(read("owner", "?tab=completed")).path("items").get(0).path("status").asText()).isEqualTo("ENDED");
        assertStatus(read("owner", "?tab=nope"), 422);
    }

    @Test
    void searchFiltersAndSortAreServerSide() throws Exception {
        assertThat(ids(json(read("owner", "?q=kyle")))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?q=globex")))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?q=data eng")))).containsExactly(p1.getId(), p3.getId());
        assertThat(ids(json(read("owner", "?clientId=" + globex.getId())))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?role=QA Lead")))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?managerId=" + mktMgr.getId())))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?status=ENDING_SOON")))).containsExactly(p1.getId(), p2.getId());
        assertThat(ids(json(read("owner", "?status=IN_POOL")))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?status=EXTENSION_REQUESTED")))).containsExactly(p3.getId());
        assertThat(ids(json(read("owner", "?endFrom=" + today.plusDays(30) + "&endTo=" + today.plusDays(60))))).containsExactly(p2.getId());
        assertThat(ids(json(read("owner", "?type=FTE")))).isEmpty();
        assertThat(ids(json(read("owner", "?sort=consultant,desc")))).containsExactly(p2.getId(), p3.getId(), p1.getId());
        assertThat(ids(json(read("owner", "?sort=rate,desc")))).containsExactly(p1.getId(), p3.getId(), p2.getId());
        assertThat(ids(json(read("owner", "?sort=end,desc")))).containsExactly(p3.getId(), p2.getId(), p1.getId());
        JsonNode paged = json(read("owner", "?size=2&page=1"));
        assertThat(paged.path("items")).hasSize(1);
        assertThat(paged.path("total").asInt()).isEqualTo(3);
        assertThat(paged.path("hasNext").asBoolean()).isFalse();
    }

    @Test
    void badQueriesAreRefusedPlainly() throws Exception {
        assertCode(read("owner", "?sort=bogus,asc"), 400, "SORT_INVALID");
        assertStatus(read("owner", "?q=a"), 422);
        assertStatus(read("owner", "?size=101"), 422);
        assertStatus(read("owner", "?status=NOPE"), 422);
        assertStatus(read("owner", "?type=NOPE"), 422);
    }

    @Test
    void theFourTilesAndTheTabCountsComeFromRowsWithHonestDeltas() throws Exception {
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("active").path("value").asInt()).isEqualTo(3);
        assertThat(c.path("active").path("previous").asInt()).as("the three active ones and the one completed 20 days ago were all running 30 days ago").isEqualTo(4);
        assertThat(c.path("active").path("series")).hasSize(8);
        assertThat(c.path("startingSoon").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("endingSoon").path("value").asInt()).as("ends in 10 and 40 days, inside the 45 day window").isEqualTo(2);
        assertThat(c.path("pool").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("pool").path("previous").asInt()).as("it joined five days ago").isZero();
        assertThat(c.path("pool").path("delta").asInt()).isEqualTo(1);
        assertThat(c.path("tabs").path("active").asInt()).isEqualTo(3);
        assertThat(c.path("tabs").path("upcoming").asInt()).isEqualTo(1);
        assertThat(c.path("tabs").path("completed").asInt()).isEqualTo(1);
        assertThat(c.path("tabs").path("extensions").asInt()).isEqualTo(1);
        assertThat(c.path("windows").path("endingSoonDays").asInt()).isEqualTo(45);
        assertThat(c.path("windows").path("endingUrgentDays").asInt()).isEqualTo(14);
        assertThat(c.path("windows").path("startingSoonDays").asInt()).isEqualTo(30);
    }

    @Test
    void anOrganizationWithNoHistoryHasNoDeltaAtAll() throws Exception {
        em.createQuery("delete from PlacementEvent e where e.orgId = :o").setParameter("o", a.getId()).executeUpdate();
        em.createQuery("delete from PlacementExtension e where e.orgId = :o").setParameter("o", a.getId()).executeUpdate();
        em.createQuery("delete from TalentPlacement x where x.orgId = :o").setParameter("o", a.getId()).executeUpdate();
        TalentPlacement fresh = placement(k1, initech, "Data Engineer", "ACTIVE", -5, 100, mktSpec, 1000L);
        assertThat(fresh.getId()).isNotNull();
        em.clear();
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("active").path("value").asInt()).isEqualTo(1);
        assertThat(c.path("active").path("previous").isNull()).isTrue();
        assertThat(c.path("active").path("delta").isNull()).isTrue();
        assertThat(c.path("pool").path("previous").isNull()).isTrue();
    }

    @Test
    void theOrganizationsOwnWindowsMoveWhatCountsAsEndingSoon() throws Exception {
        OrgSetting s = new OrgSetting();
        s.setOrgId(a.getId());
        s.setSettingKey(EnterpriseSettingKeys.ORG_PLACEMENTS_ENDING_SOON_DAYS);
        s.setValueJson("20");
        em.persist(s);
        em.flush();
        JsonNode c = json(read("owner", "/counts"));
        assertThat(c.path("windows").path("endingSoonDays").asInt()).isEqualTo(20);
        assertThat(c.path("endingSoon").path("value").asInt()).as("only the placement ending in 10 days is inside 20 days").isEqualTo(1);
        JsonNode page = json(read("owner", ""));
        assertThat(page.path("items").get(1).path("nextAction").path("kind").asText()).as("40 days is no longer close enough").isEqualTo("NONE");
        assertThat(ids(json(read("owner", "?status=ENDING_SOON")))).containsExactly(p1.getId());
    }

    @Test
    void filtersAndPickersAreBuiltFromTheSameRows() throws Exception {
        JsonNode f = json(read("owner", "/filters"));
        assertThat(f.path("clients")).hasSize(2);
        assertThat(f.path("roles")).hasSize(4);
        assertThat(f.path("managers")).hasSize(4);
        assertThat(f.path("types")).hasSize(3);
        assertThat(f.path("statuses")).hasSize(6);
        JsonNode people = json(read("owner", "/pickers?kind=consultant&q=sky"));
        assertThat(people.path("items")).hasSize(1);
        assertThat(people.path("items").get(0).path("label").asText()).isEqualTo("Sky Spare");
        assertThat(json(read("owner", "/pickers?kind=consultant&q=kara")).path("items")).as("Kara is placed right now").isEmpty();
        assertThat(json(read("owner", "/pickers?kind=client")).path("items")).hasSize(2);
        assertThat(json(read("owner", "/pickers?kind=contact&clientId=" + initech.getId())).path("items")).hasSize(1);
        assertStatus(read("owner", "/pickers?kind=contact"), 422);
        assertStatus(read("owner", "/pickers?kind=nope"), 422);
    }

    @Test
    void theDetailCarriesTheEngagementAvailabilityAndWhatTheCallerMayDo() throws Exception {
        JsonNode d = json(read("owner", "/" + p1.getId()));
        assertThat(d.path("roleTitle").asText()).isEqualTo("Data Engineer");
        assertThat(d.path("placementType").asText()).isEqualTo("CONTRACT");
        assertThat(d.path("endsInDays").asInt()).isEqualTo(10);
        assertThat(d.path("clientContact").path("name").asText()).isEqualTo("Cora Client");
        assertThat(d.path("clientContact").path("title").asText()).isEqualTo("Engineering Director");
        assertThat(d.path("engagement").path("start").asText()).isEqualTo(p1.getStartDate().toString());
        assertThat(d.path("engagement").path("midpoint").asText()).isEqualTo(p1.getStartDate().plusDays(55).toString());
        assertThat(d.path("engagement").path("percent").asInt()).isEqualTo(91);
        assertThat(d.path("availability").path("availableFrom").asText()).isEqualTo(today.plusDays(10).plusDays(1).toString());
        assertThat(d.path("availability").path("inDays").asInt()).isEqualTo(11);
        assertThat(d.path("availability").path("inPool").asBoolean()).isFalse();
        assertThat(d.path("actions").path("extend").asBoolean()).isTrue();
        assertThat(d.path("actions").path("redeploy").asBoolean()).isTrue();
        JsonNode pool = json(read("owner", "/" + p2.getId()));
        assertThat(pool.path("availability").path("inPool").asBoolean()).isTrue();
        assertThat(pool.path("availability").path("availableFrom").asText()).isEqualTo(today.plusDays(41).toString());
        assertThat(pool.path("actions").path("redeploy").asBoolean()).as("already in the pool").isFalse();
        JsonNode pending = json(read("owner", "/" + p3.getId()));
        assertThat(pending.path("extensionPending").asBoolean()).isTrue();
        assertThat(pending.path("extensions")).hasSize(1);
        assertThat(pending.path("actions").path("requestExtension").asBoolean()).isFalse();
        assertThat(pending.path("actions").path("decideExtension").asBoolean()).isTrue();
        JsonNode done = json(read("owner", "/" + p5.getId()));
        assertThat(done.path("actions").path("extend").asBoolean()).isFalse();
        assertThat(done.path("actions").path("complete").asBoolean()).isFalse();
    }

    // ---- scope, rates and the generic 404 --------------------------------------------------------------------------------------

    @Test
    void aReaderAtAssignedScopeSeesOnlyTheirOwnPlacementsAndNoRates() throws Exception {
        JsonNode page = json(read("scoped", "?tab=upcoming"));
        assertThat(ids(page)).containsExactly(p4.getId());
        assertThat(page.path("items").get(0).path("billRateMinor").isNull()).as("no placements.manage and no finance.view: no rate").isTrue();
        assertThat(ids(json(read("scoped", "?tab=completed")))).containsExactly(p5.getId());
        assertThat(ids(json(read("scoped", "")))).as("the active ones belong to other managers").isEmpty();
        assertGeneric404(read("scoped", "/" + p1.getId()), "another manager's placement");
        assertThat(json(read("scoped", "/counts")).path("tabs").path("upcoming").asInt()).isEqualTo(1);
        assertGeneric404(send("scoped", post(url() + "/" + p4.getId() + "/complete"), "{}"), "a reader cannot write");
    }

    @Test
    void financeSeesEveryPlacementAndItsRateButCannotChangeAnything() throws Exception {
        JsonNode page = json(read("fin", ""));
        assertThat(ids(page)).containsExactly(p1.getId(), p2.getId(), p3.getId());
        assertThat(page.path("items").get(0).path("billRateMinor").asLong()).isEqualTo(12500L);
        JsonNode d = json(read("fin", "/" + p1.getId()));
        assertThat(d.path("actions").path("extend").asBoolean()).isFalse();
        assertThat(d.path("actions").path("addNote").asBoolean()).isFalse();
        long before = auditCount(a);
        assertGeneric404(send("fin", post(url() + "/" + p1.getId() + "/extend"), "{\"endDate\":\"" + today.plusDays(200) + "\"}"), "finance extend");
        assertGeneric404(send("fin", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"hi\"}"), "finance note");
        assertGeneric404(send("fin", post(url()), "{}"), "finance create");
        assertThat(auditCount(a)).isEqualTo(before);
    }

    @Test
    void anAccountManagerWhoOnlyHoldsManageReadsAndWrites() throws Exception {
        assertThat(ids(json(read("acct", "")))).containsExactly(p1.getId(), p2.getId(), p3.getId());
        assertThat(json(read("acct", "")).path("items").get(0).path("billRateMinor").asLong()).isEqualTo(12500L);
        assertStatus(send("acct", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"Renewal call booked\"}"), 201);
    }

    @Test
    void everyKindOfOutsiderGetsTheSameGeneric404() throws Exception {
        long before = auditCount(a);
        for (String who : List.of("plain", "hr", "c1", "spec")) {
            assertGeneric404(read(who, ""), who + " list");
            assertGeneric404(read(who, "/counts"), who + " counts");
            assertGeneric404(read(who, "/filters"), who + " filters");
            assertGeneric404(read(who, "/" + p1.getId()), who + " detail");
            assertGeneric404(send(who, post(url() + "/" + p1.getId() + "/complete"), "{}"), who + " complete");
            assertGeneric404(send(who, post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"hi\"}"), who + " note");
        }
        String bOwnerLogin = login("bowner");
        assertGeneric404(call(bOwnerLogin, get(url())), "B's owner on A's org");
        assertGeneric404(call(bOwnerLogin, get("/api/orgs/" + b.getId() + "/placements/" + p1.getId())), "A's placement id inside B");
        assertGeneric404(call(bOwnerLogin, post("/api/orgs/" + b.getId() + "/placements/" + p1.getId() + "/complete"), "{}"), "complete A's placement from B");
        assertThat(auditCount(a)).as("nothing was written").isEqualTo(before);
        assertThat(json(read("owner", "/" + p1.getId())).path("status").asText()).isEqualTo("ACTIVE");
    }

    // ---- actions ---------------------------------------------------------------------------------------------------------------

    @Test
    void extendingMovesTheEndDateRecordsItOnceAndCanBeUndone() throws Exception {
        long before = auditCount(a, "PLACEMENT_EXTEND");
        LocalDate next = today.plusDays(10).plusDays(90);
        MvcResult r = send("owner", post(url() + "/" + p1.getId() + "/extend"), "{\"endDate\":\"" + next + "\",\"note\":\"Client renewed\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("endDate").asText()).isEqualTo(next.toString());
        assertThat(d.path("extensions").get(0).path("status").asText()).isEqualTo("APPROVED");
        assertThat(d.path("extensions").get(0).path("fromEndDate").asText()).isEqualTo(today.plusDays(10).toString());
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("EXTENDED");
        assertThat(d.path("nextAction").path("kind").asText()).as("no longer ending soon").isEqualTo("NONE");
        assertThat(auditCount(a, "PLACEMENT_EXTEND") - before).isEqualTo(1);
        // an end date that is not later is refused
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/extend"), "{\"endDate\":\"" + today.plusDays(10) + "\"}"), 422);
        // undo
        long eventId = d.path("undo").path("eventId").asLong();
        MvcResult undone = send("owner", post(url() + "/" + p1.getId() + "/undo"), "{\"eventId\":" + eventId + "}");
        assertStatus(undone, 200);
        JsonNode u = json(undone);
        assertThat(u.path("endDate").asText()).isEqualTo(today.plusDays(10).toString());
        assertThat(u.path("extensions").get(0).path("status").asText()).isEqualTo("CANCELLED");
        assertThat(u.path("timeline").get(0).path("type").asText()).isEqualTo("UNDO");
        assertThat(u.path("undo").isNull()).isTrue();
        assertCode(send("owner", post(url() + "/" + p1.getId() + "/undo"), "{\"eventId\":" + eventId + "}"), 422, "UNDO_NOT_AVAILABLE");
        assertThat(auditCount(a, "PLACEMENT_UNDO")).isEqualTo(1);
    }

    @Test
    void anExtensionIsRequestedOnceThenApprovedOrDeclined() throws Exception {
        LocalDate to = today.plusDays(10).plusDays(60);
        MvcResult req = send("owner", post(url() + "/" + p1.getId() + "/extension-requests"), "{\"requestedEndDate\":\"" + to + "\",\"note\":\"Client wants to continue\"}");
        assertStatus(req, 201);
        JsonNode d = json(req);
        assertThat(d.path("extensionPending").asBoolean()).isTrue();
        assertThat(d.path("nextAction").path("kind").asText()).as("ending soon still wins over the review pill").isEqualTo("ENDS_IN");
        assertThat(ids(json(read("owner", "?tab=extensions")))).containsExactlyInAnyOrder(p1.getId(), p3.getId());
        assertCode(send("owner", post(url() + "/" + p1.getId() + "/extension-requests"), "{\"requestedEndDate\":\"" + to.plusDays(1) + "\"}"), 409, "EXTENSION_ALREADY_REQUESTED");
        long extId = d.path("extensions").get(0).path("id").asLong();
        // approve: the end date moves
        long before = auditCount(a, "PLACEMENT_EXTENSION_DECIDE");
        MvcResult ok = send("owner", post(url() + "/" + p1.getId() + "/extensions/" + extId + "/decision"), "{\"decision\":\"APPROVE\"}");
        assertStatus(ok, 200);
        assertThat(json(ok).path("endDate").asText()).isEqualTo(to.toString());
        assertThat(json(ok).path("extensionPending").asBoolean()).isFalse();
        assertThat(auditCount(a, "PLACEMENT_EXTENSION_DECIDE") - before).isEqualTo(1);
        assertCode(send("owner", post(url() + "/" + p1.getId() + "/extensions/" + extId + "/decision"), "{\"decision\":\"DECLINE\"}"), 409, "EXTENSION_NOT_PENDING");
        // decline another one: the end date stays
        MvcResult second = send("owner", post(url() + "/" + p2.getId() + "/extension-requests"), "{\"requestedEndDate\":\"" + today.plusDays(40).plusDays(30) + "\"}");
        long extId2 = json(second).path("extensions").get(0).path("id").asLong();
        MvcResult no = send("owner", post(url() + "/" + p2.getId() + "/extensions/" + extId2 + "/decision"), "{\"decision\":\"DECLINE\"}");
        assertStatus(no, 200);
        assertThat(json(no).path("endDate").asText()).isEqualTo(today.plusDays(40).toString());
        assertThat(json(no).path("extensions").get(0).path("status").asText()).isEqualTo("DECLINED");
        // an extension of another placement cannot be decided through this one
        assertGeneric404(send("owner", post(url() + "/" + p1.getId() + "/extensions/" + extId2 + "/decision"), "{\"decision\":\"APPROVE\"}"), "someone else's extension");
        assertStatus(send("owner", post(url() + "/" + p3.getId() + "/extensions/" + extension(p3, "REQUESTED", today.plusDays(300), today.plusDays(300).plusDays(5), owner).getId() + "/decision"), "{\"decision\":\"MAYBE\"}"), 422);
    }

    @Test
    void completingEndsThePlacementTodayAndUndoRestoresIt() throws Exception {
        long before = auditCount(a, "PLACEMENT_COMPLETE");
        MvcResult r = send("owner", post(url() + "/" + p3.getId() + "/complete"), "{\"note\":\"Wrapped up early\"}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("status").asText()).isEqualTo("ENDED");
        assertThat(d.path("endDate").asText()).isEqualTo(today.toString());
        assertThat(auditCount(a, "PLACEMENT_COMPLETE") - before).isEqualTo(1);
        assertThat(ids(json(read("owner", "?tab=completed")))).contains(p3.getId());
        assertThat(json(read("owner", "/counts")).path("tabs").path("active").asInt()).isEqualTo(2);
        assertCode(send("owner", post(url() + "/" + p3.getId() + "/complete"), "{}"), 422, "PLACEMENT_ENDED");
        MvcResult undone = send("owner", post(url() + "/" + p3.getId() + "/undo"), "{\"eventId\":" + d.path("undo").path("eventId").asLong() + "}");
        assertStatus(undone, 200);
        assertThat(json(undone).path("status").asText()).isEqualTo("ACTIVE");
        assertThat(json(undone).path("endDate").asText()).isEqualTo(today.plusDays(300).toString());
        // an upcoming placement cannot be completed
        assertCode(send("owner", post(url() + "/" + p4.getId() + "/complete"), "{}"), 422, "PLACEMENT_NOT_STARTED");
    }

    @Test
    void redeploymentJoinsThePoolOnceAndCanBeLeftOrUndone() throws Exception {
        MvcResult r = send("owner", post(url() + "/" + p1.getId() + "/redeploy"), "{}");
        assertStatus(r, 200);
        JsonNode d = json(r);
        assertThat(d.path("availability").path("inPool").asBoolean()).isTrue();
        assertThat(d.path("availability").path("availableFrom").asText()).isEqualTo(today.plusDays(10).plusDays(1).toString());
        assertThat(json(read("owner", "/counts")).path("pool").path("value").asInt()).isEqualTo(2);
        assertCode(send("owner", post(url() + "/" + p1.getId() + "/redeploy"), "{}"), 409, "ALREADY_IN_POOL");
        MvcResult undone = send("owner", post(url() + "/" + p1.getId() + "/undo"), "{\"eventId\":" + d.path("undo").path("eventId").asLong() + "}");
        assertStatus(undone, 200);
        assertThat(json(undone).path("availability").path("inPool").asBoolean()).isFalse();
        assertThat(json(read("owner", "/counts")).path("pool").path("value").asInt()).isEqualTo(1);
        // leaving the pool by hand
        assertStatus(send("owner", post(url() + "/" + p2.getId() + "/redeploy/cancel"), null), 200);
        assertCode(send("owner", post(url() + "/" + p2.getId() + "/redeploy/cancel"), null), 409, "NOT_IN_POOL");
        // a date in the past is refused
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/redeploy"), "{\"availableFrom\":\"" + today.minusDays(3) + "\"}"), 422);
    }

    @Test
    void notesAreRecordedWithoutTheirTextInTheAuditRowAndSensitiveTextIsRefused() throws Exception {
        long before = auditCount(a, "PLACEMENT_NOTE");
        MvcResult r = send("owner", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"Renewal call booked for Friday\"}");
        assertStatus(r, 201);
        assertThat(json(r).path("notes").get(0).path("body").asText()).isEqualTo("Renewal call booked for Friday");
        assertThat(json(r).path("notesCount").asInt()).isEqualTo(1);
        assertThat(auditCount(a, "PLACEMENT_NOTE") - before).isEqualTo(1);
        assertThat(newestAudit(a).getDetails()).doesNotContain("Renewal");
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"SSN 123-45-6789\"}"), 422);
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"  \"}"), 422);
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    @Test
    void addingAPlacementRecordsItAndNothingMore() throws Exception {
        long before = auditCount(a, "PLACEMENT_CREATE");
        String body = "{\"consultantId\":" + spare.getId() + ",\"clientId\":" + globex.getId() + ",\"roleTitle\":\"Support Lead\",\"startDate\":\"" + today.minusDays(3) + "\",\"endDate\":\"" + today.plusDays(120)
            + "\",\"placementType\":\"C2C\",\"billRateMinor\":9500,\"rateUnit\":\"HOUR\",\"accountManagerMemberId\":" + mktMgr.getId() + "}";
        MvcResult r = send("owner", post(url()), body);
        assertStatus(r, 201);
        JsonNode d = json(r);
        assertThat(d.path("status").asText()).isEqualTo("ACTIVE");
        assertThat(d.path("placementType").asText()).isEqualTo("C2C");
        assertThat(d.path("accountManager").path("name").asText()).isEqualTo("Maria Lopez");
        assertThat(d.path("billRateMinor").asLong()).isEqualTo(9500L);
        assertThat(d.path("timeline").get(0).path("type").asText()).isEqualTo("CREATED");
        assertThat(auditCount(a, "PLACEMENT_CREATE") - before).isEqualTo(1);
        // the consultant is placed now: a second one is a conflict
        assertCode(send("owner", post(url()), body), 409, "ALREADY_PLACED");
        // a start date ahead makes it an upcoming placement
        MvcResult up = send("owner", post(url()), "{\"consultantId\":" + k5.getId() + ",\"clientId\":" + initech.getId() + ",\"roleTitle\":\"Analyst\",\"startDate\":\"" + today.plusDays(20) + "\"}");
        assertStatus(up, 201);
        assertThat(json(up).path("status").asText()).isEqualTo("UPCOMING");
        assertThat(json(up).path("startsInDays").asInt()).isEqualTo(20);
    }

    @Test
    void creationValidatesItsInputsIsIdempotentAndRefusesUnknownProperties() throws Exception {
        String ok = "{\"consultantId\":" + spare.getId() + ",\"clientId\":" + globex.getId() + ",\"roleTitle\":\"Support Lead\",\"startDate\":\"" + today + "\"}";
        assertStatus(send("owner", post(url()), "{\"clientId\":" + globex.getId() + "}"), 422);
        assertGeneric404(send("owner", post(url()), ok.replace(String.valueOf(spare.getId()), "999999")), "unknown consultant");
        assertGeneric404(send("owner", post(url()), ok.replace(String.valueOf(globex.getId()), "999999")), "unknown client");
        assertStatus(send("owner", post(url()), ok.replace("Support Lead", "")), 422);
        assertStatus(send("owner", post(url()), ok.replace("\"startDate\"", "\"endDate\":\"" + today.minusDays(5) + "\",\"startDate\"")), 422);
        assertStatus(send("owner", post(url()), ok.replace("\"startDate\"", "\"placementType\":\"WEEKEND\",\"startDate\"")), 422);
        assertStatus(send("owner", post(url()), ok.replace("\"startDate\"", "\"billRateMinor\":-5,\"startDate\"")), 422);
        assertCode(send("owner", post(url()), ok.replace("\"startDate\"", "\"accountManagerMemberId\":" + bOwner.getId() + ",\"startDate\"")), 422, "INVALID_MANAGER");
        assertStatus(send("owner", post(url()), ok.replace("Support Lead", "SSN 123-45-6789")), 422);
        // a property the request does not name is refused, so an organization id cannot ride along
        assertStatus(send("owner", post(url()), ok.replace("\"startDate\"", "\"orgId\":" + b.getId() + ",\"startDate\"")), 422);
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/extend"), "{\"endDate\":\"" + today.plusDays(300) + "\",\"orgId\":5}"), 422);
        assertStatus(send("owner", post(url() + "/" + p1.getId() + "/notes"), "{\"body\":\"hi\",\"authorMemberId\":1}"), 422);
        // the same key twice answers once
        String k = key();
        MvcResult first = call(login("owner"), post(url()), ok, null, k);
        MvcResult second = call(login("owner"), post(url()), ok, null, k);
        assertStatus(first, 201);
        assertStatus(second, 201);
        assertThat(second.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(json(second).path("id").asLong()).isEqualTo(json(first).path("id").asLong());
        long count = ((Number) em.createQuery("select count(p) from TalentPlacement p where p.orgId = :o and p.consultantId = :c").setParameter("o", a.getId()).setParameter("c", spare.getId()).getSingleResult()).longValue();
        assertThat(count).isEqualTo(1);
    }
}
