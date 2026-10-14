package com.dossier.api.service.ent.mkt.applications;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationClientRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationEventRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationLookupRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationNoteRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRequirementRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.*;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.lang.reflect.Field;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * The Applications board's service on plain objects and the REAL {@link MktScope}: scope (an unassigned consultant never appears and is a
 * 404), consent (SUMMARY shows the stage only, NONE is left out), KPI math from the event history, every filter, the funnel, overdue
 * actions, recent updates, and the four records a marketer may write (never a submission).
 */
class MktApplicationsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 13);
    private static final long ORG = 1L;

    private final MktApplicationRepository apps = mock(MktApplicationRepository.class);
    private final MktApplicationEventRepository events = mock(MktApplicationEventRepository.class);
    private final MktApplicationNoteRepository notes = mock(MktApplicationNoteRepository.class);
    private final MktApplicationLookupRepository consultants = mock(MktApplicationLookupRepository.class);
    private final MktApplicationClientRepository clients = mock(MktApplicationClientRepository.class);
    private final MktApplicationRequirementRepository requirements = mock(MktApplicationRequirementRepository.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final DataShareService shares = mock(DataShareService.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    private final OrgRoleService roles = mock(OrgRoleService.class);
    private final TenantModules modules = mock(TenantModules.class);
    private final AuthorizationService authorization = mock(AuthorizationService.class);

    private MktApplicationsService service;
    private final List<TalentApplication> allApps = new ArrayList<>();
    private final List<TalentApplicationEvent> allEvents = new ArrayList<>();
    private final Map<Long, ConsultantProfile> people = new LinkedHashMap<>();
    private long nextId = 1000;

    @BeforeEach
    void wire() {
        when(roles.rolesFromData(ORG)).thenReturn(true);
        when(modules.isOn(TenantModule.MARKETING, ORG)).thenReturn(true);
        MktScope scope = new MktScope(roles, modules, authorization, assignments);
        service = new MktApplicationsService(scope, apps, events, notes, consultants, clients, requirements, members, users, shares, audit, Clock.fixed(NOW, ZoneOffset.UTC));

        when(apps.findByOrgId(ORG)).thenAnswer(i -> List.copyOf(allApps));
        // the repository is deliberately NAIVE here: it returns every row, the service must still never show an unseen consultant
        when(apps.findByOrgIdAndConsultantIdIn(eq(ORG), anyCollection())).thenAnswer(i -> List.copyOf(allApps));
        when(apps.findByOrgIdAndId(eq(ORG), anyLong())).thenAnswer(i -> allApps.stream().filter(a -> a.getId().equals(i.getArgument(1))).findFirst());
        when(events.findByOrgIdAndApplicationIdIn(eq(ORG), anyCollection())).thenAnswer(i -> allEvents.stream().filter(e -> ((java.util.Collection<?>) i.getArgument(1)).contains(e.getApplicationId())).toList());
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(i -> people.values().stream().filter(c -> ((java.util.Collection<?>) i.getArgument(1)).contains(c.getId())).toList());
        when(requirements.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(i -> ((java.util.Collection<?>) i.getArgument(1)).stream().map(id -> requirement((Long) id)).toList());
        when(clients.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(i -> ((java.util.Collection<?>) i.getArgument(1)).stream().map(id -> client((Long) id)).toList());
        when(members.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(i -> ((java.util.Collection<?>) i.getArgument(1)).stream().map(id -> seat((Long) id)).toList());
        when(users.findAllById(any())).thenReturn(List.of());
        when(shares.scopeOf(anyLong(), anyLong())).thenReturn(ShareScope.FULL);
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------------

    private static void set(Object o, String field, Object v) {
        try {
            Field f = o.getClass().getDeclaredField(field);
            f.setAccessible(true);
            f.set(o, v);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    private ConsultantProfile consultant(long id, String name, Long memberId) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setMemberId(memberId);
        people.put(id, c);
        return c;
    }

    private static ClientRequirement requirement(long id) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setOrgId(ORG);
        r.setClientId(id >= 200 ? 101L : 100L);
        r.setTitle(id == 200 ? "Senior Java Developer" : "Data Analyst");
        return r;
    }

    private static ClientAccount client(long id) {
        ClientAccount c = new ClientAccount();
        c.setId(id);
        c.setOrgId(ORG);
        c.setName(id == 100 ? "TechCorp" : "Global Bank");
        return c;
    }

    private static OrgMember seat(long id) {
        OrgMember m = new OrgMember();
        set(m, "id", id);
        m.setDisplayLabel(id == 7 ? "Sarah Chen" : "Member " + id);
        return m;
    }

    /** An application: {@code requirementId} 200 = Senior Java Developer at TechCorp (client 100), anything else Data Analyst at Global Bank (101). */
    private TalentApplication app(long consultantId, long requirementId, String stage, String reason, int appliedDaysAgo) {
        TalentApplication a = new TalentApplication();
        a.setId(++nextId);
        a.setOrgId(ORG);
        a.setCode("APP-2026-" + nextId);
        a.setConsultantId(consultantId);
        a.setRequirementId(requirementId);
        a.setClientId(requirementId == 200 ? 100L : 101L);
        a.setMarketerMemberId(7L);
        a.setStage(stage);
        a.setClosedReason(reason);
        a.setAppliedOn(TODAY.minusDays(appliedDaysAgo));
        a.setSourceLabel("LinkedIn");
        a.setCreatedAt(NOW.minus(appliedDaysAgo, ChronoUnit.DAYS));
        allApps.add(a);
        return a;
    }

    private void event(TalentApplication a, String type, String to, double daysAgo) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setId(++nextId);
        e.setOrgId(ORG);
        e.setApplicationId(a.getId());
        e.setEventType(type);
        e.setToStage(to);
        e.setOccurredAt(NOW.minusSeconds((long) (daysAgo * 86400)));
        allEvents.add(e);
    }

    private OrgMembership marketer(String... writeKeys) {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        grants.put("member.view_summary", PermissionScope.ASSIGNED);
        grants.put("pipeline.view", PermissionScope.ASSIGNED);
        for (String k : writeKeys) grants.put(k, PermissionScope.ASSIGNED);
        return new OrgMembership(ORG, 7L, 70L, "sarah", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(1L, "MARKETING_SPECIALIST", "Marketing Specialist", true)), grants);
    }

    private OrgMembership orgWide() {
        Map<String, PermissionScope> grants = new LinkedHashMap<>();
        grants.put("member.view_summary", PermissionScope.ORG);
        grants.put("pipeline.view", PermissionScope.ORG);
        return new OrgMembership(ORG, 8L, 80L, "omar", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(new OrgMembership.RoleRef(2L, "ORG_ADMIN", "Admin", true)), grants);
    }

    private void assigned(long... consultantIds) {
        List<MarketerAssignment> rows = new ArrayList<>();
        for (long id : consultantIds) {
            MarketerAssignment a = new MarketerAssignment();
            a.setOrgId(ORG);
            a.setConsultantId(id);
            a.setMarketerMemberId(7L);
            rows.add(a);
        }
        when(assignments.findByOrgIdAndMarketerMemberId(ORG, 7L)).thenReturn(rows);
        when(assignments.findByOrgIdAndBackupMemberId(ORG, 7L)).thenReturn(List.of());
    }

    private static Query all() {
        return new Query(null, null, null, null, null, null, null, 0, 50);
    }

    private static Query with(String q, Long consultant, Long client, String stage, String period, String sort) {
        return new Query(q, consultant, client, stage, period, null, sort, 0, 50);
    }

    /** The KPI fixture: 5 applications of Alex (consultant 10, a seat that shares FULL). */
    private TalentApplication[] book() {
        consultant(10, "Alex Morgan", 910L);
        assigned(10);
        TalentApplication offer = app(10, 200, "OFFER", null, 60);
        event(offer, "CREATED", "ASSIGNED", 60);
        event(offer, "STAGE_CHANGE", "SUBMITTED", 50);
        event(offer, "STAGE_CHANGE", "UNDER_REVIEW", 40);
        event(offer, "STAGE_CHANGE", "INTERVIEWING", 20);
        event(offer, "STAGE_CHANGE", "OFFER", 4);
        TalentApplication review = app(10, 201, "UNDER_REVIEW", null, 45);
        event(review, "CREATED", "ASSIGNED", 45);
        event(review, "STAGE_CHANGE", "UNDER_REVIEW", 5);
        review.setNextAction("Follow up with hiring manager");
        review.setNextActionDue(TODAY.minusDays(3));
        TalentApplication hired = app(10, 202, "CLOSED", "HIRED", 80);
        event(hired, "CREATED", "ASSIGNED", 80);
        event(hired, "STAGE_CHANGE", "INTERVIEWING", 50);
        event(hired, "STAGE_CHANGE", "OFFER", 40);
        event(hired, "STAGE_CHANGE", "CLOSED", 10);
        hired.setNextAction("Old action on a closed row");
        hired.setNextActionDue(TODAY.minusDays(20));
        TalentApplication applied = app(10, 203, "SUBMITTED", null, 2);
        event(applied, "CREATED", "ASSIGNED", 2);
        applied.setNextAction("Check application status");
        applied.setNextActionDue(TODAY.minusDays(1));
        TalentApplication second = app(10, 204, "UNDER_REVIEW", null, 20);
        event(second, "CREATED", "ASSIGNED", 20);
        event(second, "STAGE_CHANGE", "UNDER_REVIEW", 3);
        second.setNextAction("Future action");
        second.setNextActionDue(TODAY.plusDays(4));
        return new TalentApplication[] { offer, review, hired, applied, second };
    }

    // ---- stage map --------------------------------------------------------------------------------------------------------------

    @Test
    void stageMapIsTheDocumentedOne() {
        assertThat(MktApplicationStages.of("ASSIGNED", null)).isEqualTo(MktApplicationStages.Group.APPLIED);
        assertThat(MktApplicationStages.of("SUBMITTED", null)).isEqualTo(MktApplicationStages.Group.APPLIED);
        assertThat(MktApplicationStages.of("UNDER_REVIEW", null)).isEqualTo(MktApplicationStages.Group.AWAITING);
        assertThat(MktApplicationStages.of("INTERVIEWING", null)).isEqualTo(MktApplicationStages.Group.INTERVIEWING);
        assertThat(MktApplicationStages.of("OFFER", null)).isEqualTo(MktApplicationStages.Group.OFFER);
        assertThat(MktApplicationStages.of("CLOSED", "HIRED")).isEqualTo(MktApplicationStages.Group.HIRED);
        for (String r : new String[] { "REJECTED", "NO_RESPONSE", "WITHDRAWN", null }) assertThat(MktApplicationStages.of("CLOSED", r)).isEqualTo(MktApplicationStages.Group.NOT_SELECTED);
    }

    // ---- scope ------------------------------------------------------------------------------------------------------------------

    @Test
    void emptyOrgIsAllEmptyStatesNeverMadeUpNumbers() {
        assigned();
        Response r = service.get(marketer(), all());
        assertThat(r.tracker().items()).isEmpty();
        assertThat(r.tracker().total()).isZero();
        assertThat(r.kpis()).extracting(Kpi::value).containsExactly(0L, 0L, 0L, 0L);
        assertThat(r.kpis()).allSatisfy(k -> assertThat(k.deltaPct()).isNull());
        assertThat(r.funnel().total()).isZero();
        assertThat(r.overdue()).isEmpty();
        assertThat(r.updates()).isEmpty();
        assertThat(r.tracker().tabs()).extracting(Tab::count).containsOnly(0L);
        verify(apps, never()).findByOrgIdAndConsultantIdIn(anyLong(), anyCollection());
        verify(apps, never()).findByOrgId(anyLong());
    }

    @Test
    void anUnassignedConsultantNeverAppearsAndIsA404() {
        consultant(10, "Alex Morgan", 910L);
        consultant(11, "Priya Sharma", 911L);
        assigned(10);
        TalentApplication mine = app(10, 200, "SUBMITTED", null, 5);
        TalentApplication notMine = app(11, 201, "OFFER", null, 5);
        Response r = service.get(marketer("followups.manage", "submissions.record"), all());
        assertThat(r.tracker().items()).extracting(Row::id).containsExactly(mine.getId());
        assertThat(r.tracker().filters().consultants()).extracting(Option::name).containsExactly("Alex Morgan");
        assertThat(r.kpis().get(0).value()).isEqualTo(1L);
        assertThat(r.funnel().total()).isEqualTo(1L);
        assertThatThrownBy(() -> service.addNote(marketer("followups.manage"), notMine.getId(), new NoteRequest("hello"))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), notMine.getId(), new StageRequest("offer", null))).isInstanceOf(OrgNotFoundException.class);
        verify(notes, never()).save(any());
    }

    @Test
    void anOrgWideCallerSeesEveryConsultant() {
        consultant(10, "Alex Morgan", 910L);
        consultant(11, "Priya Sharma", 911L);
        app(10, 200, "SUBMITTED", null, 5);
        app(11, 201, "OFFER", null, 5);
        assertThat(service.get(orgWide(), all()).tracker().total()).isEqualTo(2L);
    }

    @Test
    void withoutPipelineViewOrTheReadKeyItIsTheGeneric404() {
        consultant(10, "Alex Morgan", 910L);
        assigned(10);
        Map<String, PermissionScope> noPipeline = Map.of("member.view_summary", PermissionScope.ASSIGNED);
        OrgMembership a = new OrgMembership(ORG, 7L, 70L, "x", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), noPipeline);
        assertThatThrownBy(() -> service.get(a, all())).isInstanceOf(OrgNotFoundException.class);
        Map<String, PermissionScope> noRead = Map.of("pipeline.view", PermissionScope.ASSIGNED);
        OrgMembership b = new OrgMembership(ORG, 7L, 70L, "x", OrgRole.ADMIN, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), noRead);
        assertThatThrownBy(() -> service.get(b, all())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.get(null, all())).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- consent ----------------------------------------------------------------------------------------------------------------

    @Test
    void summaryShowsTheStageOnlyAndNoneIsLeftOutAndCounted() {
        consultant(10, "Alex Morgan", 910L);
        consultant(12, "Dana Summary", 500L);
        consultant(13, "Evan Private", 501L);
        assigned(10, 12, 13);
        when(shares.scopeOf(ORG, 500L)).thenReturn(ShareScope.SUMMARY);
        when(shares.scopeOf(ORG, 501L)).thenReturn(ShareScope.NONE);
        TalentApplication full = app(10, 200, "SUBMITTED", null, 5);
        TalentApplication summary = app(12, 201, "INTERVIEWING", null, 6);
        summary.setNextAction("Secret next step");
        summary.setNextActionDue(TODAY.minusDays(2));
        event(summary, "STAGE_CHANGE", "INTERVIEWING", 1);
        event(summary, "NOTE", null, 0.5);
        app(13, 201, "OFFER", null, 7);

        Response r = service.get(marketer(), all());
        assertThat(r.tracker().items()).hasSize(2);
        Row s = r.tracker().items().stream().filter(x -> x.id().equals(summary.getId())).findFirst().orElseThrow();
        assertThat(s.consultant().consent()).isEqualTo("SUMMARY");
        assertThat(s.stage().label()).isEqualTo("Interviewing");
        assertThat(s.role()).isNull();
        assertThat(s.client()).isNull();
        assertThat(s.source()).isNull();
        assertThat(s.appliedOn()).isNull();
        assertThat(s.nextAction()).isNull();
        assertThat(s.nextActionDue()).isNull();
        Row f = r.tracker().items().stream().filter(x -> x.id().equals(full.getId())).findFirst().orElseThrow();
        assertThat(f.consultant().consent()).isEqualTo("FULL");
        assertThat(f.role()).isEqualTo("Senior Java Developer");
        assertThat(r.tracker().notShared()).isEqualTo(1);
        assertThat(r.tracker().filters().consultants()).extracting(Option::name).doesNotContain("Evan Private");
        assertThat(r.tracker().filters().clients()).extracting(Option::name).containsExactly("TechCorp");
        assertThat(r.overdue()).isEmpty(); // a SUMMARY consultant's next action is not shared
        assertThat(r.updates()).hasSize(1); // only the stage movement is shared below FULL, with no detail
        assertThat(r.updates().get(0).detail()).isNull();
        assertThat(r.kpis().get(0).value()).isEqualTo(2L);
        // a client filter cannot match a hidden employer
        assertThat(service.get(marketer(), with(null, null, 101L, null, null, null)).tracker().items()).isEmpty();
        assertThat(service.get(marketer(), with("secret", null, null, null, null, null)).tracker().items()).isEmpty();
        assertThat(service.get(marketer(), with("dana", null, null, null, null, null)).tracker().items()).hasSize(1);
    }

    // ---- KPIs, tabs, filters ----------------------------------------------------------------------------------------------------

    @Test
    void kpisAreCountedFromRowsAndCompareAgainstThirtyDaysAgoFromEvents() {
        book();
        List<Kpi> k = service.get(marketer(), all()).kpis();
        assertThat(k).extracting(Kpi::key).containsExactly("active", "awaiting", "interviewing", "offers");
        assertThat(k.get(0).value()).isEqualTo(4L); // offer, review, applied, second (the hired one is closed)
        assertThat(k.get(0).deltaPct()).isEqualTo(33.3); // 3 were open 30 days ago
        assertThat(k.get(1).value()).isEqualTo(2L);
        assertThat(k.get(1).deltaPct()).isEqualTo(100.0); // only one was under review then
        assertThat(k.get(2).value()).isZero();
        assertThat(k.get(2).deltaPct()).isNull(); // nothing to compare with: no chip
        assertThat(k.get(3).value()).isEqualTo(1L);
        assertThat(k.get(3).deltaPct()).isEqualTo(0.0);
        assertThat(k).allSatisfy(x -> {
            assertThat(x.sparkline()).hasSize(8);
            assertThat(x.sparkline().get(7)).isEqualTo(x.value());
        });
    }

    @Test
    void tabsCountUnderTheFiltersAndTheStageFilterPicksOne() {
        book();
        Response r = service.get(marketer(), all());
        assertThat(r.tracker().tabs()).extracting(Tab::key).containsExactly("all", "applied", "awaiting", "interviewing", "offer", "hired", "not_selected");
        assertThat(r.tracker().tabs()).extracting(Tab::label).containsExactly("All Applications", "Applied", "Awaiting Response", "Interviewing", "Offer", "Hired", "Not Selected");
        assertThat(r.tracker().tabs()).extracting(Tab::count).containsExactly(5L, 1L, 2L, 0L, 1L, 1L, 0L);
        Response awaiting = service.get(marketer(), with(null, null, null, "awaiting", null, null));
        assertThat(awaiting.tracker().total()).isEqualTo(2L);
        assertThat(awaiting.tracker().tabs().get(0).count()).isEqualTo(5L); // the tabs ignore the stage filter itself
        assertThat(service.get(marketer(), with(null, null, null, "bogus", null, null)).tracker().total()).isEqualTo(5L);
    }

    @Test
    void searchClientConsultantAndPeriodFilters() {
        book();
        assertThat(service.get(marketer(), with("java", null, null, null, null, null)).tracker().total()).isEqualTo(1L);
        assertThat(service.get(marketer(), with("global", null, null, null, null, null)).tracker().total()).isEqualTo(4L);
        assertThat(service.get(marketer(), with("alex", null, null, null, null, null)).tracker().total()).isEqualTo(5L);
        assertThat(service.get(marketer(), with("nobody", null, null, null, null, null)).tracker().total()).isZero();
        assertThat(service.get(marketer(), with(null, null, 100L, null, null, null)).tracker().total()).isEqualTo(1L);
        assertThat(service.get(marketer(), with(null, 10L, null, null, null, null)).tracker().total()).isEqualTo(5L);
        assertThat(service.get(marketer(), with(null, 99L, null, null, null, null)).tracker().total()).isZero();
        assertThat(service.get(marketer(), with(null, null, null, null, "1m", null)).tracker().total()).isEqualTo(2L); // applied 2 and 20 days ago
        assertThat(service.get(marketer(), with(null, null, null, null, "3m", null)).tracker().total()).isEqualTo(5L);
        assertThat(service.get(marketer(), with(null, null, null, null, null, null)).tracker().total()).isEqualTo(5L); // default is 3 months
        assertThat(service.get(marketer(), with(null, null, null, null, "all", null)).tracker().total()).isEqualTo(5L);
    }

    @Test
    void sortAndPaging() {
        TalentApplication[] b = book();
        Response desc = service.get(marketer(), new Query(null, null, null, null, null, null, "appliedOn,desc", 0, 2));
        assertThat(desc.tracker().items()).extracting(Row::id).containsExactly(b[3].getId(), b[4].getId());
        assertThat(desc.tracker().total()).isEqualTo(5L);
        assertThat(desc.tracker().size()).isEqualTo(2);
        Response asc = service.get(marketer(), new Query(null, null, null, null, null, null, "appliedOn,asc", 0, 2));
        assertThat(asc.tracker().items()).extracting(Row::id).containsExactly(b[2].getId(), b[0].getId());
        Response page3 = service.get(marketer(), new Query(null, null, null, null, null, null, "appliedOn,asc", 2, 2));
        assertThat(page3.tracker().items()).hasSize(1);
        assertThat(service.get(marketer(), new Query(null, null, null, null, null, null, null, 0, 0)).tracker().size()).isEqualTo(8); // the board's 8 rows
        assertThat(service.get(marketer(), new Query(null, null, null, null, null, null, null, 0, 5000)).tracker().size()).isEqualTo(100);
    }

    @Test
    void aRowCarriesTheBoardColumns() {
        TalentApplication[] b = book();
        Row r = service.get(marketer(), all()).tracker().items().stream().filter(x -> x.id().equals(b[0].getId())).findFirst().orElseThrow();
        assertThat(r.consultant().name()).isEqualTo("Alex Morgan");
        assertThat(r.role()).isEqualTo("Senior Java Developer");
        assertThat(r.client()).isEqualTo("TechCorp");
        assertThat(r.source()).isEqualTo("LinkedIn");
        assertThat(r.appliedOn()).isEqualTo(TODAY.minusDays(60));
        assertThat(r.stage()).isEqualTo(new StageRef("offer", "Offer"));
        assertThat(r.owner()).isEqualTo(new Person(7L, "Sarah Chen", null));
    }

    // ---- funnel, overdue, updates -----------------------------------------------------------------------------------------------

    @Test
    void funnelCountsHowFarEachApplicationGotAndPercentsAreOfTheTotal() {
        book();
        Funnel f = service.get(marketer(), all()).funnel();
        assertThat(f.period()).isEqualTo("3m");
        assertThat(f.total()).isEqualTo(5L);
        assertThat(f.stages()).extracting(FunnelStageRow::label).containsExactly("Applied", "Awaiting Response", "Interviewing", "Offers", "Hired");
        assertThat(f.stages()).extracting(FunnelStageRow::count).containsExactly(5L, 4L, 2L, 2L, 1L);
        assertThat(f.stages()).extracting(FunnelStageRow::pct).containsExactly(100, 80, 40, 40, 20);
        assertThat(service.get(marketer(), new Query(null, null, null, null, null, "1m", null, 0, 8)).funnel().total()).isEqualTo(2L);
    }

    @Test
    void overdueActionsAreOpenRowsPastDueMostOverdueFirst() {
        TalentApplication[] b = book();
        Response r = service.get(marketer(), all());
        assertThat(r.overdueTotal()).isEqualTo(2L);
        assertThat(r.overdue()).extracting(Overdue::id).containsExactly(b[1].getId(), b[3].getId());
        assertThat(r.overdue().get(0).daysOverdue()).isEqualTo(3L);
        assertThat(r.overdue().get(0).title()).isEqualTo("Follow up with hiring manager");
        assertThat(r.overdue().get(0).sub()).isEqualTo("Global Bank - Data Analyst");
        assertThat(r.overdue().get(1).daysOverdue()).isEqualTo(1L);
    }

    @Test
    void recentUpdatesAreTheNewestEventsWithTheBoardsTones() {
        book();
        List<Update> u = service.get(marketer(), all()).updates();
        assertThat(u).hasSize(5);
        assertThat(u.get(0).text()).isEqualTo("application added");
        assertThat(u.get(0).tone()).isEqualTo("blue");
        assertThat(u.get(1).text()).isEqualTo("moved to Awaiting Response");
        assertThat(u.get(1).tone()).isEqualTo("violet");
        assertThat(u.get(2).text()).isEqualTo("moved to Offer");
        assertThat(u.get(2).tone()).isEqualTo("green");
        assertThat(u.get(2).detail()).isEqualTo("Senior Java Developer at TechCorp");
        assertThat(u).extracting(Update::at).isSortedAccordingTo(java.util.Comparator.reverseOrder());
    }

    // ---- writes: records only (E1) ----------------------------------------------------------------------------------------------

    @Test
    void addNoteSavesTheNoteAndLeavesAnEventAndAnAuditRow() {
        TalentApplication[] b = book();
        Row row = service.addNote(marketer("followups.manage"), b[1].getId(), new NoteRequest("  Called the vendor, waiting on feedback  "));
        ArgumentCaptor<TalentApplicationNote> n = ArgumentCaptor.forClass(TalentApplicationNote.class);
        verify(notes).save(n.capture());
        assertThat(n.getValue().getBody()).isEqualTo("Called the vendor, waiting on feedback");
        assertThat(n.getValue().getOrgId()).isEqualTo(ORG);
        assertThat(n.getValue().getAuthorMemberId()).isEqualTo(7L);
        ArgumentCaptor<TalentApplicationEvent> e = ArgumentCaptor.forClass(TalentApplicationEvent.class);
        verify(events).save(e.capture());
        assertThat(e.getValue().getEventType()).isEqualTo("NOTE");
        assertThat(e.getValue().getDetail()).isEqualTo("Note added"); // the note text itself stays in the notes table
        verify(audit).record(any(OrgMembership.class), eq("MKT_APPLICATION_NOTE"), eq("APPLICATION"), any(), eq(String.valueOf(b[1].getId())), any());
        assertThat(row.id()).isEqualTo(b[1].getId());
    }

    @Test
    void addNoteRefusesEmptyOverlongAndSensitiveText() {
        TalentApplication[] b = book();
        OrgMembership me = marketer("followups.manage");
        assertThatThrownBy(() -> service.addNote(me, b[1].getId(), new NoteRequest("   "))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.addNote(me, b[1].getId(), new NoteRequest("x".repeat(1001)))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.addNote(me, b[1].getId(), new NoteRequest("his SSN is 123-45-6789"))).isInstanceOf(RuntimeException.class);
        verify(notes, never()).save(any());
    }

    @Test
    void writesNeedTheirOwnKey() {
        TalentApplication[] b = book();
        assertThatThrownBy(() -> service.addNote(marketer(), b[1].getId(), new NoteRequest("hi"))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.recordStage(marketer("followups.manage"), b[1].getId(), new StageRequest("offer", null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.setNextAction(marketer("submissions.record"), b[1].getId(), new NextActionRequest("x", null))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void aWriteOnAConsultantWhoSharesOnlyASummaryIsA404() {
        consultant(12, "Dana Summary", 500L);
        assigned(12);
        when(shares.scopeOf(ORG, 500L)).thenReturn(ShareScope.SUMMARY);
        TalentApplication a = app(12, 201, "SUBMITTED", null, 3);
        assertThatThrownBy(() -> service.addNote(marketer("followups.manage"), a.getId(), new NoteRequest("hi"))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.setNextAction(marketer("followups.manage"), a.getId(), new NextActionRequest("x", null))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void setNextActionSetsTextAndDueAndAnEmptyTextClearsBoth() {
        TalentApplication[] b = book();
        Row row = service.setNextAction(marketer("followups.manage"), b[4].getId(), new NextActionRequest("  Send updated resume ", TODAY.plusDays(2)));
        assertThat(row.nextAction()).isEqualTo("Send updated resume");
        assertThat(row.nextActionDue()).isEqualTo(TODAY.plusDays(2));
        assertThat(b[4].getNextAction()).isEqualTo("Send updated resume");
        verify(apps).save(b[4]);
        Row cleared = service.setNextAction(marketer("followups.manage"), b[4].getId(), new NextActionRequest("", TODAY));
        assertThat(cleared.nextAction()).isNull();
        assertThat(cleared.nextActionDue()).isNull();
        assertThatThrownBy(() -> service.setNextAction(marketer("followups.manage"), b[4].getId(), new NextActionRequest("y".repeat(121), null))).isInstanceOf(OrgException.class);
    }

    @Test
    void markFollowUpDoneClearsTheActionAndOnlyWorksWhenThereIsOne() {
        TalentApplication[] b = book();
        Row row = service.markFollowUpDone(marketer("followups.manage"), b[1].getId());
        assertThat(row.nextAction()).isNull();
        assertThat(b[1].getNextActionDue()).isNull();
        ArgumentCaptor<TalentApplicationEvent> e = ArgumentCaptor.forClass(TalentApplicationEvent.class);
        verify(events).save(e.capture());
        assertThat(e.getValue().getDetail()).isEqualTo("Follow-up done: Follow up with hiring manager");
        assertThatThrownBy(() -> service.markFollowUpDone(marketer("followups.manage"), b[1].getId())).isInstanceOf(OrgException.class);
        // and the overdue list no longer shows it
        assertThat(service.get(marketer(), all()).overdue()).extracting(Overdue::id).containsExactly(b[3].getId());
    }

    @Test
    void recordStageIsAnEventOnTheTimelineNotASubmission() {
        TalentApplication[] b = book();
        Row row = service.recordStage(marketer("submissions.record"), b[3].getId(), new StageRequest("interviewing", null));
        assertThat(row.stage().key()).isEqualTo("interviewing");
        assertThat(b[3].getStage()).isEqualTo("INTERVIEWING");
        ArgumentCaptor<TalentApplicationEvent> e = ArgumentCaptor.forClass(TalentApplicationEvent.class);
        verify(events).save(e.capture());
        assertThat(e.getValue().getEventType()).isEqualTo("STAGE_CHANGE");
        assertThat(e.getValue().getFromStage()).isEqualTo("SUBMITTED");
        assertThat(e.getValue().getToStage()).isEqualTo("INTERVIEWING");
        assertThat(e.getValue().getActorMemberId()).isEqualTo(7L);
        verify(audit).record(any(OrgMembership.class), eq("MKT_APPLICATION_STAGE_RECORDED"), eq("APPLICATION"), any(), any(), any());
    }

    @Test
    void recordStageNotSelectedTakesAReasonAndHiredSetsHired() {
        TalentApplication[] b = book();
        service.recordStage(marketer("submissions.record"), b[3].getId(), new StageRequest("not_selected", "no_response"));
        assertThat(b[3].getStage()).isEqualTo("CLOSED");
        assertThat(b[3].getClosedReason()).isEqualTo("NO_RESPONSE");
        service.recordStage(marketer("submissions.record"), b[4].getId(), new StageRequest("not_selected", null));
        assertThat(b[4].getClosedReason()).isEqualTo("REJECTED");
        service.recordStage(marketer("submissions.record"), b[1].getId(), new StageRequest("hired", null));
        assertThat(b[1].getClosedReason()).isEqualTo("HIRED");
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), b[0].getId(), new StageRequest("not_selected", "FIRED"))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), b[0].getId(), new StageRequest("nope", null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), b[0].getId(), null)).isInstanceOf(OrgException.class);
    }

    @Test
    void recordingTheStageItAlreadyHasChangesNothing() {
        TalentApplication[] b = book();
        service.recordStage(marketer("submissions.record"), b[0].getId(), new StageRequest("offer", null));
        verify(events, never()).save(any());
        verify(apps, never()).save(any());
    }

    @Test
    void anUnknownApplicationIsA404() {
        book();
        assertThatThrownBy(() -> service.addNote(marketer("followups.manage"), 424242L, new NoteRequest("hi"))).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- stage ownership and seat-less consultants (doc 60 sections 0.4 and 0.8) ---------------------------------------------------

    @Test
    void aConsultantWithoutASeatIsSummaryAtMostNeverFull() {
        consultant(10, "Alex Morgan", null);
        assigned(10);
        TalentApplication a = app(10, 200, "INTERVIEWING", null, 6);
        a.setNextAction("Secret next step");
        Response r = service.get(marketer(), all());
        Row row = r.tracker().items().stream().filter(x -> x.id().equals(a.getId())).findFirst().orElseThrow();
        assertThat(row.consultant().consent()).isEqualTo("SUMMARY");
        assertThat(row.stage().label()).isEqualTo("Interviewing");
        assertThat(row.role()).isNull();
        assertThat(row.client()).isNull();
        assertThat(row.nextAction()).isNull();
        verify(shares, never()).scopeOf(anyLong(), org.mockito.ArgumentMatchers.isNull());
    }

    @Test
    void aRowThatFollowsTheConsultantsOwnApplicationRefusesAMarketerStage() {
        TalentApplication[] b = book();
        b[3].setPersonalApplicationId(555L);
        b[3].setStageSource("SYSTEM");
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), b[3].getId(), new StageRequest("interviewing", null)))
            .isInstanceOf(OrgException.class)
            .satisfies(e -> {
                assertThat(((OrgException) e).getStatus()).isEqualTo(409);
                assertThat(((OrgException) e).getCode()).isEqualTo("STAGE_OWNED_BY_CONSULTANT");
            });
        assertThat(b[3].getStage()).isEqualTo("SUBMITTED");
        verify(events, never()).save(any());
        verify(apps, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), eq("MKT_APPLICATION_STAGE_RECORDED"), any(), any(), any(), any());
    }

    @Test
    void theOwnershipRuleHoldsEvenWhenTheStageWouldNotChange() {
        TalentApplication[] b = book();
        b[0].setPersonalApplicationId(555L);
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), b[0].getId(), new StageRequest("offer", null))).isInstanceOf(OrgException.class);
    }

    @Test
    void notesAndNextActionsStayAllowedOnALinkedRow() {
        TalentApplication[] b = book();
        b[3].setPersonalApplicationId(555L);
        service.addNote(marketer("followups.manage"), b[3].getId(), new NoteRequest("Called the vendor"));
        service.setNextAction(marketer("followups.manage"), b[3].getId(), new NextActionRequest("Check in", TODAY.plusDays(2)));
        assertThat(b[3].getNextAction()).isEqualTo("Check in");
    }

    @Test
    void aMarketerStillRecordsTheStageOfAnUnlinkedRowOfAProfileWithoutASeat() {
        consultant(10, "Alex Morgan", null);
        assigned(10);
        TalentApplication a = app(10, 200, "SUBMITTED", null, 3);
        Row row = service.recordStage(marketer("submissions.record"), a.getId(), new StageRequest("interviewing", null));
        assertThat(row.stage().key()).isEqualTo("interviewing");
        assertThat(a.getStage()).isEqualTo("INTERVIEWING");
    }

    @Test
    void aSeatThatSharesLessThanFullStillCannotBeWrittenOn() {
        consultant(12, "Dana Summary", 500L);
        assigned(12);
        when(shares.scopeOf(ORG, 500L)).thenReturn(ShareScope.SUMMARY);
        TalentApplication a = app(12, 200, "SUBMITTED", null, 3);
        assertThatThrownBy(() -> service.recordStage(marketer("submissions.record"), a.getId(), new StageRequest("interviewing", null))).isInstanceOf(OrgNotFoundException.class);
    }
}
