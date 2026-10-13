package com.dossier.api.service.ent.mkt.submissions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.mkt.MktSubmissionEvent;
import com.dossier.api.domain.ent.mkt.MktSubmissionView;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mkt.MktSubmissionEventRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionViewRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto.*;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Plain-Mockito tests of the Submissions service (no database): scope filtering (an unassigned consultant never appears and is a 404), empty states, KPI
 * math from events, every filter, sorting and paging, and the write rules (E1: records only; the transitions, the audit row, the PII scan).
 */
class MktSubmissionsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final Long ORG = 1L;

    /** The real {@code require} (the 404 for an unassigned consultant) with {@code resolve} stubbed per test. */
    private final MktScope scope = mock(MktScope.class, org.mockito.Mockito.CALLS_REAL_METHODS);
    private final AuthorizationService authorization = mock(AuthorizationService.class);
    private final MktSubmissionRepository repo = mock(MktSubmissionRepository.class);
    private final MktSubmissionEventRepository events = mock(MktSubmissionEventRepository.class);
    private final MktSubmissionViewRepository views = mock(MktSubmissionViewRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private MktSubmissionsService service;
    private final OrgMembership me = new OrgMembership(ORG, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private final List<MktSubmissionEvent> saved = new ArrayList<>();

    private static Instant ago(Duration d) {
        return NOW.minus(d);
    }

    private static Duration h(long n) {
        return Duration.ofHours(n);
    }

    private static Duration d(long n) {
        return Duration.ofDays(n);
    }

    @BeforeEach
    void setUp() {
        service = new MktSubmissionsService(scope, authorization, repo, events, views, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        when(repo.save(any(MktSubmission.class))).thenAnswer(i -> {
            MktSubmission s = i.getArgument(0);
            if (s.getId() == null) s.setId(100L);
            return s;
        });
        when(events.save(any(MktSubmissionEvent.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });
        when(views.save(any(MktSubmissionView.class))).thenAnswer(i -> i.getArgument(0));
        when(views.findByOrgIdAndMemberIdOrderByNameAsc(anyLong(), anyLong())).thenReturn(List.of());
    }

    // ---- fixtures ---------------------------------------------------------------------------------------------------------------

    private static ConsultantProfile consultant(long id, String name, String role) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setDisplayName(name);
        c.setJobTitle(role);
        return c;
    }

    private static ClientRequirement job(long id, String title, long clientId) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setTitle(title);
        r.setClientId(clientId);
        return r;
    }

    private static ClientAccount client(long id, String name) {
        ClientAccount a = new ClientAccount();
        a.setId(id);
        a.setName(name);
        return a;
    }

    private static MktSubmission sub(long id, long consultant, long job, long client, String approval, String status, Instant created, Instant submitted) {
        MktSubmission s = new MktSubmission();
        s.setId(id);
        s.setOrgId(ORG);
        s.setCode("SUB-2026-" + String.format("%03d", id));
        s.setConsultantId(consultant);
        s.setRequirementId(job);
        s.setClientId(client);
        s.setResumeVersion(3);
        s.setResumeMinor((int) id);
        s.setApprovalState(approval);
        s.setStatus(status);
        s.setCreatedAt(created);
        s.setSubmittedOn(submitted);
        return s;
    }

    private static MktSubmissionEvent ev(long sub, String kind, String field, String from, String to, Instant at) {
        return MktSubmissionEvent.of(ORG, sub, kind, field, from, to, 7L, null, at);
    }

    private MktSubmission s1, s2, s3, s4, s5, s6;

    /** Six records of three consultants (1 Alex, 2 Priya, 3 Michael), three jobs and three clients. */
    private void world(MktScope.View view) {
        s1 = sub(1, 1, 11, 21, "APPROVED", "SUBMITTED", ago(d(3)), ago(h(2)));
        s2 = sub(2, 2, 12, 22, "AWAITING_APPROVAL", "DRAFT", ago(h(4)), null);
        s3 = sub(3, 3, 13, 23, "APPROVED", "CLIENT_REVIEW", ago(d(10)), ago(h(28)));
        s4 = sub(4, 1, 12, 22, "APPROVED", "REJECTED", ago(d(40)), ago(d(38)));
        s5 = sub(5, 1, 13, 23, "APPROVED", "CLIENT_REVIEW", ago(d(25)), ago(d(24)));
        s6 = sub(6, 2, 11, 21, "AWAITING_APPROVAL", "DRAFT", ago(d(12)), null);
        List<MktSubmission> all = List.of(s1, s2, s3, s4, s5, s6);
        List<MktSubmission> mine = all.stream().filter(s -> view.sees(s.getConsultantId())).toList();
        doReturn(view).when(scope).resolve(me, "submissions.record");
        when(repo.findByOrgIdAndArchivedAtIsNull(ORG)).thenReturn(all);
        when(repo.findByOrgIdAndConsultantIdInAndArchivedAtIsNull(eq(ORG), anyCollection())).thenReturn(mine);
        when(repo.findConsultants(eq(ORG), anyCollection())).thenReturn(List.of(consultant(1, "Alex Morgan", "Java Developer"), consultant(2, "Priya Sharma", "Business Analyst"), consultant(3, "Michael Park", "AWS Engineer")));
        when(repo.findRequirements(eq(ORG), anyCollection())).thenReturn(List.of(job(11, "Senior Java Developer", 21), job(12, "Data Analyst", 22), job(13, "Cloud Engineer", 23)));
        when(repo.findClients(eq(ORG), anyCollection())).thenReturn(List.of(client(21, "TechCorp"), client(22, "Global Bank"), client(23, "CloudScale")));
        List<MktSubmissionEvent> evs = List.of(
            ev(1, "CREATED", null, null, "DRAFT", s1.getCreatedAt()),
            ev(1, "STATUS_RECORDED", "STATUS", "DRAFT", "SUBMITTED", ago(h(2))),
            ev(2, "CREATED", null, null, "DRAFT", ago(h(4))),
            ev(2, "APPROVAL_REQUESTED", "APPROVAL", "DRAFT", "AWAITING_APPROVAL", ago(h(3))),
            ev(3, "CREATED", null, null, "DRAFT", ago(d(10))),
            ev(3, "STATUS_RECORDED", "STATUS", "SUBMITTED", "CLIENT_REVIEW", ago(h(28))),
            ev(4, "CREATED", null, null, "DRAFT", ago(d(40))),
            ev(4, "STATUS_RECORDED", "STATUS", "CLIENT_REVIEW", "REJECTED", ago(d(35))),
            ev(5, "CREATED", null, null, "DRAFT", ago(d(25))),
            ev(5, "STATUS_RECORDED", "STATUS", "SUBMITTED", "CLIENT_REVIEW", ago(d(20))),
            ev(6, "CREATED", null, null, "DRAFT", ago(d(12))),
            ev(6, "APPROVAL_REQUESTED", "APPROVAL", "DRAFT", "AWAITING_APPROVAL", ago(d(9)))
        );
        when(events.findByOrgIdAndSubmissionIdInOrderByOccurredAtAsc(eq(ORG), anyCollection())).thenReturn(evs);
    }

    private static MktScope.View all() {
        return new MktScope.View(ORG, 7L, true, Set.of());
    }

    private static MktScope.View assigned(Long... ids) {
        return new MktScope.View(ORG, 7L, false, Set.of(ids));
    }

    private static Query q() {
        return new Query(null, null, null, null, null, null, null, null, null, 0, 10);
    }

    private Query q(String text, String status, String approval, Long clientId, String jobTitle, String period) {
        return new Query(text, status, approval, clientId, jobTitle, period, null, null, null, 0, 10);
    }

    // ---- gate and scope -----------------------------------------------------------------------------------------------------------

    @Test
    void aCallerOutsideTheGateGetsTheGeneric404AndNothingIsRead() {
        doThrow(new OrgNotFoundException()).when(scope).resolve(me, "submissions.record");
        assertThatThrownBy(() -> service.board(me, q())).isInstanceOf(OrgNotFoundException.class);
        verifyNoInteractions(repo, events, views);
    }

    @Test
    void anAssignedMarketerOnlyReadsTheirConsultantsRows() {
        world(assigned(1L));
        BoardResponse b = service.board(me, new Query(null, null, null, null, null, "all", null, null, null, 0, 10));
        assertThat(b.items()).extracting(r -> r.consultant().id()).containsOnly(1L);
        assertThat(b.total()).isEqualTo(3);
        verify(repo, never()).findByOrgIdAndArchivedAtIsNull(anyLong());
        assertThat(b.filters().clients()).extracting(ClientRef::name).containsExactly("CloudScale", "Global Bank", "TechCorp");
    }

    @Test
    void aMarketerWithNoAssignedConsultantsSeesEmptyStatesNotFakeNumbers() {
        world(assigned());
        BoardResponse b = service.board(me, q());
        assertThat(b.items()).isEmpty();
        assertThat(b.total()).isZero();
        assertThat(b.kpis().pendingApprovals().value()).isZero();
        assertThat(b.kpis().pendingApprovals().deltaPct()).isNull();
        assertThat(b.breakdown().total()).isZero();
        assertThat(b.breakdown().buckets()).hasSize(6).allMatch(x -> x.count() == 0 && x.pct() == 0);
        assertThat(b.activity()).isEmpty();
        verify(repo, never()).findByOrgIdAndConsultantIdInAndArchivedAtIsNull(anyLong(), anyCollection());
    }

    @Test
    void anEmptyOrganizationHasEmptyStates() {
        doReturn(all()).when(scope).resolve(me, "submissions.record");
        when(repo.findByOrgIdAndArchivedAtIsNull(ORG)).thenReturn(List.of());
        BoardResponse b = service.board(me, q());
        assertThat(b.items()).isEmpty();
        assertThat(b.kpis().submittedToday().value()).isZero();
        assertThat(b.kpis().submittedToday().sparkline()).hasSize(8);
        assertThat(b.filters().clients()).isEmpty();
    }

    @Test
    void aSubmissionOfAnUnassignedConsultantIsA404ForReadAndForEveryWrite() {
        world(assigned(1L));
        when(repo.findByOrgIdAndId(ORG, 2L)).thenReturn(Optional.of(s2));
        assertThatThrownBy(() -> service.detail(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.requestApproval(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.withdraw(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.recordStatus(me, 2L, new StatusRequest("SUBMITTED", null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.recordApproval(me, 2L, new ApprovalRequest("APPROVED", null))).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any(MktSubmission.class));
        verify(events, never()).save(any(MktSubmissionEvent.class));
    }

    @Test
    void anUnknownIdOrAnotherTenantsIdIsA404() {
        world(all());
        when(repo.findByOrgIdAndId(ORG, 999L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.detail(me, 999L)).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- KPI math -----------------------------------------------------------------------------------------------------------------

    @Test
    void kpisAreCountedFromRowsAndComparedWithTheStateAWeekAgoFromEvents() {
        world(all());
        Kpis k = service.board(me, q()).kpis();
        assertThat(k.pendingApprovals().value()).as("s2 and s6 await approval").isEqualTo(2);
        assertThat(k.pendingApprovals().deltaPct()).as("a week ago only s6 did").isEqualTo(100.0);
        assertThat(k.pendingApprovals().sparkline()).hasSize(8).endsWith(2L);
        assertThat(k.underClientReview().value()).isEqualTo(2);
        assertThat(k.underClientReview().deltaPct()).as("a week ago only s5 was in review").isEqualTo(100.0);
        assertThat(k.rejected().value()).isEqualTo(1);
        assertThat(k.rejected().deltaPct()).as("s4 was already rejected a week ago").isEqualTo(0.0);
        assertThat(k.submittedToday().value()).as("s1 was recorded two hours ago").isEqualTo(1);
        assertThat(k.submittedToday().deltaPct()).as("s3 was recorded yesterday before this hour").isEqualTo(0.0);
        assertThat(k.submittedToday().sparkline()).hasSize(8).endsWith(1L);
    }

    @Test
    void aDeltaWithNoPreviousValueIsOmitted() {
        assertThat(MktSubmissionsService.pct(5, 0)).isNull();
        assertThat(MktSubmissionsService.pct(12, 10)).isEqualTo(20.0);
        assertThat(MktSubmissionsService.pct(6, 8)).isEqualTo(-25.0);
    }

    @Test
    void stateAtRebuildsAPastStateAndSaysNullBeforeTheRecordExisted() {
        MktSubmission s = sub(9, 1, 11, 21, "APPROVED", "SUBMITTED", ago(d(5)), ago(d(1)));
        List<MktSubmissionEvent> evs = List.of(
            ev(9, "APPROVAL_REQUESTED", "APPROVAL", "DRAFT", "AWAITING_APPROVAL", ago(d(4))),
            ev(9, "APPROVAL_DECIDED", "APPROVAL", "AWAITING_APPROVAL", "APPROVED", ago(d(3))),
            ev(9, "STATUS_RECORDED", "STATUS", "DRAFT", "SUBMITTED", ago(d(1)))
        );
        assertThat(MktSubmissionsService.stateAt(s, evs, ago(d(6)), "APPROVAL")).isNull();
        assertThat(MktSubmissionsService.stateAt(s, evs, ago(d(4).minusHours(1)), "APPROVAL")).isEqualTo("AWAITING_APPROVAL");
        assertThat(MktSubmissionsService.stateAt(s, evs, ago(d(2)), "APPROVAL")).isEqualTo("APPROVED");
        assertThat(MktSubmissionsService.stateAt(s, evs, ago(d(2)), "STATUS")).isEqualTo("DRAFT");
        assertThat(MktSubmissionsService.stateAt(s, evs, NOW, "STATUS")).isEqualTo("SUBMITTED");
        MktSubmission declined = sub(10, 1, 11, 21, "REJECTED", "REJECTED", ago(d(5)), null);
        List<MktSubmissionEvent> declinedEvs = List.of(ev(10, "APPROVAL_DECIDED", "APPROVAL", "AWAITING_APPROVAL", "REJECTED", ago(d(2))));
        assertThat(MktSubmissionsService.stateAt(declined, declinedEvs, NOW, "STATUS")).as("a declined approval ends the record").isEqualTo("REJECTED");
    }

    // ---- list: filters, sort, paging, breakdown, activity -----------------------------------------------------------------------------

    @Test
    void defaultsToTheLast30DaysNewestFirstAndDrawsTheDonutFromTheSameRows() {
        world(all());
        BoardResponse b = service.board(me, q());
        assertThat(b.items()).extracting(Row::id).containsExactly(1L, 2L, 3L, 6L, 5L);
        BoardResponse everything = service.board(me, q(null, null, null, null, null, "all"));
        assertThat(everything.total()).isEqualTo(6);
        Breakdown bd = b.breakdown();
        assertThat(bd.period()).isEqualTo("30d");
        assertThat(bd.total()).isEqualTo(5);
        assertThat(bd.buckets()).extracting(Bucket::key).containsExactly("DRAFT", "AWAITING_APPROVAL", "SUBMITTED", "CLIENT_REVIEW", "INTERVIEW_REQUESTED", "REJECTED");
        assertThat(bd.buckets()).filteredOn(x -> x.key().equals("AWAITING_APPROVAL")).extracting(Bucket::count, Bucket::pct).containsExactly(org.assertj.core.groups.Tuple.tuple(2L, 40));
        assertThat(bd.buckets()).filteredOn(x -> x.key().equals("DRAFT")).extracting(Bucket::count).containsExactly(0L);
    }

    @Test
    void theDonutHasItsOwnPeriod() {
        world(all());
        BoardResponse b = service.board(me, new Query(null, null, null, null, null, null, "all", null, null, 0, 10));
        assertThat(b.breakdown().period()).isEqualTo("all");
        assertThat(b.breakdown().total()).isEqualTo(6);
        assertThat(b.total()).as("the list keeps its own 30 days").isEqualTo(5);
    }

    @Test
    void everyFilterNarrowsTheList() {
        world(all());
        assertThat(service.board(me, q("priya", null, null, null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(2L, 6L);
        assertThat(service.board(me, q("JOB-1011", null, null, null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(1L, 6L);
        assertThat(service.board(me, q("techcorp", null, null, null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(1L, 6L);
        assertThat(service.board(me, q(null, "AWAITING_APPROVAL", null, null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(2L, 6L);
        assertThat(service.board(me, q(null, "CLIENT_REVIEW", null, null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(3L, 5L);
        assertThat(service.board(me, q(null, null, "APPROVED", null, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(1L, 3L, 4L, 5L);
        assertThat(service.board(me, q(null, null, null, 22L, null, "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(2L, 4L);
        assertThat(service.board(me, q(null, null, null, null, "cloud engineer", "all")).items()).extracting(Row::id).containsExactlyInAnyOrder(3L, 5L);
        assertThat(service.board(me, q(null, null, null, null, null, "7d")).items()).extracting(Row::id).containsExactlyInAnyOrder(1L, 2L, 3L);
        assertThat(service.board(me, q("nobody", null, null, null, null, "all")).items()).isEmpty();
        assertThatThrownBy(() -> service.board(me, q(null, "BOGUS", null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.board(me, q(null, null, null, null, null, "1y"))).isInstanceOf(OrgException.class);
    }

    @Test
    void sortsAndPages() {
        world(all());
        Query byConsultant = new Query(null, null, null, null, null, "all", null, "consultant", "asc", 0, 4);
        BoardResponse first = service.board(me, byConsultant);
        assertThat(first.items()).extracting(r -> r.consultant().name()).containsExactly("Alex Morgan", "Alex Morgan", "Alex Morgan", "Michael Park");
        assertThat(first.total()).isEqualTo(6);
        BoardResponse second = service.board(me, new Query(null, null, null, null, null, "all", null, "consultant", "asc", 1, 4));
        assertThat(second.items()).extracting(r -> r.consultant().name()).containsExactly("Priya Sharma", "Priya Sharma");
        assertThat(second.page()).isEqualTo(1);
        BoardResponse desc = service.board(me, new Query(null, null, null, null, null, "all", null, "client", "desc", 0, 2));
        assertThat(desc.items().get(0).client().name()).isEqualTo("TechCorp");
        BoardResponse capped = service.board(me, new Query(null, null, null, null, null, "all", null, null, null, 0, 5000));
        assertThat(capped.size()).isEqualTo(100);
        BoardResponse pastEnd = service.board(me, new Query(null, null, null, null, null, "all", null, null, null, 50, 10));
        assertThat(pastEnd.items()).isEmpty();
        assertThat(pastEnd.total()).isEqualTo(6);
    }

    @Test
    void rowsCarryTheBoardsColumns() {
        world(all());
        Row r = service.board(me, q()).items().stream().filter(x -> x.id() == 1L).findFirst().orElseThrow();
        assertThat(r.consultant().name()).isEqualTo("Alex Morgan");
        assertThat(r.consultant().role()).isEqualTo("Java Developer");
        assertThat(r.job().title()).isEqualTo("Senior Java Developer");
        assertThat(r.job().code()).isEqualTo("JOB-1011");
        assertThat(r.client().name()).isEqualTo("TechCorp");
        assertThat(r.submissionDate()).isEqualTo(ago(h(2)));
        assertThat(r.approvalState()).isEqualTo("APPROVED");
        assertThat(r.resume().version()).isEqualTo("v3.1");
        assertThat(r.status()).isEqualTo("SUBMITTED");
        assertThat(r.actions()).containsExactly("RECORD_STATUS");
        Row draft = service.board(me, q()).items().stream().filter(x -> x.id() == 2L).findFirst().orElseThrow();
        assertThat(draft.submissionDate()).as("a draft shows when it was prepared").isEqualTo(ago(h(4)));
        assertThat(draft.bucket()).isEqualTo("AWAITING_APPROVAL");
        assertThat(draft.actions()).containsExactly("RECORD_APPROVAL", "WITHDRAW");
    }

    @Test
    void recentActivityIsTheNewestFiveEventsInPlainWords() {
        world(all());
        List<Activity> a = service.board(me, q()).activity();
        assertThat(a).hasSize(5);
        assertThat(a.get(0).text()).isEqualTo("Alex Morgan submitted to TechCorp");
        assertThat(a.get(0).detail()).isEqualTo("Senior Java Developer");
        assertThat(a.get(1).text()).isEqualTo("Priya Sharma's package was sent for approval");
        assertThat(a).extracting(Activity::at).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(a.stream().map(Activity::text)).anyMatch(t -> t.equals("Michael Park moved to Client Review"));
    }

    @Test
    void filterOptionsListOnlyWhatTheCallerMaySee() {
        world(assigned(2L));
        FilterOptions f = service.board(me, q()).filters();
        assertThat(f.clients()).extracting(ClientRef::name).containsExactly("Global Bank", "TechCorp");
        assertThat(f.jobTitles()).containsExactly("Data Analyst", "Senior Java Developer");
    }

    // ---- writes -------------------------------------------------------------------------------------------------------------------

    private void writable(MktScope.View view) {
        doReturn(view).when(scope).resolve(me, "submissions.record");
        when(repo.findConsultants(eq(ORG), anyCollection())).thenReturn(List.of(consultant(1, "Alex Morgan", "Java Developer")));
        when(repo.findRequirements(eq(ORG), anyCollection())).thenReturn(List.of(job(11, "Senior Java Developer", 21)));
        when(repo.findClients(eq(ORG), anyCollection())).thenReturn(List.of(client(21, "TechCorp")));
    }

    @Test
    void createMakesADraftRecordForAnAssignedConsultantAndSendsNothing() {
        writable(assigned(1L));
        when(repo.findConsultant(ORG, 1L)).thenReturn(Optional.of(consultant(1, "Alex Morgan", "Java Developer")));
        when(repo.findRequirement(ORG, 11L)).thenReturn(Optional.of(job(11, "Senior Java Developer", 21)));
        OrgResume primary = new OrgResume();
        primary.setId(5L);
        primary.setConsultantId(1L);
        primary.setVersionNo(3);
        primary.setUpdatedAt(ago(d(2)));
        when(repo.findPrimaryResume(ORG, 1L)).thenReturn(Optional.of(primary));
        when(repo.countByOrgId(ORG)).thenReturn(85L);

        Row row = service.create(me, new CreateRequest(1L, 11L, null, "Strong Java fit"));

        assertThat(row.status()).isEqualTo("DRAFT");
        assertThat(row.approvalState()).isEqualTo("DRAFT");
        assertThat(row.code()).isEqualTo("SUB-2026-086");
        assertThat(row.client().name()).as("the client comes from the job").isEqualTo("TechCorp");
        assertThat(row.resume().version()).isEqualTo("v3.0");
        assertThat(row.actions()).containsExactly("REQUEST_APPROVAL", "WITHDRAW");
        ArgumentCaptor<MktSubmission> cap = ArgumentCaptor.forClass(MktSubmission.class);
        verify(repo).save(cap.capture());
        assertThat(cap.getValue().getSubmittedOn()).as("nothing was submitted").isNull();
        assertThat(cap.getValue().getPreparedByMemberId()).isEqualTo(7L);
        assertThat(saved).extracting(MktSubmissionEvent::getKind).containsExactly("CREATED");
        verify(authorization).require(any(AuthzRequest.class));
        verify(audit).record(eq(ORG), eq("marketer"), any(), eq("MARKETER_SUBMISSION_CREATE"), eq("SUBMISSION"), any(), eq("100"), anyString(), any(), any(), any(), eq("LOW"));
    }

    @Test
    void createRefusesAConsultantTheCallerIsNotAssignedToAndAJobOrResumeFromElsewhere() {
        writable(assigned(1L));
        when(repo.findConsultant(ORG, 2L)).thenReturn(Optional.of(consultant(2, "Priya Sharma", "Business Analyst")));
        assertThatThrownBy(() -> service.create(me, new CreateRequest(2L, 11L, null, null))).isInstanceOf(OrgNotFoundException.class);
        when(repo.findConsultant(ORG, 1L)).thenReturn(Optional.of(consultant(1, "Alex Morgan", "Java Developer")));
        when(repo.findRequirement(ORG, 99L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(me, new CreateRequest(1L, 99L, null, null))).isInstanceOf(OrgNotFoundException.class);
        when(repo.findRequirement(ORG, 11L)).thenReturn(Optional.of(job(11, "Senior Java Developer", 21)));
        OrgResume theirs = new OrgResume();
        theirs.setId(8L);
        theirs.setConsultantId(2L);
        when(repo.findResume(ORG, 8L)).thenReturn(Optional.of(theirs));
        assertThatThrownBy(() -> service.create(me, new CreateRequest(1L, 11L, 8L, null))).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any(MktSubmission.class));
    }

    @Test
    void createRefusesADuplicateAndAPersonalNumberInTheNote() {
        writable(assigned(1L));
        when(repo.findConsultant(ORG, 1L)).thenReturn(Optional.of(consultant(1, "Alex Morgan", "Java Developer")));
        when(repo.findRequirement(ORG, 11L)).thenReturn(Optional.of(job(11, "Senior Java Developer", 21)));
        when(repo.existsByOrgIdAndConsultantIdAndRequirementIdAndArchivedAtIsNull(ORG, 1L, 11L)).thenReturn(true);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(1L, 11L, null, null)))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("SUBMISSION_EXISTS"));
        assertThatThrownBy(() -> service.create(me, new CreateRequest(1L, 11L, null, "SSN 123-45-6789"))).isInstanceOf(SensitiveContentException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(null, 11L, null, null))).isInstanceOf(OrgException.class);
        verify(repo, never()).save(any(MktSubmission.class));
    }

    @Test
    void anOrganizationThatRefusesWritesStopsBeforeAnythingChanges() {
        world(all());
        doThrow(new OrgNotFoundException()).when(authorization).require(any(AuthzRequest.class));
        when(repo.findByOrgIdAndId(ORG, 2L)).thenReturn(Optional.of(s2));
        assertThatThrownBy(() -> service.requestApproval(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any(MktSubmission.class));
        verify(events, never()).save(any(MktSubmissionEvent.class));
    }

    @Test
    void theApprovalFlowAndTheStatusFactsFollowTheRules() {
        world(all());
        MktSubmission draft = sub(20, 1, 11, 21, "DRAFT", "DRAFT", ago(h(1)), null);
        when(repo.findByOrgIdAndId(ORG, 20L)).thenReturn(Optional.of(draft));
        // cannot be recorded as submitted before it is approved
        assertThatThrownBy(() -> service.recordStatus(me, 20L, new StatusRequest("SUBMITTED", null)))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("SUBMISSION_NOT_APPROVED"));
        // request approval
        Row r = service.requestApproval(me, 20L);
        assertThat(r.approvalState()).isEqualTo("AWAITING_APPROVAL");
        assertThatThrownBy(() -> service.requestApproval(me, 20L)).isInstanceOf(OrgException.class);
        // record the decision
        r = service.recordApproval(me, 20L, new ApprovalRequest("approved", "Alex agreed"));
        assertThat(r.approvalState()).isEqualTo("APPROVED");
        assertThatThrownBy(() -> service.recordApproval(me, 20L, new ApprovalRequest("APPROVED", null))).isInstanceOf(OrgException.class);
        // the consultant submitted: record it
        r = service.recordStatus(me, 20L, new StatusRequest("SUBMITTED", null));
        assertThat(r.status()).isEqualTo("SUBMITTED");
        assertThat(draft.getSubmittedOn()).isEqualTo(NOW);
        // no skipping back, no jumping to a non-fact
        assertThatThrownBy(() -> service.recordStatus(me, 20L, new StatusRequest("DRAFT", null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.recordStatus(me, 20L, new StatusRequest("AWAITING_APPROVAL", null))).isInstanceOf(OrgException.class);
        r = service.recordStatus(me, 20L, new StatusRequest("CLIENT_REVIEW", null));
        r = service.recordStatus(me, 20L, new StatusRequest("INTERVIEW_REQUESTED", null));
        assertThat(r.status()).isEqualTo("INTERVIEW_REQUESTED");
        assertThatThrownBy(() -> service.recordStatus(me, 20L, new StatusRequest("SUBMITTED", null))).isInstanceOf(OrgException.class);
        r = service.recordStatus(me, 20L, new StatusRequest("REJECTED", null));
        assertThat(r.actions()).as("a rejected record is final").isEmpty();
        assertThat(saved).extracting(MktSubmissionEvent::getKind)
            .containsExactly("APPROVAL_REQUESTED", "APPROVAL_DECIDED", "STATUS_RECORDED", "STATUS_RECORDED", "STATUS_RECORDED", "STATUS_RECORDED");
    }

    @Test
    void aRejectedApprovalEndsTheRecordAsRejected() {
        world(all());
        when(repo.findByOrgIdAndId(ORG, 2L)).thenReturn(Optional.of(s2));
        Row r = service.recordApproval(me, 2L, new ApprovalRequest("REJECTED", null));
        assertThat(r.approvalState()).isEqualTo("REJECTED");
        assertThat(r.status()).isEqualTo("REJECTED");
        assertThat(r.submissionDate()).isEqualTo(s2.getCreatedAt());
        assertThatThrownBy(() -> service.recordApproval(me, 2L, new ApprovalRequest("MAYBE", null))).isInstanceOf(OrgException.class);
    }

    @Test
    void withdrawOnlyTakesADraftOffTheBoardAndKeepsItsHistory() {
        world(all());
        when(repo.findByOrgIdAndId(ORG, 2L)).thenReturn(Optional.of(s2));
        service.withdraw(me, 2L);
        assertThat(s2.getArchivedAt()).isEqualTo(NOW);
        assertThat(saved).extracting(MktSubmissionEvent::getKind).containsExactly("WITHDRAWN");
        when(repo.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(s1));
        assertThatThrownBy(() -> service.withdraw(me, 1L)).isInstanceOf(OrgException.class);
        assertThat(s1.getArchivedAt()).isNull();
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(withArchived(s5)));
        assertThatThrownBy(() -> service.detail(me, 5L)).as("a withdrawn record is gone").isInstanceOf(OrgNotFoundException.class);
    }

    private static MktSubmission withArchived(MktSubmission s) {
        s.setArchivedAt(NOW);
        return s;
    }

    // ---- saved views --------------------------------------------------------------------------------------------------------------

    @Test
    void saveViewKeepsTheFiltersPerMarketerAndReplacesTheSameName() {
        doReturn(all()).when(scope).resolve(me, "submissions.record");
        when(repo.findClients(eq(ORG), anyCollection())).thenReturn(List.of(client(21, "TechCorp")));
        when(views.findByOrgIdAndMemberIdAndName(ORG, 7L, "My Java")).thenReturn(Optional.empty());
        SavedView v = service.saveView(me, new ViewRequest(" My Java ", "java", "CLIENT_REVIEW", "APPROVED", 21L, "Cloud Engineer", "7d"));
        ArgumentCaptor<MktSubmissionView> cap = ArgumentCaptor.forClass(MktSubmissionView.class);
        verify(views).save(cap.capture());
        assertThat(cap.getValue().getMemberId()).isEqualTo(7L);
        assertThat(cap.getValue().getOrgId()).isEqualTo(ORG);
        assertThat(v.name()).isEqualTo("My Java");
        assertThat(v.status()).isEqualTo("CLIENT_REVIEW");
        assertThat(v.clientId()).isEqualTo(21L);
        assertThatThrownBy(() -> service.saveView(me, new ViewRequest("  ", null, null, null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.saveView(me, new ViewRequest("x", null, "NOPE", null, null, null, null))).isInstanceOf(OrgException.class);
        when(views.countByOrgIdAndMemberId(ORG, 7L)).thenReturn(20L);
        assertThatThrownBy(() -> service.saveView(me, new ViewRequest("one more", null, null, null, null, null, null))).isInstanceOf(OrgException.class);
    }

    @Test
    void aViewThatIsNotYoursIsA404() {
        doReturn(all()).when(scope).resolve(me, "submissions.record");
        when(views.findByOrgIdAndMemberIdAndId(ORG, 7L, 5L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.deleteView(me, 5L)).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void thePageNeverAddsAnythingThatSubmitsForAConsultant() {
        // E1 guard: the action vocabulary is records and requests only.
        MktSubmission any = sub(30, 1, 11, 21, "APPROVED", "DRAFT", ago(h(1)), null);
        assertThat(MktSubmissionsService.actionsOf(any)).containsOnly("RECORD_STATUS");
        assertThat(MktSubmissionsService.actionsOf(sub(31, 1, 11, 21, "DRAFT", "DRAFT", ago(h(1)), null))).containsExactly("REQUEST_APPROVAL", "WITHDRAW");
    }
}
