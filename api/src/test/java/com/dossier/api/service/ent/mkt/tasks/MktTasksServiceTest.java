package com.dossier.api.service.ent.mkt.tasks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktTaskConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.ActionResult;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Calendar;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.CreateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Option;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Query;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Row;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tab;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.UpdateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.View;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Scope filtering, tab counts, KPI math, every list filter and the record-only writes of {@link MktTasksService}, with mocked repositories (no Docker). */
class MktTasksServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final Long ORG = 1L;
    private static final Long ME = 7L;
    private static final Long TEAMMATE = 8L;

    private final MktScope scope = mock(MktScope.class);
    private final MktTaskRepository repo = mock(MktTaskRepository.class);
    private final MktTaskEventRepository events = mock(MktTaskEventRepository.class);
    private final MktTaskConsultantRepository lookup = mock(MktTaskConsultantRepository.class);
    private final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    private final MarketerAssignmentRepository assignments = mock(MarketerAssignmentRepository.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgMembership me = new OrgMembership(ORG, ME, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktTasksService service;
    private MktScope.View assigned;

    @BeforeEach
    void setUp() {
        service = new MktTasksService(scope, repo, events, lookup, clients, assignments, members, users, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        assigned = new MktScope.View(ORG, ME, false, Set.of(11L, 12L));
        when(scope.resolve(me, "followups.manage")).thenReturn(assigned);
        doAnswer(inv -> {
            MktScope.View v = inv.getArgument(0);
            if (!v.sees(inv.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), anyLong());
        when(lookup.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<ConsultantProfile> out = new ArrayList<>();
            for (Long id : ids) out.add(consultant(id, id == 11L ? "Alex Morgan" : "Priya Sharma"));
            return out;
        });
        when(lookup.findTop200ByOrgIdOrderByDisplayNameAsc(ORG)).thenReturn(List.of(consultant(11L, "Alex Morgan"), consultant(12L, "Priya Sharma"), consultant(13L, "Ava Patel")));
        ClientAccount tech = new ClientAccount();
        tech.setId(5L);
        tech.setOrgId(ORG);
        tech.setName("TechCorp");
        when(clients.findByOrgId(ORG)).thenReturn(List.of(tech));
        when(clients.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(tech));
        OrgMember m7 = new OrgMember();
        m7.setId(ME);
        m7.setUserId(70L);
        OrgMember m8 = new OrgMember();
        m8.setId(TEAMMATE);
        m8.setUserId(80L);
        when(members.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<OrgMember> out = new ArrayList<>();
            if (ids.contains(ME)) out.add(m7);
            if (ids.contains(TEAMMATE)) out.add(m8);
            return out;
        });
        User u7 = new User();
        u7.setId(70L);
        u7.setFirstName("Sarah");
        u7.setLastName("Chen");
        User u8 = new User();
        u8.setId(80L);
        u8.setFirstName("Michael");
        u8.setLastName("Park");
        when(users.findAllById(any())).thenReturn(List.of(u7, u8));
        when(repo.save(any(MktTask.class))).thenAnswer(inv -> {
            MktTask t = inv.getArgument(0);
            if (t.getId() == null) t.setId(900L);
            return t;
        });
    }

    private static ConsultantProfile consultant(Long id, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setJobTitle("Java Developer");
        return c;
    }

    private static MktTask t(Long id, Long consultant, Long owner, String status, Instant due, Instant created, Instant completed, String priority, String category) {
        MktTask t = new MktTask();
        t.setId(id);
        t.setOrgId(ORG);
        t.setConsultantId(consultant);
        t.setOwnerMemberId(owner);
        t.setTitle("Task " + id);
        t.setDetail("Detail " + id);
        t.setStatus(status);
        t.setDueAt(due);
        t.setCreatedAt(created);
        t.setCompletedAt(completed);
        t.setPriority(priority);
        t.setCategory(category);
        return t;
    }

    private static Instant days(long d) {
        return NOW.plus(d, ChronoUnit.DAYS);
    }

    /** The visible set the repository hands back (soonest due first, as the query orders it). */
    private List<MktTask> board() {
        MktTask t2 = t(2L, null, ME, "PENDING", NOW.minus(3, ChronoUnit.HOURS), days(-10), null, "MEDIUM", "MARKETING");
        t2.setRelatedLabel("All Consultants");
        MktTask t4 = t(4L, 11L, TEAMMATE, "NOT_STARTED", days(9), days(-2), null, "LOW", "FOLLOW_UP");
        t4.setClientAccountId(5L);
        return List.of(
            t(7L, 12L, TEAMMATE, "COMPLETED", days(-9), days(-20), days(-9), "LOW", "CONTENT"),
            t(6L, 11L, ME, "COMPLETED", days(-10), days(-20), days(-10), "LOW", "CONTENT"),
            t(1L, 11L, ME, "IN_PROGRESS", days(-1), days(-10), null, "HIGH", "RESUME"),
            t(5L, 12L, ME, "COMPLETED", days(-2), days(-12), days(-2), "MEDIUM", "INTERVIEW"),
            t2,
            t(3L, 12L, ME, "PENDING", days(2), days(-2), null, "MEDIUM", "JOB_MATCH"),
            t4
        );
    }

    private void stubBoard() {
        when(repo.findVisibleOpenOrCompletedSince(eq(ORG), anyBoolean(), anyCollection(), eq(ME), any())).thenReturn(board());
    }

    private static Query q(Tab tab) {
        return new Query(tab, null, null, null, null, null, null, 0, 10, null);
    }

    private static List<Long> ids(View v) {
        return v.tasks().items().stream().map(Row::id).toList();
    }

    // ---- reach ---------------------------------------------------------------------------------------------------------

    @Test
    void anAssignedCallerAsksOnlyForTheirOwnTasksOfTheirConsultants() {
        stubBoard();
        service.view(me, q(Tab.ALL));
        ArgumentCaptor<Collection<Long>> idsCaptor = ArgumentCaptor.forClass(Collection.class);
        ArgumentCaptor<Instant> since = ArgumentCaptor.forClass(Instant.class);
        verify(repo).findVisibleOpenOrCompletedSince(eq(ORG), eq(false), idsCaptor.capture(), eq(ME), since.capture());
        assertThat(idsCaptor.getValue()).containsExactlyInAnyOrder(11L, 12L);
        assertThat(since.getValue()).isEqualTo(NOW.minus(30, ChronoUnit.DAYS));
    }

    @Test
    void aCallerWithNoConsultantsStillQueriesWithTheSentinelNeverAnEmptyList() {
        when(scope.resolve(me, "followups.manage")).thenReturn(new MktScope.View(ORG, ME, false, Set.of()));
        when(repo.findVisibleOpenOrCompletedSince(eq(ORG), eq(false), eq(List.of(-1L)), eq(ME), any())).thenReturn(List.of());
        View v = service.view(me, q(Tab.ALL));
        assertThat(v.tasks().items()).isEmpty();
        assertThat(v.options().consultants()).isEmpty();
    }

    @Test
    void noPermissionOrNoMembershipIsTheGenericNotFound() {
        when(scope.resolve(me, "followups.manage")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.view(me, q(Tab.ALL))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.calendar(me, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, null, null, null, NOW, null, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.complete(me, 1L)).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void anEmptyOrgDrawsZeroTilesNoDeltasAndEmptyTabs() {
        when(repo.findVisibleOpenOrCompletedSince(eq(ORG), anyBoolean(), anyCollection(), eq(ME), any())).thenReturn(List.of());
        View v = service.view(me, q(Tab.ALL));
        assertThat(v.tasks().total()).isZero();
        assertThat(v.upcoming()).isEmpty();
        assertThat(v.kpis()).extracting(MktTasksDto.Kpi::key).containsExactly("total", "overdue", "dueThisWeek", "completedThisWeek");
        assertThat(v.kpis()).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
            assertThat(k.sparkline()).hasSize(8);
        });
        assertThat(v.tabs()).isEqualTo(new MktTasksDto.Tabs(0, 0, 0, 0, 0, 0));
    }

    // ---- tabs, KPIs ----------------------------------------------------------------------------------------------------

    @Test
    void tabCountsSeparateOpenOverdueDueThisWeekAndCompleted() {
        stubBoard();
        View v = service.view(me, q(Tab.ALL));
        assertThat(v.tabs().all()).isEqualTo(4); // tasks 1, 2, 3, 4 are open
        assertThat(v.tabs().my()).isEqualTo(3);
        assertThat(v.tabs().team()).isEqualTo(1);
        assertThat(v.tabs().overdue()).isEqualTo(2); // 1 and 2
        assertThat(v.tabs().dueThisWeek()).isEqualTo(1); // 3 (4 is nine days out)
        assertThat(v.tabs().completed()).isEqualTo(1); // 5 (6 and 7 finished more than 7 days ago)
        assertThat(ids(v)).containsExactly(1L, 2L, 3L, 4L).as("ALL lists open tasks only, soonest due first").isNotNull();
    }

    @Test
    void everyTabListsItsOwnRows() {
        stubBoard();
        assertThat(ids(service.view(me, q(Tab.MY)))).containsExactly(1L, 2L, 3L);
        assertThat(ids(service.view(me, q(Tab.TEAM)))).containsExactly(4L);
        assertThat(ids(service.view(me, q(Tab.OVERDUE)))).containsExactly(1L, 2L);
        assertThat(ids(service.view(me, q(Tab.DUE_WEEK)))).containsExactly(3L);
        assertThat(ids(service.view(me, q(Tab.COMPLETED)))).containsExactly(5L);
    }

    @Test
    void kpiValuesAndDeltasComeFromTheRows() {
        stubBoard();
        View v = service.view(me, q(Tab.ALL));
        MktTasksDto.Kpi total = v.kpis().get(0);
        MktTasksDto.Kpi overdue = v.kpis().get(1);
        MktTasksDto.Kpi dueWeek = v.kpis().get(2);
        MktTasksDto.Kpi done = v.kpis().get(3);
        assertThat(total.value()).isEqualTo(4);
        assertThat(total.deltaPct()).isEqualTo(33.3); // 3 were open a week ago (1, 2, 5)
        assertThat(overdue.value()).isEqualTo(2);
        assertThat(overdue.deltaPct()).isNull(); // nothing was overdue a week ago: no previous value, no chip
        assertThat(dueWeek.value()).isEqualTo(1);
        assertThat(dueWeek.deltaPct()).isEqualTo(-66.7); // a week ago three open tasks (1, 2, 5) fell in the following week
        assertThat(done.value()).isEqualTo(1);
        assertThat(done.deltaPct()).isEqualTo(-50.0); // two completed in the week before
        assertThat(total.sparkline()).hasSize(8);
        assertThat(total.sparkline().get(7)).isEqualTo(4);
        assertThat(done.sparkline().get(5)).isEqualTo(1); // task 5 finished two days ago (index 7 is today)
    }

    @Test
    void upcomingDeadlinesAreTheNextOpenTasksNotTheOverdueOnes() {
        stubBoard();
        assertThat(service.view(me, q(Tab.ALL)).upcoming()).extracting(Row::id).containsExactly(3L, 4L);
    }

    // ---- filters, sort, paging -----------------------------------------------------------------------------------------

    @Test
    void everyFilterNarrowsTheList() {
        stubBoard();
        assertThat(ids(service.view(me, new Query(Tab.ALL, "RESUME", null, null, null, null, null, 0, 10, null)))).containsExactly(1L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, "low", null, null, null, null, 0, 10, null)))).containsExactly(4L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, "PENDING", null, null, null, 0, 10, null)))).containsExactly(2L, 3L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, "me", null, null, 0, 10, null)))).containsExactly(1L, 2L, 3L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, "8", null, null, 0, 10, null)))).containsExactly(4L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, "oops", null, null, 0, 10, null)))).isEmpty();
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, null, "2026-10-15", null, 0, 10, null)))).containsExactly(3L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, null, "not-a-date", null, 0, 10, null)))).isEmpty();
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, null, null, "all consult", 0, 10, null)))).containsExactly(2L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, "RESUME", "LOW", null, null, null, null, 0, 10, null)))).isEmpty();
    }

    @Test
    void sortsAndPages() {
        stubBoard();
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, null, null, null, 0, 10, "priority")))).containsExactly(1L, 2L, 3L, 4L);
        assertThat(ids(service.view(me, new Query(Tab.ALL, null, null, null, null, null, null, 0, 10, "dueAt,desc")))).containsExactly(4L, 3L, 2L, 1L);
        View p2 = service.view(me, new Query(Tab.ALL, null, null, null, null, null, null, 1, 2, null));
        assertThat(ids(p2)).containsExactly(3L, 4L);
        assertThat(p2.tasks().total()).isEqualTo(4);
        assertThat(p2.tasks().page()).isEqualTo(1);
        assertThat(service.view(me, new Query(Tab.ALL, null, null, null, null, null, null, 0, 5000, null)).tasks().size()).isEqualTo(100);
    }

    @Test
    void rowsCarryTheRelatedPartyTheOwnerAndTheDeleteRule() {
        stubBoard();
        View v = service.view(me, q(Tab.ALL));
        Row r1 = v.tasks().items().get(0);
        assertThat(r1.consultantName()).isEqualTo("Alex Morgan");
        assertThat(r1.ownerName()).isEqualTo("Sarah Chen");
        assertThat(r1.overdue()).isTrue();
        assertThat(r1.mine()).isTrue();
        assertThat(r1.canDelete()).isTrue();
        Row r2 = v.tasks().items().get(1);
        assertThat(r2.relatedLabel()).isEqualTo("All Consultants");
        Row r4 = v.tasks().items().get(3);
        assertThat(r4.clientName()).isEqualTo("TechCorp");
        assertThat(r4.mine()).isFalse();
        assertThat(r4.canDelete()).isFalse();
        assertThat(r4.ownerName()).isEqualTo("Michael Park");
    }

    @Test
    void theFormOffersOnlyTheConsultantsTheCallerMaySee() {
        stubBoard();
        assertThat(service.view(me, q(Tab.ALL)).options().consultants()).extracting(Option::id).containsExactlyInAnyOrder(11L, 12L);
        when(scope.resolve(me, "followups.manage")).thenReturn(new MktScope.View(ORG, ME, true, Set.of()));
        assertThat(service.view(me, q(Tab.ALL)).options().consultants()).extracting(Option::id).containsExactly(11L, 12L, 13L);
        assertThat(service.view(me, q(Tab.ALL)).wide()).isTrue();
    }

    @Test
    void theCalendarGroupsTasksByDayWithTheirTopPriority() {
        MktTask a = t(1L, 11L, ME, "PENDING", Instant.parse("2026-10-15T09:00:00Z"), days(-1), null, "LOW", "RESUME");
        MktTask b = t(2L, 11L, ME, "PENDING", Instant.parse("2026-10-15T15:00:00Z"), days(-1), null, "HIGH", "RESUME");
        MktTask c = t(3L, 11L, ME, "COMPLETED", Instant.parse("2026-10-20T15:00:00Z"), days(-1), NOW, "MEDIUM", "RESUME");
        when(repo.findVisibleDueBetween(eq(ORG), eq(false), anyCollection(), eq(ME), eq(Instant.parse("2026-10-01T00:00:00Z")), eq(Instant.parse("2026-11-01T00:00:00Z")))).thenReturn(List.of(a, b, c));
        Calendar cal = service.calendar(me, "2026-10");
        assertThat(cal.month()).isEqualTo("2026-10");
        assertThat(cal.days()).hasSize(2);
        assertThat(cal.days().get(0)).isEqualTo(new MktTasksDto.CalendarDay("2026-10-15", 2, 2, "HIGH"));
        assertThat(cal.days().get(1)).isEqualTo(new MktTasksDto.CalendarDay("2026-10-20", 1, 0, "MEDIUM"));
        assertThat(service.calendar(me, "garbage").month()).isEqualTo("2026-10"); // falls back to the current month
    }

    // ---- writes (record only) ------------------------------------------------------------------------------------------

    @Test
    void createRecordsATaskForOneOfMyConsultantsAndNeverEmails() {
        ActionResult r = service.create(me, new CreateRequest("Review resume", null, "resume", "high", null, days(1), 11L, 5L, null, null));
        ArgumentCaptor<MktTask> saved = ArgumentCaptor.forClass(MktTask.class);
        verify(repo).save(saved.capture());
        MktTask t = saved.getValue();
        assertThat(t.getOrgId()).isEqualTo(ORG);
        assertThat(t.getOwnerMemberId()).isEqualTo(ME);
        assertThat(t.getCreatedByMemberId()).isEqualTo(ME);
        assertThat(t.getCategory()).isEqualTo("RESUME");
        assertThat(t.getPriority()).isEqualTo("HIGH");
        assertThat(t.getStatus()).isEqualTo("NOT_STARTED");
        assertThat(t.getDetail()).isEqualTo("Alex Morgan - Java Developer");
        assertThat(r.emailed()).isFalse();
        assertThat(r.event()).isEqualTo("CREATED");
        assertThat(r.item().clientName()).isEqualTo("TechCorp");
        verify(audit).record(eq(me), eq("MARKETER_TASK_CREATE"), eq("TASK"), any(), eq("900"), any());
        ArgumentCaptor<MktTaskEvent> ev = ArgumentCaptor.forClass(MktTaskEvent.class);
        verify(events).save(ev.capture());
        assertThat(ev.getValue().getKind()).isEqualTo("CREATED");
    }

    @Test
    void createWithoutAConsultantIsAllowedAndAConsultantOutsideMyReachIs404() {
        service.create(me, new CreateRequest("Weekly update", null, "MARKETING", null, null, days(1), null, null, "All Consultants", null));
        verify(repo).save(any(MktTask.class));
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, null, null, null, days(1), 99L, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, null, null, null, days(1), null, 404L, null, null))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void createRefusesBadValuesAndSensitiveText() {
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, "NOPE", null, null, days(1), null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, null, "URGENT", null, days(1), null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("x", null, null, null, "DONE", days(1), null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("   ", null, null, null, null, days(1), null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("<b>x</b>", null, null, null, null, days(1), null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("ssn 123-45-6789", null, null, null, null, days(1), null, null, null, null))).isInstanceOf(SensitiveContentException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void createForAnotherOwnerNeedsThatMarketerToSeeTheConsultant() {
        MarketerAssignment a = new MarketerAssignment();
        a.setConsultantId(11L);
        a.setMarketerMemberId(ME);
        a.setBackupMemberId(TEAMMATE);
        when(assignments.findByOrgIdAndConsultantId(ORG, 11L)).thenReturn(Optional.of(a));
        service.create(me, new CreateRequest("Hand over", null, null, null, null, days(1), 11L, null, null, TEAMMATE));
        ArgumentCaptor<MktTask> saved = ArgumentCaptor.forClass(MktTask.class);
        verify(repo).save(saved.capture());
        assertThat(saved.getValue().getOwnerMemberId()).isEqualTo(TEAMMATE);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("Hand over", null, null, null, null, days(1), 11L, null, null, 99L))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void completeStampsTheTimeAndReopenClearsIt() {
        MktTask open = t(1L, 11L, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(open));
        ActionResult done = service.complete(me, 1L);
        assertThat(open.getStatus()).isEqualTo("COMPLETED");
        assertThat(open.getCompletedAt()).isEqualTo(NOW);
        assertThat(done.emailed()).isFalse();
        verify(audit).record(eq(me), eq("MARKETER_TASK_COMPLETE"), eq("TASK"), any(), eq("1"), any());
        ActionResult again = service.reopen(me, 1L);
        assertThat(open.getStatus()).isEqualTo("PENDING");
        assertThat(open.getCompletedAt()).isNull();
        assertThat(again.event()).isEqualTo("REOPENED");
        verify(audit).record(eq(me), eq("MARKETER_TASK_REOPEN"), eq("TASK"), any(), eq("1"), any());
    }

    @Test
    void completingAnAlreadyCompletedTaskWritesNothingMore() {
        MktTask done = t(1L, 11L, ME, "COMPLETED", days(-1), days(-3), days(-1), "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(done));
        service.complete(me, 1L);
        verify(repo, never()).save(any());
        assertThat(done.getCompletedAt()).isEqualTo(days(-1));
    }

    @Test
    void updateChangesOnlyWhatIsSent() {
        MktTask task = t(1L, 11L, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(task));
        service.update(me, 1L, new UpdateRequest("New title", null, null, "LOW", "IN_PROGRESS", null, null));
        assertThat(task.getTitle()).isEqualTo("New title");
        assertThat(task.getPriority()).isEqualTo("LOW");
        assertThat(task.getStatus()).isEqualTo("IN_PROGRESS");
        assertThat(task.getCategory()).isEqualTo("RESUME");
        assertThat(task.getDetail()).isEqualTo("Detail 1");
        assertThat(task.getDueAt()).isEqualTo(days(1));
        service.update(me, 1L, new UpdateRequest(null, null, null, null, "COMPLETED", null, null));
        assertThat(task.getCompletedAt()).isEqualTo(NOW);
        service.update(me, 1L, new UpdateRequest(null, null, null, null, "PENDING", null, null));
        assertThat(task.getCompletedAt()).isNull();
        assertThatThrownBy(() -> service.update(me, 1L, new UpdateRequest("ssn 123-45-6789", null, null, null, null, null, null))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.update(me, 1L, new UpdateRequest(null, null, "NOPE", null, null, null, null))).isInstanceOf(OrgException.class);
    }

    @Test
    void anotherMarketersTaskAndAnOutOfReachConsultantAreTheGeneric404() {
        MktTask theirs = t(8L, 11L, TEAMMATE, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        MktTask foreign = t(9L, 99L, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 8L)).thenReturn(Optional.of(theirs));
        when(repo.findByOrgIdAndId(ORG, 9L)).thenReturn(Optional.of(foreign));
        for (Long id : List.of(8L, 9L, 404L)) {
            assertThatThrownBy(() -> service.complete(me, id)).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> service.reopen(me, id)).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> service.update(me, id, new UpdateRequest("x", null, null, null, null, null, null))).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> service.reassign(me, id, TEAMMATE)).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> service.delete(me, id)).isInstanceOf(OrgNotFoundException.class);
            assertThatThrownBy(() -> service.assignees(me, id)).isInstanceOf(OrgNotFoundException.class);
        }
        verify(repo, never()).save(any());
        verify(repo, never()).deleteByOrgIdAndId(anyLong(), anyLong());
    }

    @Test
    void reassignGoesOnlyToAMarketerWhoCanSeeTheConsultant() {
        MarketerAssignment a = new MarketerAssignment();
        a.setConsultantId(11L);
        a.setMarketerMemberId(ME);
        a.setBackupMemberId(TEAMMATE);
        when(assignments.findByOrgIdAndConsultantId(ORG, 11L)).thenReturn(Optional.of(a));
        MktTask task = t(1L, 11L, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(task));
        assertThat(service.assignees(me, 1L)).extracting(Option::id).containsExactly(TEAMMATE);
        assertThatThrownBy(() -> service.reassign(me, 1L, 99L)).isInstanceOf(OrgNotFoundException.class);
        assertThat(task.getOwnerMemberId()).isEqualTo(ME);
        ActionResult r = service.reassign(me, 1L, TEAMMATE);
        assertThat(task.getOwnerMemberId()).isEqualTo(TEAMMATE);
        assertThat(r.item().ownerMemberId()).isEqualTo(TEAMMATE);
        verify(audit).record(eq(me), eq("MARKETER_TASK_REASSIGN"), eq("TASK"), any(), eq("1"), any());
    }

    @Test
    void aTaskAboutNoConsultantCanGoToAnyMarketerWithAssignments() {
        MarketerAssignment a = new MarketerAssignment();
        a.setConsultantId(13L);
        a.setMarketerMemberId(TEAMMATE);
        when(assignments.findByOrgId(ORG)).thenReturn(List.of(a));
        MktTask task = t(2L, null, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "MARKETING");
        when(repo.findByOrgIdAndId(ORG, 2L)).thenReturn(Optional.of(task));
        assertThat(service.assignees(me, 2L)).extracting(Option::id).containsExactly(TEAMMATE);
        service.reassign(me, 2L, TEAMMATE);
        assertThat(task.getOwnerMemberId()).isEqualTo(TEAMMATE);
    }

    @Test
    void deleteRemovesOnlyMyOwnOpenTasksEventsFirst() {
        MktTask mine = t(1L, 11L, ME, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(mine));
        ActionResult r = service.delete(me, 1L);
        assertThat(r.item()).isNull();
        assertThat(r.emailed()).isFalse();
        var order = inOrder(events, repo);
        order.verify(events).deleteByOrgIdAndTaskId(ORG, 1L);
        order.verify(repo).deleteByOrgIdAndId(ORG, 1L);
        verify(audit).record(eq(me), eq("MARKETER_TASK_DELETE"), eq("TASK"), any(), eq("1"), any());
    }

    @Test
    void aCompletedTaskCannotBeDeleted() {
        MktTask done = t(1L, 11L, ME, "COMPLETED", days(-1), days(-3), days(-1), "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(done));
        assertThatThrownBy(() -> service.delete(me, 1L)).isInstanceOf(OrgException.class);
        verify(repo, never()).deleteByOrgIdAndId(anyLong(), anyLong());
    }

    @Test
    void aWideCallerSeesTeamTasksButStillDeletesOnlyTheirOwn() {
        when(scope.resolve(me, "followups.manage")).thenReturn(new MktScope.View(ORG, ME, true, Set.of()));
        MktTask theirs = t(8L, 11L, TEAMMATE, "PENDING", days(1), days(-3), null, "MEDIUM", "RESUME");
        when(repo.findByOrgIdAndId(ORG, 8L)).thenReturn(Optional.of(theirs));
        when(repo.findVisibleOpenOrCompletedSince(eq(ORG), eq(true), anyCollection(), eq(ME), any())).thenReturn(board());
        View v = service.view(me, q(Tab.TEAM));
        assertThat(ids(v)).containsExactly(4L);
        assertThat(v.tabs().team()).isEqualTo(1);
        assertThatThrownBy(() -> service.delete(me, 8L)).isInstanceOf(OrgNotFoundException.class);
        service.complete(me, 8L); // a wide caller may complete a teammate's task
        assertThat(theirs.getStatus()).isEqualTo("COMPLETED");
    }
}
