package com.dossier.api.service.ent.mkt.home;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mkt.MktHomeInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktHomeInterviewRepository;
import com.dossier.api.repository.ent.mkt.MktHomeMatchRepository;
import com.dossier.api.repository.ent.mkt.MktHomeRequirementRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsService;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Kpi;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.View;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsService;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktMatchesService;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto;
import com.dossier.api.service.ent.mkt.streams.MktStreamsService;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsService;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Scope filtering, KPI math against the sibling services, section caps/ordering, empty states and the 404 gate of {@link MktHomeService} (mocked services, no Docker). */
class MktHomeServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final Long ORG = 1L;

    private final MktScope scope = mock(MktScope.class);
    private final MktTalentService talent = mock(MktTalentService.class);
    private final MktMatchesService matches = mock(MktMatchesService.class);
    private final MktSubmissionsService submissions = mock(MktSubmissionsService.class);
    private final MktInterviewsService interviews = mock(MktInterviewsService.class);
    private final MktFollowupService followups = mock(MktFollowupService.class);
    private final MktApplicationsService applications = mock(MktApplicationsService.class);
    private final MktStreamsService streams = mock(MktStreamsService.class);
    private final MktResumesService resumes = mock(MktResumesService.class);
    private final MktHomeInterviewRepository interviewCounts = mock(MktHomeInterviewRepository.class);
    private final MktHomeMatchRepository matchCounts = mock(MktHomeMatchRepository.class);
    private final MktHomeRequirementRepository requirements = mock(MktHomeRequirementRepository.class);
    private final MktHomeInterviewEventRepository events = mock(MktHomeInterviewEventRepository.class);
    private final OrgMembership me = new OrgMembership(ORG, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktHomeService service;

    @BeforeEach
    void setUp() {
        service = new MktHomeService(scope, talent, matches, submissions, interviews, followups, applications, streams, resumes, interviewCounts, matchCounts, requirements, events, Clock.fixed(NOW, ZoneOffset.UTC));
        when(scope.resolve(me, "consultants.view")).thenReturn(new MktScope.View(ORG, 7L, false, Set.of(1L, 2L, 3L)));
        when(talent.list(eq(me), any())).thenReturn(talentResponse(List.of(), 0, 0, List.of(0L), List.of(0L)));
        when(events.findRecent(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(List.of());
    }

    // ---- builders ------------------------------------------------------------------------------------------------------------

    private static MktTalentDtos.Row talentRow(long id, String name, String availCode, String resumeState, int apps, int assigned) {
        return new MktTalentDtos.Row(id, name, null, "Engineer", "Java", 5, "NYC", new MktTalentDtos.Availability(availCode, "Available Now", "green"), new MktTalentDtos.ResumeStatus(resumeState, "x"), apps, assigned);
    }

    private static MktTalentDtos.Response talentResponse(List<MktTalentDtos.Row> rows, long assigned, long needs, List<Long> assignedSpark, List<Long> needsSpark) {
        return new MktTalentDtos.Response(
            List.of(new MktTalentDtos.Kpi("assigned", assigned, 12.0, assignedSpark), new MktTalentDtos.Kpi("needUpdates", needs, null, needsSpark)),
            new MktTalentDtos.Counts(assigned, 0, 0, needs, 0), new MktTalentDtos.Facets(List.of(), List.of()), rows, rows.size(), 0, 5, null, List.of(), false
        );
    }

    private static MktMatchesDto.Row matchRow(long id, long consultant, long job, int score, String status) {
        return new MktMatchesDto.Row(id, consultant, "C" + consultant, null, "Dev", "Java", job, "Job " + job, 9L, "Client", score, status, false, false, null, null, NOW);
    }

    private static MktMatchesDto.Response matchResponse(List<MktMatchesDto.Row> rows) {
        return new MktMatchesDto.Response(List.of(new MktMatchesDto.Kpi("matched", 56, 18.0, List.of(1L, 2L))), null, rows, rows.size(), 0, 100, List.of(), null, 80, 14);
    }

    private static MktFollowupDto.Row followRow(long id, long consultant, String channel) {
        return new MktFollowupDto.Row(id, "T" + id, null, consultant, "Name" + consultant, null, null, null, null, channel, "MEDIUM", "PENDING", false, NOW.plusSeconds(3600L * id), null);
    }

    private static MktFollowupDto.Page page(List<MktFollowupDto.Row> rows) {
        return new MktFollowupDto.Page(rows, rows.size(), 0, 100);
    }

    private MktFollowupDto.View followView(List<MktFollowupDto.Row> today, List<MktFollowupDto.Row> overdue) {
        return new MktFollowupDto.View(NOW, List.of(new MktFollowupDto.Kpi("dueToday", 9, null, List.of()), new MktFollowupDto.Kpi("overdue", 6, -40.0, List.of(1L, 2L, 3L))), page(today), page(overdue), page(List.of()), null);
    }

    private static MktInterviewsDto.Row interviewRow(long id, long consultant, String round) {
        return new MktInterviewsDto.Row(id, consultant, "C" + consultant, null, "Dev", 1L, "TechCorp", "VIDEO", NOW.plusSeconds(600L * id), 45, round, null, "CONFIRMED", null, 0);
    }

    private static MktInterviewsDto.Overview overview(List<MktInterviewsDto.Row> upcoming) {
        return new MktInterviewsDto.Overview(NOW, List.of(), null, upcoming, List.of(), null, List.of(), List.of());
    }

    private static MktApplicationsDTO.Response appsResponse(long total, List<MktApplicationsDTO.Update> updates) {
        List<MktApplicationsDTO.FunnelStageRow> rows = List.of(
            new MktApplicationsDTO.FunnelStageRow("applied", "Applied", total, 100), new MktApplicationsDTO.FunnelStageRow("awaiting", "Awaiting Response", total / 2, 50),
            new MktApplicationsDTO.FunnelStageRow("interviewing", "Interviewing", total / 4, 25), new MktApplicationsDTO.FunnelStageRow("offers", "Offers", 3, 5),
            new MktApplicationsDTO.FunnelStageRow("hired", "Hired", 1, 1)
        );
        return new MktApplicationsDTO.Response(List.of(), null, new MktApplicationsDTO.Funnel("3m", total, rows), List.of(), 0, updates, null);
    }

    private static MktApplicationsDTO.Update update(long id, long consultant, Instant at) {
        return new MktApplicationsDTO.Update(id, 100 + id, new MktApplicationsDTO.Consultant(consultant, "C" + consultant, null, "FULL"), "moved to Offer", "Dev at X", at, "green");
    }

    // ---- the gate and the empty org ----------------------------------------------------------------------------------------

    @Test
    void aCallerWithoutTheKeyOrOutsideTheOrgIsTheGenericNotFoundAndNothingIsRead() {
        when(scope.resolve(me, "consultants.view")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.home(me)).isInstanceOf(OrgNotFoundException.class);
        verifyNoInteractions(talent, matches, submissions, interviews, followups, applications, streams, resumes, interviewCounts, matchCounts, requirements, events);
    }

    @Test
    void anEmptyOrgDrawsEverySectionEmptyAndNeverFabricatesANumber() {
        when(talent.list(eq(me), any())).thenReturn(new MktTalentDtos.Response(List.of(), new MktTalentDtos.Counts(0, 0, 0, 0, 0), new MktTalentDtos.Facets(List.of(), List.of()), List.of(), 0, 0, 5, null, List.of(), false));
        View v = service.home(me);
        assertThat(v.kpis()).extracting(Kpi::key).containsExactly("assigned", "profilesReady", "newMatches", "pendingSubmissions", "upcomingInterviews", "overdueFollowups");
        assertThat(v.kpis()).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
        });
        assertThat(v.talent()).isEmpty();
        assertThat(v.streams()).isEmpty();
        assertThat(v.openings()).isEmpty();
        assertThat(v.pipeline()).isNull();
        assertThat(v.tasks()).isEmpty();
        assertThat(v.interviews()).isEmpty();
        assertThat(v.activity()).isEmpty();
    }

    @Test
    void aSectionWhoseSourcePageIsNotReadableIsEmptyAndTheRestStillDraws() {
        when(followups.view(eq(me), any(), org.mockito.ArgumentMatchers.anyInt(), any())).thenThrow(new OrgNotFoundException());
        when(matches.list(eq(me), any())).thenReturn(matchResponse(List.of(matchRow(1, 1, 10, 90, "SUGGESTED"))));
        View v = service.home(me);
        assertThat(v.tasks()).isEmpty();
        assertThat(v.kpis().get(5).value()).isZero();
        assertThat(v.openings()).hasSize(1);
    }

    // ---- scope filtering ------------------------------------------------------------------------------------------------------

    @Test
    void aConsultantTheCallerIsNotAssignedToNeverAppearsInAnySection() {
        when(talent.list(eq(me), any())).thenReturn(talentResponse(List.of(talentRow(1, "Mine", "AVAILABLE_NOW", "UP_TO_DATE", 1, 0), talentRow(99, "Stranger", "AVAILABLE_NOW", "UP_TO_DATE", 1, 0)), 2, 0, List.of(1L), List.of(0L)));
        when(matches.list(eq(me), any())).thenReturn(matchResponse(List.of(matchRow(1, 99, 10, 99, "SUGGESTED"), matchRow(2, 1, 11, 80, "SUGGESTED"))));
        when(followups.view(eq(me), any(), org.mockito.ArgumentMatchers.anyInt(), any())).thenReturn(followView(List.of(followRow(1, 99, "PHONE"), followRow(2, 2, "EMAIL")), List.of()));
        when(interviews.overview(eq(me), any())).thenReturn(overview(List.of(interviewRow(1, 99, null), interviewRow(2, 3, "1st Round"))));
        when(applications.get(eq(me), any())).thenReturn(appsResponse(10, List.of(update(1, 99, NOW), update(2, 1, NOW.minusSeconds(60)))));
        when(resumes.list(eq(me), any())).thenReturn(new MktResumesDto.Page(List.of(), List.of(), 0, 0, 1, List.of(), List.of(new MktResumesDto.Activity(5L, 1L, 99L, "Stranger", null, "UPDATED", "updated resume", NOW)), false));
        when(events.findRecent(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(List.<Object[]>of(new Object[] { 7L, "SLOT_CONFIRMED", null, NOW, 99L, "Stranger" }));

        View v = service.home(me);
        assertThat(v.talent()).extracting(t -> t.name()).containsExactly("Mine");
        assertThat(v.openings()).extracting(o -> o.matchPct()).containsExactly(80);
        assertThat(v.tasks()).extracting(t -> t.id()).containsExactly(2L);
        assertThat(v.interviews()).extracting(i -> i.id()).containsExactly(2L);
        assertThat(v.activity()).extracting(a -> a.actor()).containsExactly("C1");
    }

    // ---- KPI math vs the sibling services -------------------------------------------------------------------------------------

    @Test
    void theTilesEqualTheirPagesNumbers() {
        when(talent.list(eq(me), any())).thenReturn(talentResponse(List.of(), 28, 4, List.of(10L, 12L, 15L, 20L, 21L, 24L, 26L, 28L), List.of(1L, 1L, 2L, 3L, 4L, 4L, 4L, 4L)));
        when(matches.list(eq(me), any())).thenReturn(matchResponse(List.of()));
        when(submissions.board(eq(me), any())).thenReturn(new MktSubmissionsDto.BoardResponse(
            new MktSubmissionsDto.Kpis(new MktSubmissionsDto.Kpi(18, -22.0, List.of(10L, 5L)), null, null, null), List.of(), 0, 0, 10, null, List.of(), null, List.of()
        ));
        when(followups.view(eq(me), any(), org.mockito.ArgumentMatchers.anyInt(), any())).thenReturn(followView(List.of(), List.of()));
        when(interviews.overview(eq(me), any())).thenReturn(overview(List.of()));
        when(interviewCounts.countLiveBetween(eq(ORG), anyBoolean(), anyCollection(), any(), any())).thenReturn(3L, 3L, 4L, 5L, 5L, 6L, 8L, 12L, 8L);

        List<Kpi> k = service.home(me).kpis();
        assertThat(k.get(0)).isEqualTo(new Kpi("assigned", 28, 12.0, List.of(10L, 12L, 15L, 20L, 21L, 24L, 26L, 28L)));
        // 28 assigned - 4 needing an update; the series is the pointwise difference; delta against four weeks ago (index 3: 20 - 3 = 17) = +41.2 %
        assertThat(k.get(1).value()).isEqualTo(24);
        assertThat(k.get(1).sparkline()).containsExactly(9L, 11L, 13L, 17L, 17L, 20L, 22L, 24L);
        assertThat(k.get(1).deltaPct()).isEqualTo(41.2);
        assertThat(k.get(2)).isEqualTo(new Kpi("newMatches", 56, 18.0, List.of(1L, 2L)));
        assertThat(k.get(3)).isEqualTo(new Kpi("pendingSubmissions", 18, -22.0, List.of(10L, 5L)));
        // next 7 days = 12, the 7 days before = 8 -> +50 %
        assertThat(k.get(4).value()).isEqualTo(12);
        assertThat(k.get(4).deltaPct()).isEqualTo(50.0);
        assertThat(k.get(4).sparkline()).hasSize(8);
        assertThat(k.get(5)).isEqualTo(new Kpi("overdueFollowups", 6, -40.0, List.of(1L, 2L, 3L)));
    }

    @Test
    void aDeltaWithNothingToCompareIsOmitted() {
        assertThat(MktHomeService.pct(5, 0)).isNull();
        assertThat(MktHomeService.pct(6, 4)).isEqualTo(50.0);
    }

    // ---- caps and ordering -----------------------------------------------------------------------------------------------------

    @Test
    void talentIsCappedAtFiveWithTheNextActionRulesApplied() {
        List<MktTalentDtos.Row> rows = new ArrayList<>();
        rows.add(talentRow(1, "A", "AVAILABLE_NOW", "NEEDS_UPDATE", 3, 2));
        rows.add(talentRow(2, "B", "AVAILABLE_NOW", "UP_TO_DATE", 5, 1));
        rows.add(talentRow(3, "C", "SOON", "UP_TO_DATE", 2, 0));
        rows.add(talentRow(1, "D", "SOON", "UP_TO_DATE", 2, 0));
        rows.add(talentRow(2, "E", "SOON", "UP_TO_DATE", 2, 0));
        rows.add(talentRow(3, "F", "SOON", "UP_TO_DATE", 2, 0));
        when(talent.list(eq(me), any())).thenReturn(talentResponse(rows, 6, 1, List.of(1L), List.of(0L)));
        when(matchCounts.countSuggestedByConsultant(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 3L, 4L }));
        View v = service.home(me);
        assertThat(v.talent()).hasSize(5);
        assertThat(v.talent().get(0).nextAction().label()).isEqualTo("Request Resume");
        assertThat(v.talent().get(0).resume().state()).isEqualTo("NEEDS_UPDATE");
        assertThat(v.talent().get(1).nextAction().label()).isEqualTo("Submit to Job");
        assertThat(v.talent().get(2).nextAction().label()).isEqualTo("Review Matches");
        assertThat(v.talent().get(1).resume().label()).isEqualTo("Updated");
    }

    @Test
    void openingsAreTheBestSuggestedMatchPerJobBestFirstCappedAtFive() {
        List<MktMatchesDto.Row> rows = new ArrayList<>();
        rows.add(matchRow(1, 1, 10, 70, "SUGGESTED"));
        rows.add(matchRow(2, 2, 10, 95, "SUGGESTED")); // same job, better match: wins
        rows.add(matchRow(3, 1, 11, 99, "ASSIGNED")); // not a suggestion: left out
        for (int j = 12; j < 20; j++) rows.add(matchRow(j, 1, j, 60 + j, "SUGGESTED"));
        when(matches.list(eq(me), any())).thenReturn(matchResponse(rows));
        when(requirements.findLocations(eq(ORG), anyCollection())).thenReturn(List.<Object[]>of(new Object[] { 10L, "New York, NY" }));
        List<MktHomeDto.Opening> o = service.home(me).openings();
        assertThat(o).hasSize(5);
        assertThat(o).extracting(MktHomeDto.Opening::matchPct).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(o.get(0).matchPct()).isEqualTo(95);
        assertThat(o.get(0).id()).isEqualTo(2L);
        assertThat(o.get(0).location()).isEqualTo("New York, NY");
        assertThat(o).extracting(MktHomeDto.Opening::title).doesNotHaveDuplicates();
    }

    @Test
    void tasksTodayAndInterviewsAreCappedAndKeepTheirSourceOrder() {
        List<MktFollowupDto.Row> today = new ArrayList<>();
        for (int i = 1; i <= 7; i++) today.add(followRow(i, 1, i == 1 ? "PHONE" : i == 2 ? "EMAIL" : i == 3 ? "CHAT" : "NOTE"));
        when(followups.view(eq(me), any(), org.mockito.ArgumentMatchers.anyInt(), any())).thenReturn(followView(today, List.of()));
        List<MktInterviewsDto.Row> up = new ArrayList<>();
        for (int i = 1; i <= 5; i++) up.add(interviewRow(i, 1, i == 1 ? "1st Round" : null));
        when(interviews.overview(eq(me), any())).thenReturn(overview(up));
        View v = service.home(me);
        assertThat(v.tasks()).hasSize(5);
        assertThat(v.tasks()).extracting(MktHomeDto.Task::id).containsExactly(1L, 2L, 3L, 4L, 5L);
        assertThat(v.tasks()).extracting(MktHomeDto.Task::kind).containsExactly("CALL", "EMAIL", "CHAT", "NOTE", "NOTE");
        assertThat(v.tasks().get(0).sub()).isEqualTo("Name1");
        assertThat(v.interviews()).hasSize(4);
        assertThat(v.interviews().get(0).type()).isEqualTo("1st Round");
        assertThat(v.interviews().get(1).type()).isEqualTo("Video");
        assertThat(v.interviews().get(0).status()).isEqualTo("Confirmed");
    }

    @Test
    void activityMergesApplicationsResumesAndInterviewsNewestFirstCappedAtFive() {
        when(applications.get(eq(me), any())).thenReturn(appsResponse(10, List.of(update(1, 1, NOW.minusSeconds(100)), update(2, 2, NOW.minusSeconds(500)), update(3, 3, NOW.minusSeconds(900)))));
        when(resumes.list(eq(me), any())).thenReturn(new MktResumesDto.Page(List.of(), List.of(), 0, 0, 1, List.of(), List.of(
            new MktResumesDto.Activity(1L, 1L, 1L, "C1", null, "UPDATED", "updated resume to v2", NOW.minusSeconds(50)),
            new MktResumesDto.Activity(2L, 2L, 2L, "C2", null, "APPROVED", "resume approved", NOW.minusSeconds(700))
        ), false));
        when(events.findRecent(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(List.<Object[]>of(
            new Object[] { 1L, "FEEDBACK_RECORDED", "Went well", NOW.minusSeconds(10), 1L, "C1" },
            new Object[] { 2L, "SLOT_CONFIRMED", null, NOW.minusSeconds(2000), 2L, "C2" }
        ));
        List<MktHomeDto.Activity> a = service.home(me).activity();
        assertThat(a).hasSize(5);
        assertThat(a).extracting(MktHomeDto.Activity::at).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(a.get(0).text()).isEqualTo("interview feedback recorded");
        assertThat(a.get(0).detail()).isEqualTo("Went well");
        assertThat(a).extracting(MktHomeDto.Activity::id).doesNotHaveDuplicates();
    }

    @Test
    void theStreamsAreReadAsTheStreamsPageDrawsThem() {
        List<MktStreamsDto.StreamRow> rows = List.of(new MktStreamsDto.StreamRow(1L, "LinkedIn Jobs", null, "ACTIVE", true, 30, List.of(), null, NOW.minusSeconds(600), 124, null));
        when(streams.get(eq(me), any())).thenReturn(new MktStreamsDto.View(List.of(), new MktStreamsDto.StreamPage(rows, 1, 0, 5), null, List.of(), null, List.of(), List.of()));
        assertThat(service.home(me).streams()).containsExactly(new MktHomeDto.Stream("LinkedIn Jobs", "Active", 124, NOW.minusSeconds(600)));
    }

    // ---- pipeline ---------------------------------------------------------------------------------------------------------------

    @Test
    void thePipelineReadsTheApplicationsFunnelAndComparesTheQuarterWithTheOneBefore() {
        when(applications.get(eq(me), org.mockito.ArgumentMatchers.argThat(q -> q != null && "3m".equals(q.funnelPeriod())))).thenReturn(appsResponse(120, List.of()));
        when(applications.get(eq(me), org.mockito.ArgumentMatchers.argThat(q -> q != null && "6m".equals(q.funnelPeriod())))).thenReturn(appsResponse(220, List.of()));
        MktHomeDto.Pipeline p = service.home(me).pipeline();
        assertThat(p.total()).isEqualTo(120);
        assertThat(p.deltaPct()).isEqualTo(20.0); // 120 now vs 100 in the 3 months before
        assertThat(p.stages()).extracting(MktHomeDto.Stage::key).containsExactly("review", "submitted", "interviewing", "offer", "placed");
        assertThat(p.stages()).extracting(MktHomeDto.Stage::label).containsExactly("Review", "Submitted", "Interviewing", "Offer", "Placed");
        assertThat(p.stages().get(1).count()).isEqualTo(60);
    }
}
