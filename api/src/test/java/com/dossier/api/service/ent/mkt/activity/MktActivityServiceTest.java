package com.dossier.api.service.ent.mkt.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktActivityApplicationFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityAssignmentRepository;
import com.dossier.api.repository.ent.mkt.MktActivityClientRepository;
import com.dossier.api.repository.ent.mkt.MktActivityConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktActivityFollowupFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityInterviewFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityOpportunityFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityPlacementFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityRepository;
import com.dossier.api.repository.ent.mkt.MktActivityResumeFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivitySubmissionFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityUpcomingInterviewRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.CreateRequest;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Query;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Row;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.View;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
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
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/**
 * Scope filtering, normalisation of every source, filters, KPI / summary math, consent, the upcoming card and the record-only writes of
 * {@link MktActivityService}, with mocked repositories (no Docker).
 */
class MktActivityServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final Long ORG = 1L;
    private static final Long ME = 7L;

    private final MktScope scope = mock(MktScope.class);
    private final MktActivityRepository manual = mock(MktActivityRepository.class);
    private final MktActivityResumeFeedRepository resumeFeed = mock(MktActivityResumeFeedRepository.class);
    private final MktActivityOpportunityFeedRepository opportunityFeed = mock(MktActivityOpportunityFeedRepository.class);
    private final MktActivitySubmissionFeedRepository submissionFeed = mock(MktActivitySubmissionFeedRepository.class);
    private final MktActivityFollowupFeedRepository followupFeed = mock(MktActivityFollowupFeedRepository.class);
    private final MktActivityInterviewFeedRepository interviewFeed = mock(MktActivityInterviewFeedRepository.class);
    private final MktActivityApplicationFeedRepository applicationFeed = mock(MktActivityApplicationFeedRepository.class);
    private final MktActivityPlacementFeedRepository placementFeed = mock(MktActivityPlacementFeedRepository.class);
    private final MktActivityUpcomingInterviewRepository upcomingInterviews = mock(MktActivityUpcomingInterviewRepository.class);
    private final MktActivityConsultantRepository consultants = mock(MktActivityConsultantRepository.class);
    private final MktActivityClientRepository clients = mock(MktActivityClientRepository.class);
    private final MktActivityAssignmentRepository assignments = mock(MktActivityAssignmentRepository.class);
    private final OrgMemberRepository members = mock(OrgMemberRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final DataShareService shares = mock(DataShareService.class);
    private final MktFollowupService followups = mock(MktFollowupService.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgMembership me = new OrgMembership(ORG, ME, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktActivityService service;
    private MktScope.View assigned;

    @BeforeEach
    void setUp() {
        service = new MktActivityService(
            scope, manual, resumeFeed, opportunityFeed, submissionFeed, followupFeed, interviewFeed, applicationFeed, placementFeed, upcomingInterviews, consultants, clients,
            assignments, members, users, shares, followups, audit, Clock.fixed(NOW, ZoneOffset.UTC)
        );
        assigned = new MktScope.View(ORG, ME, false, Set.of(11L, 12L));
        when(scope.resolve(me, "pipeline.view")).thenReturn(assigned);
        when(scope.resolve(me, "followups.manage")).thenReturn(assigned);
        doAnswer(inv -> {
            MktScope.View v = inv.getArgument(0);
            if (!v.sees(inv.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), anyLong());
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<ConsultantProfile> out = new ArrayList<>();
            for (Long id : ids) out.add(consultant(id));
            return out;
        });
        when(clients.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<ClientAccount> out = new ArrayList<>();
            for (Long id : ids) out.add(client(id));
            return out;
        });
        when(clients.findByOrgIdAndId(eq(ORG), anyLong())).thenAnswer(inv -> Optional.of(client(inv.getArgument(1))));
        when(members.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<OrgMember> out = new ArrayList<>();
            for (Long id : ids) out.add(seat(id));
            return out;
        });
        when(users.findAllById(any())).thenReturn(List.of());
        when(shares.scopeOf(anyLong(), anyLong())).thenReturn(ShareScope.FULL);
        when(consultants.findVisible(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(List.of(consultant(11L), consultant(12L)));
        when(clients.findAllByName(eq(ORG), any())).thenReturn(List.of(client(100L), client(101L)));
        when(manual.save(any(MktActivity.class))).thenAnswer(inv -> {
            MktActivity a = inv.getArgument(0);
            if (a.getId() == null) set(a, "id", 900L);
            return a;
        });
        // every feed empty unless a test fills it
        stub(List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        when(manual.findBetween(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(List.of());
        when(manual.findPlanned(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(List.of());
        when(upcomingInterviews.upcoming(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(List.of());
        when(followups.today(any())).thenReturn(List.of());
        when(followups.upcoming(any())).thenReturn(List.of());
        when(assignments.findByOrgIdAndConsultantIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
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

    private static ConsultantProfile consultant(Long id) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(id == 11L ? "Alex Morgan" : id == 12L ? "Priya Sharma" : "Other " + id);
        return c;
    }

    private static ClientAccount client(Long id) {
        ClientAccount c = new ClientAccount();
        set(c, "id", id);
        c.setName(id == 100L ? "TechCorp" : "Global Bank");
        return c;
    }

    private static OrgMember seat(Long id) {
        OrgMember m = new OrgMember();
        set(m, "id", id);
        m.setDisplayLabel(id == 7L ? "Sarah Chen" : "Member " + id);
        return m;
    }

    private static Object[] r(Object... v) {
        return v;
    }

    private static List<Object[]> rows(Object[]... r) {
        return new ArrayList<>(Arrays.asList(r));
    }

    private static Instant ago(long hours) {
        return NOW.minus(hours, ChronoUnit.HOURS);
    }

    private void stub(List<Object[]> resume, List<Object[]> opportunity, List<Object[]> submission, List<Object[]> followup, List<Object[]> interview, List<Object[]> application, List<Object[]> placement) {
        when(resumeFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(resume);
        when(opportunityFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(opportunity);
        when(submissionFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(submission);
        when(followupFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(followup);
        when(interviewFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(interview);
        when(applicationFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(application);
        when(placementFeed.feed(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(placement);
    }

    private static Query q() {
        return new Query(null, null, null, null, null, null, null, null, null, null, 0, 50);
    }

    private static Query with(java.util.function.UnaryOperator<Builder> f) {
        return f.apply(new Builder()).build();
    }

    /** Tiny builder so a test names only the filter it exercises. */
    private static final class Builder {
        String from, to, type, status, q, sort, summary;
        Long consultant, client, owner;
        int page = 0, size = 50;

        Query build() {
            return new Query(from, to, consultant, type, status, client, owner, q, sort, summary, page, size);
        }
    }

    private MktActivity manualRow(long id, long consultant, String type, String status, Instant at) {
        MktActivity a = new MktActivity();
        set(a, "id", id);
        a.setOrgId(ORG);
        a.setConsultantId(consultant);
        a.setClientAccountId(100L);
        a.setActivityType(type);
        a.setTitle("Manual " + id);
        a.setStatus(status);
        a.setOccurredAt(at);
        a.setActorMemberId(ME);
        return a;
    }

    /** One line in every source, all in the default window (Oct 2026), for consultant 11. */
    private void oneOfEach() {
        stub(
            rows(r(1L, "UPDATED", 3, "Updated work experience and skills", 11L, 7L, ago(30))),
            rows(r(2L, "ASSIGNED", "was assigned to this opportunity", 11L, 100L, "Java Developer", 7L, ago(40))),
            rows(r(3L, "APPROVAL_DECIDED", "APPROVAL", "APPROVED", null, 11L, 100L, "Java Developer", 7L, ago(50))),
            rows(r(4L, "CALL_LOGGED", "Spoke with hiring manager", 11L, 100L, "Interview feedback call", "TechCorp", "IN_PROGRESS", 7L, ago(60))),
            rows(r(5L, "FEEDBACK_RECORDED", "Positive feedback", 11L, 101L, "Technical", 7L, ago(70))),
            rows(r(6L, "STAGE_CHANGE", "OFFER", null, 11L, 100L, "Java Developer", 7L, ago(80))),
            rows(r(7L, "Java Developer", "ACTIVE", 11L, 100L, LocalDate.parse("2026-10-05")))
        );
    }

    // ---- scope ------------------------------------------------------------------------------------------------------------------

    @Test
    void everySourceIsReadWithTheCallersConsultantSetOnly() {
        service.view(me, q());
        @SuppressWarnings({ "unchecked", "rawtypes" })
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.forClass((Class) Collection.class);
        verify(resumeFeed).feed(eq(ORG), eq(false), ids.capture(), any(), any(), any());
        assertThat(ids.getValue()).containsExactlyInAnyOrder(11L, 12L);
        verify(submissionFeed).feed(eq(ORG), eq(false), anyCollection(), any(), any(), any());
        verify(followupFeed).feed(eq(ORG), eq(false), anyCollection(), any(), any(), any());
        verify(applicationFeed).feed(eq(ORG), eq(false), anyCollection(), any(), any(), any());
        verify(placementFeed).feed(eq(ORG), eq(false), anyCollection(), any(), any(), any());
        verify(manual).findBetween(eq(ORG), eq(false), anyCollection(), any(), any(), any());
        verify(consultants).findVisible(eq(ORG), eq(false), anyCollection(), any());
    }

    @Test
    void anOrgScopeCallerReadsEverything() {
        when(scope.resolve(me, "pipeline.view")).thenReturn(new MktScope.View(ORG, ME, true, Set.of()));
        service.view(me, q());
        verify(resumeFeed).feed(eq(ORG), eq(true), anyCollection(), any(), any(), any());
    }

    @Test
    void aCallerWithoutTheKeyOrOutsideTheRolesGetsTheGeneric404() {
        when(scope.resolve(me, "pipeline.view")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.view(me, q())).isInstanceOf(OrgNotFoundException.class);
        verify(resumeFeed, never()).feed(any(), anyBoolean(), any(), any(), any(), any());
    }

    @Test
    void canLogFollowsTheWriteKeyAndNeverBlocksReading() {
        assertThat(service.view(me, q()).canLog()).isTrue();
        when(scope.resolve(me, "followups.manage")).thenThrow(new OrgNotFoundException());
        View v = service.view(me, q());
        assertThat(v.canLog()).isFalse();
        assertThat(v.activities()).isNotNull();
    }

    // ---- empty org and defaults ----------------------------------------------------------------------------------------------------

    @Test
    void anEmptyOrgDrawsEmptyStatesAndNoDeltas() {
        View v = service.view(me, q());
        assertThat(v.from()).isEqualTo("2026-10-01");
        assertThat(v.to()).isEqualTo("2026-10-31");
        assertThat(v.activities().items()).isEmpty();
        assertThat(v.activities().total()).isZero();
        assertThat(v.kpis()).extracting(MktActivityDto.Kpi::key).containsExactly("total", "resume", "submission", "followup", "interview");
        assertThat(v.kpis()).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
            assertThat(k.sparkline()).hasSize(8);
        });
        assertThat(v.summary().total()).isZero();
        assertThat(v.summary().rows()).extracting(MktActivityDto.SummaryRow::key).containsExactly("RESUME", "SUBMISSION", "FOLLOWUP", "INTERVIEW", "APPLICATION", "OFFER", "PLACEMENT");
        assertThat(v.summary().rows()).allSatisfy(s -> assertThat(s.pct()).isZero());
        assertThat(v.upcoming()).isEmpty();
        assertThat(v.upcomingTotal()).isZero();
    }

    @Test
    void anInvalidRangeIsRejected() {
        assertThatThrownBy(() -> service.view(me, with(b -> { b.from = "nonsense"; return b; }))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.view(me, with(b -> { b.from = "2026-10-20"; b.to = "2026-10-01"; return b; }))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.view(me, with(b -> { b.from = "2024-01-01"; b.to = "2026-10-01"; return b; }))).isInstanceOf(OrgException.class);
    }

    // ---- normalisation ----------------------------------------------------------------------------------------------------------------

    @Test
    void everySourceBecomesOneNormalisedRowWithGroupClientAndActor() {
        oneOfEach();
        View v = service.view(me, q());
        assertThat(v.activities().total()).isEqualTo(7);
        assertThat(v.activities().items()).extracting(Row::type).containsExactly(
            "RESUME_UPDATED", "OPPORTUNITY_ASSIGNED", "SUBMISSION_APPROVED", "FOLLOWUP_LOGGED", "FEEDBACK_RECEIVED", "OFFER_RECEIVED", "PLACEMENT_CONFIRMED"
        );
        Row resume = v.activities().items().get(0);
        assertThat(resume.title()).isEqualTo("Resume Updated");
        assertThat(resume.subtitle()).isEqualTo("Updated work experience and skills");
        assertThat(resume.groupLabel()).isEqualTo("Resume");
        assertThat(resume.tag()).isEqualTo("Profile");
        assertThat(resume.status()).isEqualTo("COMPLETED");
        assertThat(resume.manual()).isFalse();
        assertThat(resume.actor().name()).isEqualTo("Sarah Chen");
        assertThat(resume.consultant().name()).isEqualTo("Alex Morgan");
        assertThat(resume.client()).isNull();
        Row approved = v.activities().items().get(2);
        assertThat(approved.title()).isEqualTo("Consultant Approved Submission");
        assertThat(approved.client().name()).isEqualTo("TechCorp");
        Row followup = v.activities().items().get(3);
        assertThat(followup.subtitle()).isEqualTo("Spoke with hiring manager");
        assertThat(followup.tag()).isEqualTo("Client Call");
        Row feedback = v.activities().items().get(4);
        assertThat(feedback.group()).isEqualTo("FEEDBACK");
        assertThat(feedback.tag()).isEqualTo("Technical"); // the interview round
        assertThat(v.activities().items().get(6).tag()).isEqualTo("Active");
    }

    @Test
    void unknownSourceKindsAreSkippedNotGuessed() {
        stub(rows(r(1L, "SOMETHING_NEW", 1, null, 11L, 7L, ago(5))), List.of(), rows(r(2L, "APPROVAL_DECIDED", "APPROVAL", "PENDING", null, 11L, 100L, null, 7L, ago(6))), List.of(), List.of(), List.of(), List.of());
        assertThat(service.view(me, q()).activities().total()).isZero();
    }

    @Test
    void streamEventsAreNotFeedLines() {
        // the service has no stream source at all: system job alerts are not something a marketer did
        assertThat(Arrays.stream(MktActivityService.class.getDeclaredFields()).map(Field::getName)).noneMatch(n -> n.toLowerCase().contains("stream"));
    }

    @Test
    void linesOutsideTheChosenRangeAreNotCounted() {
        stub(rows(r(1L, "UPDATED", 1, null, 11L, 7L, Instant.parse("2026-09-20T10:00:00Z"))), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        View v = service.view(me, q());
        assertThat(v.activities().total()).isZero();
        View wide = service.view(me, with(b -> { b.from = "2026-09-01"; b.to = "2026-10-31"; return b; }));
        assertThat(wide.activities().total()).isEqualTo(1);
    }

    // ---- consent ---------------------------------------------------------------------------------------------------------------------

    @Test
    void applicationLinesFollowTheConsultantsConsent() {
        ConsultantProfile seatSummary = consultant(11L);
        seatSummary.setMemberId(500L);
        ConsultantProfile seatNone = consultant(12L);
        seatNone.setMemberId(501L);
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Collection<Long> ids = inv.getArgument(1);
            List<ConsultantProfile> out = new ArrayList<>();
            for (Long id : ids) out.add(id == 11L ? seatSummary : id == 12L ? seatNone : consultant(id));
            return out;
        });
        when(shares.scopeOf(ORG, 500L)).thenReturn(ShareScope.SUMMARY);
        when(shares.scopeOf(ORG, 501L)).thenReturn(ShareScope.NONE);
        stub(
            List.of(), List.of(), List.of(), List.of(), List.of(),
            rows(r(1L, "STAGE_CHANGE", "INTERVIEWING", null, 11L, 100L, "Java Developer", 7L, ago(5)), r(2L, "NOTE", null, "x", 11L, 100L, "Java Developer", 7L, ago(6)), r(3L, "STAGE_CHANGE", "OFFER", null, 12L, 100L, "Java Developer", 7L, ago(7))),
            rows(r(8L, "Java Developer", "ACTIVE", 11L, 100L, LocalDate.parse("2026-10-05")))
        );
        List<Row> out = service.view(me, q()).activities().items();
        assertThat(out).as("summary shows the stage move only; none shows nothing; placements need FULL").hasSize(1);
        assertThat(out.get(0).title()).isEqualTo("Application Moved to Interview");
        assertThat(out.get(0).client()).as("no job or client below FULL").isNull();
        assertThat(out.get(0).subtitle()).doesNotContain("Java Developer");
    }

    // ---- filters, order, paging ---------------------------------------------------------------------------------------------------

    @Test
    void everyFilterNarrowsTheTableAndTheTilesButTypeOnlyTheTable() {
        oneOfEach();
        when(manual.findBetween(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(List.of(manualRow(30, 12, "RESUME_UPDATED", "COMPLETED", ago(10)), manualRow(31, 12, "FOLLOWUP_LOGGED", "CANCELLED", ago(20))));
        assertThat(service.view(me, q()).activities().total()).isEqualTo(9);

        assertThat(service.view(me, with(b -> { b.consultant = 12L; return b; })).activities().total()).isEqualTo(2);
        assertThat(service.view(me, with(b -> { b.type = "FEEDBACK"; return b; })).activities().items()).extracting(Row::type).containsExactly("FEEDBACK_RECEIVED");
        assertThat(service.view(me, with(b -> { b.type = "resume"; return b; })).activities().total()).isEqualTo(2);
        assertThat(service.view(me, with(b -> { b.status = "cancelled"; return b; })).activities().items()).extracting(Row::id).containsExactly("MANUAL:31");
        assertThat(service.view(me, with(b -> { b.client = 101L; return b; })).activities().items()).extracting(Row::type).containsExactly("FEEDBACK_RECEIVED");
        assertThat(service.view(me, with(b -> { b.owner = 99L; return b; })).activities().total()).isZero();
        assertThat(service.view(me, with(b -> { b.owner = ME; return b; })).activities().total()).as("every line but the placement (no assignment row, so no owner)").isEqualTo(8);
        assertThat(service.view(me, with(b -> { b.q = "priya"; return b; })).activities().total()).isEqualTo(2);
        assertThat(service.view(me, with(b -> { b.q = "techcorp"; return b; })).activities().total()).isGreaterThanOrEqualTo(5);

        View typed = service.view(me, with(b -> { b.type = "OFFER"; return b; }));
        assertThat(typed.activities().total()).isEqualTo(1);
        assertThat(typed.kpis().get(0).value()).as("Total tile ignores the Type filter").isEqualTo(9);
        View byConsultant = service.view(me, with(b -> { b.consultant = 12L; return b; }));
        assertThat(byConsultant.kpis().get(0).value()).isEqualTo(2);
        assertThat(byConsultant.kpis().get(1).value()).as("Resume tile").isEqualTo(1);
    }

    @Test
    void newestFirstByDefaultOldestOnRequestAndPagingKeepsTheTotal() {
        oneOfEach();
        List<Row> recent = service.view(me, q()).activities().items();
        assertThat(recent.get(0).type()).isEqualTo("RESUME_UPDATED");
        assertThat(recent.get(0).at()).isAfterOrEqualTo(recent.get(1).at());
        List<Row> oldest = service.view(me, with(b -> { b.sort = "oldest"; return b; })).activities().items();
        assertThat(oldest.get(0).at()).isBeforeOrEqualTo(oldest.get(1).at());
        View page2 = service.view(me, with(b -> { b.size = 3; b.page = 1; return b; }));
        assertThat(page2.activities().items()).hasSize(3);
        assertThat(page2.activities().total()).isEqualTo(7);
        assertThat(page2.activities().page()).isEqualTo(1);
        assertThat(page2.activities().size()).isEqualTo(3);
        assertThat(service.view(me, with(b -> { b.size = 5000; return b; })).activities().size()).isEqualTo(MktActivityService.MAX_SIZE);
    }

    // ---- KPI and summary math ----------------------------------------------------------------------------------------------------------

    @Test
    void aTileCountsItsGroupAndComparesTheLastWeekWithTheOneBefore() {
        // 3 resume lines in the last 7 days, 2 in the 7 days before, 1 earlier this month
        stub(
            rows(r(1L, "UPDATED", 1, null, 11L, 7L, ago(24)), r(2L, "UPDATED", 1, null, 11L, 7L, ago(48)), r(3L, "UPDATED", 1, null, 11L, 7L, ago(100)),
                r(4L, "UPDATED", 1, null, 11L, 7L, ago(24 * 9)), r(5L, "UPDATED", 1, null, 11L, 7L, ago(24 * 10))),
            List.of(), List.of(), List.of(), List.of(), List.of(), List.of()
        );
        MktActivityDto.Kpi resume = service.view(me, q()).kpis().get(1);
        assertThat(resume.value()).isEqualTo(5);
        assertThat(resume.sparkline()).hasSize(8);
        assertThat(resume.sparkline().get(7)).isEqualTo(3);
        assertThat(resume.sparkline().get(6)).isEqualTo(2);
        assertThat(resume.deltaPct()).isEqualTo(50.0);
    }

    @Test
    void aDeltaWithNothingToCompareIsOmitted() {
        stub(rows(r(1L, "UPDATED", 1, null, 11L, 7L, ago(24))), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        assertThat(service.view(me, q()).kpis().get(1).deltaPct()).isNull();
    }

    @Test
    void theSummaryCountsTheChosenWindowWithPercentsAndFoldsFeedbackIntoInterviews() {
        oneOfEach();
        MktActivityDto.Summary s = service.view(me, q()).summary();
        assertThat(s.range()).isEqualTo("THIS_MONTH");
        assertThat(s.total()).isEqualTo(7);
        // resume, submissions, follow-ups, interviews (+ the feedback line), applications, offers, placements, then opportunities
        assertThat(s.rows()).extracting(MktActivityDto.SummaryRow::count).containsExactly(1L, 1L, 1L, 1L, 0L, 1L, 1L, 1L);
        assertThat(s.rows().get(3).label()).isEqualTo("Interviews"); // the feedback line
        assertThat(s.rows().get(0).pct()).isEqualTo(14.3);
        assertThat(s.rows().stream().mapToLong(MktActivityDto.SummaryRow::count).sum()).as("the rows add up to the total").isEqualTo(s.total());
    }

    @Test
    void opportunitiesJoinTheSummaryOnlyWhenTheyHaveRows() {
        assertThat(service.view(me, q()).summary().rows()).extracting(MktActivityDto.SummaryRow::key).doesNotContain("OPPORTUNITY");
        stub(List.of(), rows(r(2L, "ASSIGNED", "x", 11L, 100L, "Java Developer", 7L, ago(40))), List.of(), List.of(), List.of(), List.of(), List.of());
        assertThat(service.view(me, q()).summary().rows()).extracting(MktActivityDto.SummaryRow::key).endsWith("OPPORTUNITY");
    }

    @Test
    void theSummaryHasItsOwnRangeAndIgnoresTheTableFilters() {
        stub(rows(r(1L, "UPDATED", 1, null, 12L, 7L, Instant.parse("2026-09-10T10:00:00Z"))), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        MktActivityDto.Summary last = service.view(me, with(b -> { b.summary = "LAST_MONTH"; b.consultant = 11L; return b; })).summary();
        assertThat(last.range()).isEqualTo("LAST_MONTH");
        assertThat(last.from()).isEqualTo("2026-09-01");
        assertThat(last.to()).isEqualTo("2026-09-30");
        assertThat(last.total()).isEqualTo(1);
        assertThat(service.view(me, with(b -> { b.summary = "bogus"; return b; })).summary().range()).isEqualTo("THIS_MONTH");
    }

    // ---- upcoming ------------------------------------------------------------------------------------------------------------------------

    private static MktFollowupDto.Row follow(long id, String title, Long consultant, String name, String channel, Instant due) {
        return new MktFollowupDto.Row(id, title, null, consultant, name, null, null, null, "TechCorp", channel, "MEDIUM", "PENDING", false, due, null);
    }

    @Test
    void upcomingMergesOpenFollowupsInterviewsAndPlannedRowsSoonestFirst() {
        when(followups.today(any())).thenReturn(List.of(follow(1, "Client follow-up", 11L, "Alex Morgan", "PHONE", NOW.plus(2, ChronoUnit.HOURS)), follow(9, "Past due", 11L, "Alex Morgan", "PHONE", NOW.minus(1, ChronoUnit.HOURS))));
        when(followups.upcoming(any())).thenReturn(List.of(follow(2, "Send updated resume", 12L, "Priya Sharma", "EMAIL", NOW.plus(30, ChronoUnit.HOURS)), follow(3, "Too far", 12L, "Priya Sharma", "EMAIL", NOW.plus(20, ChronoUnit.DAYS)), follow(4, "Not mine", 77L, "Other", "PHONE", NOW.plus(3, ChronoUnit.HOURS))));
        when(upcomingInterviews.upcoming(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(rows(r(5L, NOW.plus(5, ChronoUnit.HOURS), 11L, 100L, "Technical")));
        when(manual.findPlanned(eq(ORG), anyBoolean(), anyCollection(), any(), any(), any())).thenReturn(List.of(manualRow(40, 12, "FOLLOWUP_LOGGED", "SCHEDULED", NOW.plus(1, ChronoUnit.HOURS))));
        View v = service.view(me, q());
        assertThat(v.upcomingTotal()).isEqualTo(4);
        assertThat(v.upcoming()).extracting(MktActivityDto.Upcoming::id).containsExactly("MANUAL:40", "FOLLOWUP:1", "INTERVIEW:5", "FOLLOWUP:2");
        assertThat(v.upcoming().get(1).title()).isEqualTo("Client follow-up: TechCorp");
        assertThat(v.upcoming().get(1).icon()).isEqualTo("phone");
        assertThat(v.upcoming().get(2).title()).isEqualTo("Interview: TechCorp (Technical)");
        assertThat(v.upcoming().get(3).icon()).isEqualTo("mail");
        assertThat(v.upcoming().get(3).consultantName()).isEqualTo("Priya Sharma");
    }

    // ---- writes (record only) ------------------------------------------------------------------------------------------------------------

    private CreateRequest request(String type, String title, Long consultant) {
        return new CreateRequest(consultant, 100L, type, title, "Spoke with the hiring manager", "Client, Call", null, null);
    }

    @Test
    void logActivityRecordsOneManualRowAuditedAndNeverSubmitsAnything() {
        MktActivityDto.ActionResult res = service.create(me, request("FOLLOWUP_LOGGED", "Called the recruiter", 11L));
        ArgumentCaptor<MktActivity> saved = ArgumentCaptor.forClass(MktActivity.class);
        verify(manual).save(saved.capture());
        MktActivity a = saved.getValue();
        assertThat(a.getOrgId()).isEqualTo(ORG);
        assertThat(a.getConsultantId()).isEqualTo(11L);
        assertThat(a.getClientAccountId()).isEqualTo(100L);
        assertThat(a.getActivityType()).isEqualTo("FOLLOWUP_LOGGED");
        assertThat(a.getStatus()).isEqualTo("COMPLETED");
        assertThat(a.getActorMemberId()).isEqualTo(ME);
        assertThat(a.getTags()).isEqualTo("Client,Call");
        assertThat(a.getOccurredAt()).isEqualTo(NOW);
        verify(audit).record(eq(me), eq("MARKETER_ACTIVITY_CREATE"), eq("ACTIVITY"), any(), eq("900"), any());
        assertThat(res.item().manual()).isTrue();
        assertThat(res.item().id()).isEqualTo("MANUAL:900");
        assertThat(res.item().tag()).isEqualTo("Client");
        assertThat(res.item().actor().name()).isEqualTo("Sarah Chen");
    }

    @Test
    void aFutureTimeMakesItScheduledAndACompletedFutureRowIsRejected() {
        MktActivityDto.ActionResult planned = service.create(me, new CreateRequest(11L, null, "INTERVIEW_SCHEDULED", "Prep call", null, null, null, NOW.plus(2, ChronoUnit.DAYS)));
        assertThat(planned.item().status()).isEqualTo("SCHEDULED");
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, "INTERVIEW_SCHEDULED", "Prep call", null, null, "COMPLETED", NOW.plus(2, ChronoUnit.DAYS)))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, "INTERVIEW_SCHEDULED", "Too old", null, null, null, NOW.minus(5000, ChronoUnit.DAYS)))).isInstanceOf(OrgException.class);
    }

    @Test
    void onlyRecordOnlyTypesCanBeLoggedAndNothingSubmitsForAConsultant() {
        // facts that only the source records can prove, and the one that means "sent to the client", are not loggable
        assertThatThrownBy(() -> service.create(me, request("CANDIDATE_SUBMITTED", "Sent it", 11L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, request("PLACEMENT_CONFIRMED", "Placed", 11L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, request("NOPE", "x", 11L))).isInstanceOf(OrgException.class);
        assertThat(MktActivityTypes.Type.manualTypes()).extracting(Enum::name).doesNotContain("CANDIDATE_SUBMITTED", "PLACEMENT_CONFIRMED");
        verify(manual, never()).save(any());
    }

    @Test
    void aConsultantOutsideTheScopeOrAnUnknownClientIs404AndWritesNothing() {
        assertThatThrownBy(() -> service.create(me, request("FOLLOWUP_LOGGED", "Called", 99L))).isInstanceOf(OrgNotFoundException.class);
        when(clients.findByOrgIdAndId(ORG, 555L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, 555L, "FOLLOWUP_LOGGED", "Called", null, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        verify(manual, never()).save(any());
    }

    @Test
    void writingNeedsTheWriteKeyAndTextIsValidatedAndScanned() {
        when(scope.resolve(me, "followups.manage")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.create(me, request("FOLLOWUP_LOGGED", "Called", 11L))).isInstanceOf(OrgNotFoundException.class);
        org.mockito.Mockito.doReturn(assigned).when(scope).resolve(me, "followups.manage");
        assertThatThrownBy(() -> service.create(me, request("FOLLOWUP_LOGGED", "  ", 11L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, request("FOLLOWUP_LOGGED", "<b>x</b>", 11L))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, request("FOLLOWUP_LOGGED", "ssn 123-45-6789", 11L))).isInstanceOf(com.dossier.api.service.privacy.SensitiveContentException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, "FOLLOWUP_LOGGED", "ok", null, "a,b,c,d,e,f", null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, "FOLLOWUP_LOGGED", "ok", null, "x".repeat(30), null, null))).isInstanceOf(OrgException.class);
        verify(manual, never()).save(any());
    }

    @Test
    void statusChangesOnlyTouchTheCallersOwnVisibleManualRowsAndAreAudited() {
        MktActivity mine = manualRow(50, 11, "FOLLOWUP_LOGGED", "SCHEDULED", NOW.plus(1, ChronoUnit.DAYS));
        when(manual.findByOrgIdAndId(ORG, 50L)).thenReturn(Optional.of(mine));
        MktActivityDto.ActionResult res = service.updateStatus(me, 50L, "completed");
        assertThat(res.item().status()).isEqualTo("COMPLETED");
        verify(audit).record(eq(me), eq("MARKETER_ACTIVITY_STATUS"), eq("ACTIVITY"), any(), eq("50"), eq("SCHEDULED -> COMPLETED"));

        MktActivity foreign = manualRow(51, 99, "FOLLOWUP_LOGGED", "SCHEDULED", NOW);
        when(manual.findByOrgIdAndId(ORG, 51L)).thenReturn(Optional.of(foreign));
        assertThatThrownBy(() -> service.updateStatus(me, 51L, "CANCELLED")).isInstanceOf(OrgNotFoundException.class);
        when(manual.findByOrgIdAndId(ORG, 52L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.updateStatus(me, 52L, "CANCELLED")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.updateStatus(me, 50L, "ARCHIVED")).isInstanceOf(OrgException.class);
    }

    // ---- options -------------------------------------------------------------------------------------------------------------------------

    @Test
    void optionsOfferTheVisibleConsultantsClientsOwnersAndFixedChoices() {
        oneOfEach();
        MktActivityDto.Options o = service.view(me, q()).options();
        assertThat(o.consultants()).extracting(MktActivityDto.Option::name).containsExactly("Alex Morgan", "Priya Sharma");
        assertThat(o.clients()).extracting(MktActivityDto.Option::name).containsExactly("TechCorp", "Global Bank");
        assertThat(o.owners()).extracting(MktActivityDto.Option::name).containsExactly("Sarah Chen");
        assertThat(o.types()).extracting(MktActivityDto.Choice::key).contains("RESUME", "FEEDBACK", "PLACEMENT");
        assertThat(o.manualTypes()).extracting(MktActivityDto.Choice::key).contains("FOLLOWUP_LOGGED").doesNotContain("CANDIDATE_SUBMITTED");
        assertThat(o.statuses()).extracting(MktActivityDto.Choice::key).containsExactly("COMPLETED", "SCHEDULED", "CANCELLED");
        assertThat(o.summaryRanges()).extracting(MktActivityDto.Choice::key).containsExactly("THIS_MONTH", "LAST_MONTH", "LAST_7_DAYS", "LAST_30_DAYS");
    }
}
