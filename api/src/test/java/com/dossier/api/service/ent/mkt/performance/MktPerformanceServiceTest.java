package com.dossier.api.service.ent.mkt.performance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktBenchmark;
import com.dossier.api.domain.ent.mkt.MktGoal;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.repository.ent.mkt.MktApplicationClientRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationEventRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationLookupRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktBenchmarkRepository;
import com.dossier.api.repository.ent.mkt.MktGoalRepository;
import com.dossier.api.repository.ent.mkt.MktPerformanceFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktPerformanceMatchRepository;
import com.dossier.api.repository.ent.mkt.MktPerformancePlacementRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.GoalsRequest;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Kpi;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.Query;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.StreamRow;
import com.dossier.api.service.ent.mkt.performance.MktPerformanceDto.View;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Scope, consent, KPI math, funnel, streams, ranking, goals and the 404 gate of {@link MktPerformanceService} (mocked repositories, no Docker). */
class MktPerformanceServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 13);
    private static final Long ORG = 1L;

    private final MktScope scope = mock(MktScope.class);
    private final MktTalentService talent = mock(MktTalentService.class);
    private final MktApplicationRepository apps = mock(MktApplicationRepository.class);
    private final MktApplicationEventRepository events = mock(MktApplicationEventRepository.class);
    private final MktApplicationLookupRepository consultants = mock(MktApplicationLookupRepository.class);
    private final MktApplicationClientRepository clients = mock(MktApplicationClientRepository.class);
    private final MktPerformancePlacementRepository placements = mock(MktPerformancePlacementRepository.class);
    private final MktPerformanceFollowupRepository followups = mock(MktPerformanceFollowupRepository.class);
    private final MktPerformanceMatchRepository matches = mock(MktPerformanceMatchRepository.class);
    private final MktGoalRepository goals = mock(MktGoalRepository.class);
    private final MktBenchmarkRepository benchmarks = mock(MktBenchmarkRepository.class);
    private final DataShareService shares = mock(DataShareService.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgMembership me = new OrgMembership(ORG, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktPerformanceService service;
    private long nextId = 100;

    @BeforeEach
    void setUp() {
        service = new MktPerformanceService(scope, talent, apps, events, consultants, clients, placements, followups, matches, goals, benchmarks, shares, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        when(scope.resolve(me, "reports.view")).thenReturn(new MktScope.View(ORG, 7L, false, Set.of(1L, 2L, 3L)));
        when(talent.list(eq(me), any())).thenThrow(new OrgNotFoundException());
        when(apps.findByOrgIdAndConsultantIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(placements.findStartedSince(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(List.of());
        when(events.findByOrgIdAndApplicationIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(clients.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of());
        when(benchmarks.findByOrgId(ORG)).thenReturn(List.of());
        when(goals.findDefaults(ORG)).thenReturn(List.of());
        when(goals.findByOrgIdAndOwnerMemberId(ORG, 7L)).thenReturn(List.of());
        when(matches.averageScoreByConsultant(eq(ORG), anyCollection())).thenReturn(List.of());
        when(matches.countSuggestedByConsultant(eq(ORG), anyCollection())).thenReturn(List.of());
        when(shares.scopeOf(eq(ORG), anyLong())).thenReturn(ShareScope.FULL);
    }

    // ---- builders ------------------------------------------------------------------------------------------------------------

    private static ConsultantProfile person(long id, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setDisplayName(name);
        c.setProfileCompleteness(90);
        return c;
    }

    private static ClientAccount client(long id, String name) {
        ClientAccount c = new ClientAccount();
        c.setId(id);
        c.setName(name);
        return c;
    }

    /** An application of consultant {@code c} at client {@code cl}, applied {@code daysAgo} days ago, ending at {@code stage}. */
    private TalentApplication app(long c, long cl, int daysAgo, String stage, String reason) {
        TalentApplication a = new TalentApplication();
        a.setId(nextId++);
        a.setOrgId(ORG);
        a.setConsultantId(c);
        a.setClientId(cl);
        a.setStage(stage);
        a.setClosedReason(reason);
        a.setAppliedOn(TODAY.minusDays(daysAgo));
        a.setStageChangedAt(NOW.minusSeconds(86400L * daysAgo));
        a.setCreatedAt(NOW.minusSeconds(86400L * (daysAgo + 1)));
        return a;
    }

    private static TalentPlacement placement(long c, long cl, int daysAgo) {
        TalentPlacement p = new TalentPlacement();
        p.setConsultantId(c);
        p.setClientId(cl);
        p.setStartDate(TODAY.minusDays(daysAgo));
        return p;
    }

    private void book(List<TalentApplication> a, List<TalentPlacement> p) {
        when(apps.findByOrgIdAndConsultantIdIn(eq(ORG), anyCollection())).thenReturn(a);
        when(placements.findStartedSince(eq(ORG), anyBoolean(), anyCollection(), any())).thenReturn(p);
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(person(1, "Alex Morgan"), person(2, "Priya Sharma"), person(3, "Michael Park"), person(9, "Outsider")));
        when(clients.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(client(10, "TechCorp"), client(11, "Global Bank")));
    }

    private static Kpi kpi(View v, String key) {
        return v.kpis().stream().filter(k -> key.equals(k.key())).findFirst().orElseThrow();
    }

    // ---- gate and empty states ------------------------------------------------------------------------------------------------

    @Test
    void aCallerWithoutTheKeyOrTheRoleIsTheGenericNotFound() {
        when(scope.resolve(me, "reports.view")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.view(me, null)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.updateGoals(me, new GoalsRequest(5, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        verify(goals, never()).save(any());
    }

    @Test
    void anOrgWithNothingGivesEmptyStatesAndNoMadeUpNumbers() {
        View v = service.view(me, null);
        assertThat(v.kpis()).hasSize(6);
        assertThat(kpi(v, "assignedConsultants").value()).isNull();
        assertThat(kpi(v, "activeSubmissions").value()).isNull();
        assertThat(kpi(v, "interviewRate").value()).isNull();
        assertThat(kpi(v, "interviewRate").deltaPct()).isNull();
        assertThat(kpi(v, "placements").value()).isZero();
        assertThat(kpi(v, "placements").deltaPct()).isNull();
        assertThat(kpi(v, "followupCompletion").value()).isNull();
        assertThat(v.weekly().weeks()).hasSize(8);
        assertThat(v.weekly().weeks()).allMatch(w -> w.submissions() == 0);
        assertThat(v.funnel().total()).isZero();
        assertThat(v.funnel().stages()).extracting("count").containsOnly(0L);
        assertThat(v.readiness()).isNull();
        assertThat(v.streams().rows()).isEmpty();
        assertThat(v.top()).isEmpty();
        assertThat(v.actions()).isEmpty();
        assertThat(v.benchmarks().rows()).hasSize(3).allMatch(r -> r.value() == null && r.industry() == null);
        assertThat(v.goals().rows()).hasSize(4).allMatch(r -> r.target() == null && r.pct() == null);
    }

    @Test
    void aMarketerWithNoAssignmentsNeverReadsAnyConsultantRows() {
        when(scope.resolve(me, "reports.view")).thenReturn(new MktScope.View(ORG, 7L, false, Set.of()));
        View v = service.view(me, null);
        assertThat(v.funnel().total()).isZero();
        verify(apps, never()).findByOrgIdAndConsultantIdIn(any(), any());
        verify(apps, never()).findByOrgId(any());
        verify(placements, never()).findStartedSince(any(), anyBoolean(), any(), any());
    }

    // ---- scope and consent --------------------------------------------------------------------------------------------------------

    @Test
    void anUnassignedConsultantsRowsAreNeverCounted() {
        book(List.of(app(1, 10, 3, "SUBMITTED", null), app(9, 10, 3, "OFFER", null)), List.of(placement(1, 10, 2), placement(9, 10, 2)));
        View v = service.view(me, null);
        assertThat(v.funnel().total()).isEqualTo(1);
        assertThat(v.funnel().stages().get(3).count()).isEqualTo(1);
        assertThat(v.top()).extracting("id").containsExactly(1L);
    }

    @Test
    void aConsultantWhoSharesNothingIsLeftOutOfEveryCount() {
        ConsultantProfile hidden = person(2, "Priya Sharma");
        hidden.setMemberId(55L);
        when(shares.scopeOf(ORG, 55L)).thenReturn(ShareScope.NONE);
        when(apps.findByOrgIdAndConsultantIdIn(eq(ORG), anyCollection())).thenReturn(List.of(app(1, 10, 3, "SUBMITTED", null), app(2, 10, 3, "OFFER", null)));
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(person(1, "Alex Morgan"), hidden));
        View v = service.view(me, null);
        assertThat(v.funnel().total()).isEqualTo(1);
        assertThat(v.top()).extracting("name").containsExactly("Alex Morgan");
    }

    // ---- KPI math, funnel, weekly --------------------------------------------------------------------------------------------------

    @Test
    void kpiRatesAreCohortRatesOverTheLast30DaysWithADeltaAgainstTheThirtyBefore() {
        List<TalentApplication> rows = new ArrayList<>();
        // this month (days 0..30): 10 submissions, 4 reached interview, 2 reached offer
        for (int i = 0; i < 4; i++) rows.add(app(1, 10, 2 + i, "SUBMITTED", null));
        for (int i = 0; i < 2; i++) rows.add(app(1, 10, 6 + i, "INTERVIEWING", null));
        for (int i = 0; i < 2; i++) rows.add(app(2, 11, 8 + i, "OFFER", null));
        rows.add(app(2, 11, 10, "CLOSED", "HIRED"));
        rows.add(app(2, 11, 11, "CLOSED", "REJECTED"));
        // the month before (days 31..60): 5 submissions, 1 interview, 0 offers
        for (int i = 0; i < 4; i++) rows.add(app(3, 10, 35 + i, "SUBMITTED", null));
        rows.add(app(3, 10, 40, "INTERVIEWING", null));
        book(rows, List.of(placement(1, 10, 3), placement(2, 11, 5), placement(2, 11, 45)));

        View v = service.view(me, null);
        // 10 submissions, interviews = INTERVIEWING(2) + OFFER(2) + HIRED(1) = 5, offers = OFFER(2) + HIRED(1) = 3
        assertThat(kpi(v, "interviewRate").value()).isEqualTo(50.0);
        assertThat(kpi(v, "offerRate").value()).isEqualTo(30.0);
        // previous: 1 of 5 = 20% -> +150%
        assertThat(kpi(v, "interviewRate").deltaPct()).isEqualTo(150.0);
        assertThat(kpi(v, "offerRate").deltaPct()).isNull(); // previous offer rate is 0: nothing to compare
        assertThat(kpi(v, "placements").value()).isEqualTo(2.0);
        assertThat(kpi(v, "placements").deltaPct()).isEqualTo(100.0);
        assertThat(kpi(v, "interviewRate").sparkline()).hasSize(8);
        // active = every row not CLOSED: 4 + 2 + 2 + 4 + 1 = 13
        assertThat(kpi(v, "activeSubmissions").value()).isEqualTo(13.0);
        assertThat(kpi(v, "activeSubmissions").sparkline()).hasSize(8);
    }

    @Test
    void theFunnelCountsReachNotJustTheCurrentStageAndDrawsPercentsOfSubmissions() {
        TalentApplication closedAfterInterview = app(1, 10, 5, "CLOSED", "REJECTED");
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setApplicationId(closedAfterInterview.getId());
        e.setToStage("INTERVIEWING");
        e.setOccurredAt(NOW.minusSeconds(86400L * 3));
        e.setId(1L);
        book(List.of(closedAfterInterview, app(1, 10, 6, "SUBMITTED", null), app(2, 10, 7, "OFFER", null), app(2, 10, 8, "UNDER_REVIEW", null)), List.of(placement(2, 10, 3)));
        when(events.findByOrgIdAndApplicationIdIn(eq(ORG), anyCollection())).thenReturn(List.of(e));
        View v = service.view(me, null);
        assertThat(v.funnel().period()).isEqualTo("3m");
        assertThat(v.funnel().total()).isEqualTo(4);
        assertThat(v.funnel().stages()).extracting("key").containsExactly("submissions", "interviews", "offers", "placements");
        assertThat(v.funnel().stages()).extracting("count").containsExactly(4L, 2L, 1L, 1L);
        assertThat(v.funnel().stages()).extracting("pct").containsExactly(100, 50, 25, 25);
    }

    @Test
    void thePeriodSelectsReachBackAndTheWeeklyChartHonoursItsLength() {
        book(List.of(app(1, 10, 3, "SUBMITTED", null), app(1, 10, 60, "SUBMITTED", null), app(1, 10, 150, "SUBMITTED", null)), List.of());
        assertThat(service.view(me, new Query(null, null, "1m", null, null, null)).funnel().total()).isEqualTo(1);
        assertThat(service.view(me, new Query(null, null, "3m", null, null, null)).funnel().total()).isEqualTo(2);
        assertThat(service.view(me, new Query(null, null, "6m", null, null, null)).funnel().total()).isEqualTo(3);
        assertThat(service.view(me, new Query(null, null, "junk", null, null, null)).funnel().period()).isEqualTo("3m");
        View twelve = service.view(me, new Query("12w", null, null, null, null, null));
        assertThat(twelve.weekly().weeks()).hasSize(12);
        assertThat(twelve.weekly().period()).isEqualTo("12w");
        // weeks run Monday to Sunday and the last one holds today
        var last = twelve.weekly().weeks().get(11);
        assertThat(last.start()).isEqualTo(LocalDate.of(2026, 10, 12));
        assertThat(last.end()).isEqualTo(LocalDate.of(2026, 10, 18));
        assertThat(service.view(me, new Query("4w", null, null, null, null, null)).weekly().weeks()).hasSize(4);
    }

    @Test
    void theTrendIsRunningTotalsEndingAtTheFunnelTotals() {
        book(List.of(app(1, 10, 3, "OFFER", null), app(1, 10, 20, "INTERVIEWING", null), app(1, 10, 50, "SUBMITTED", null)), List.of());
        View v = service.view(me, null);
        var pts = v.trend().points();
        assertThat(pts).isNotEmpty();
        var end = pts.get(pts.size() - 1);
        assertThat(end.date()).isEqualTo(TODAY);
        assertThat(end.submissions()).isEqualTo(v.funnel().stages().get(0).count());
        assertThat(end.interviews()).isEqualTo(v.funnel().stages().get(1).count());
        assertThat(end.offers()).isEqualTo(v.funnel().stages().get(2).count());
        for (int i = 1; i < pts.size(); i++) assertThat(pts.get(i).submissions()).isGreaterThanOrEqualTo(pts.get(i - 1).submissions());
    }

    // ---- streams, top, readiness ---------------------------------------------------------------------------------------------------

    @Test
    void streamsArePerClientWithTheOfferRateChipRelativeToTheOverallRate() {
        List<TalentApplication> rows = new ArrayList<>();
        for (int i = 0; i < 4; i++) rows.add(app(1, 10, 2 + i, i < 2 ? "OFFER" : "SUBMITTED", null)); // TechCorp 4 subs, 2 offers = 50%
        for (int i = 0; i < 6; i++) rows.add(app(2, 11, 2 + i, i < 1 ? "OFFER" : "SUBMITTED", null)); // Global Bank 6 subs, 1 offer = 17%
        book(rows, List.of(placement(1, 10, 4)));
        View v = service.view(me, null);
        assertThat(v.streams().rows()).extracting(StreamRow::client).containsExactly("Global Bank", "TechCorp"); // most submissions first
        StreamRow tech = v.streams().rows().get(1);
        assertThat(tech.submissions()).isEqualTo(4);
        assertThat(tech.offers()).isEqualTo(2);
        assertThat(tech.placements()).isEqualTo(1);
        assertThat(tech.offerRatePct()).isEqualTo(50.0);
        assertThat(tech.good()).isTrue();
        assertThat(v.streams().rows().get(0).good()).isFalse(); // 17% < the overall 30%
        assertThat(v.actions()).extracting("key").contains("offerRate");
    }

    @Test
    void topConsultantsRankByPlacementsThenOffersAndCarryMatchRateTrendAndLastActivity() {
        List<TalentApplication> rows = new ArrayList<>();
        for (int i = 0; i < 3; i++) rows.add(app(1, 10, 3 + i, "OFFER", null));
        for (int i = 0; i < 6; i++) rows.add(app(2, 10, 3 + i, "SUBMITTED", null));
        rows.add(app(3, 10, 4, "OFFER", null));
        book(rows, List.of(placement(3, 10, 2)));
        when(matches.averageScoreByConsultant(eq(ORG), anyCollection())).thenReturn(java.util.Collections.singletonList(new Object[] { 3L, 86.4 }));
        View v = service.view(me, null);
        assertThat(v.top()).extracting("name").containsExactly("Michael Park", "Alex Morgan", "Priya Sharma");
        assertThat(v.top()).extracting("rank").containsExactly(1, 2, 3);
        var first = v.top().get(0);
        assertThat(first.placements()).isEqualTo(1);
        assertThat(first.matchRatePct()).isEqualTo(86);
        assertThat(first.trend()).hasSize(8);
        assertThat(first.lastActivityAt()).isNotNull();
        assertThat(v.top().get(1).matchRatePct()).isNull();
    }

    @Test
    void readinessBucketsFollowAvailabilityResumeAndCompleteness() {
        assertThat(MktPerformanceService.bucketOf("AVAILABLE_NOW", "UP_TO_DATE", 90)).isEqualTo("ready");
        assertThat(MktPerformanceService.bucketOf("AVAILABLE_NOW", "UP_TO_DATE", 60)).isEqualTo("progress");
        assertThat(MktPerformanceService.bucketOf("AVAILABLE_NOW", "PENDING_APPROVAL", 90)).isEqualTo("progress");
        assertThat(MktPerformanceService.bucketOf("SOON", "UP_TO_DATE", 90)).isEqualTo("progress");
        assertThat(MktPerformanceService.bucketOf("IN_INTERVIEW", "UP_TO_DATE", 90)).isEqualTo("progress");
        assertThat(MktPerformanceService.bucketOf("AVAILABLE_NOW", "NEEDS_UPDATE", 90)).isEqualTo("attention");
        assertThat(MktPerformanceService.bucketOf("AVAILABLE_NOW", "UP_TO_DATE", 40)).isEqualTo("attention");
        assertThat(MktPerformanceService.bucketOf("ON_PROJECT", "NEEDS_UPDATE", 10)).isEqualTo("inactive");
        assertThat(MktPerformanceService.bucketOf("UNAVAILABLE", "UP_TO_DATE", 90)).isEqualTo("inactive");
    }

    @Test
    void theReadinessDonutIsDrawnFromTheTalentRowsAndNeedsConsultantsViewOtherwiseItIsEmpty() {
        MktTalentDtos.Row ready = row(1, "AVAILABLE_NOW", "UP_TO_DATE");
        MktTalentDtos.Row attention = row(2, "AVAILABLE_NOW", "NEEDS_UPDATE");
        MktTalentDtos.Row inactive = row(3, "ON_PROJECT", "UP_TO_DATE");
        MktTalentDtos.Response r = new MktTalentDtos.Response(
            List.of(new MktTalentDtos.Kpi("assigned", 3, 12.0, List.of(1L, 2L, 3L))), new MktTalentDtos.Counts(3, 0, 0, 0, 0), new MktTalentDtos.Facets(List.of(), List.of()),
            List.of(ready, attention, inactive), 3, 0, 100, null, List.of(), false
        );
        when(talent.list(eq(me), any())).thenReturn(r);
        when(consultants.findByOrgIdAndIdIn(eq(ORG), anyCollection())).thenReturn(List.of(person(1, "A"), person(2, "B"), person(3, "C")));
        View v = service.view(me, null);
        assertThat(kpi(v, "assignedConsultants").value()).isEqualTo(3.0);
        assertThat(kpi(v, "assignedConsultants").deltaPct()).isEqualTo(12.0);
        assertThat(v.readiness().total()).isEqualTo(3);
        assertThat(v.readiness().buckets()).extracting("key").containsExactly("ready", "progress", "attention", "inactive");
        assertThat(v.readiness().buckets()).extracting("count").containsExactly(1L, 0L, 1L, 1L);
        assertThat(v.readiness().buckets()).extracting("pct").containsExactly(33, 0, 33, 33);
        assertThat(v.readiness().buckets().get(0).label()).isEqualTo("Ready to Submit");
    }

    private static MktTalentDtos.Row row(long id, String availability, String resume) {
        return new MktTalentDtos.Row(id, "C" + id, null, "Dev", "Java", 5, "NYC", new MktTalentDtos.Availability(availability, "x", "green"), new MktTalentDtos.ResumeStatus(resume, "x"), 1, 0);
    }

    // ---- benchmarks, goals, writes ---------------------------------------------------------------------------------------------------

    @Test
    void benchmarksCompareTheRateWithTheOrgsIndustryFigures() {
        book(List.of(app(1, 10, 3, "OFFER", null), app(1, 10, 4, "SUBMITTED", null), app(1, 10, 5, "SUBMITTED", null), app(1, 10, 6, "INTERVIEWING", null)), List.of(placement(1, 10, 2)));
        MktBenchmark b = new MktBenchmark();
        b.setMetric(MktBenchmark.INTERVIEW_RATE);
        b.setIndustryValue(new BigDecimal("25.00"));
        when(benchmarks.findByOrgId(ORG)).thenReturn(List.of(b));
        View v = service.view(me, null);
        var rows = v.benchmarks().rows();
        assertThat(rows).extracting("key").containsExactly("interviewRate", "offerRate", "placementRate");
        assertThat(rows.get(0).value()).isEqualTo(50.0);
        assertThat(rows.get(0).industry()).isEqualTo(25.0);
        assertThat(rows.get(1).value()).isEqualTo(25.0);
        assertThat(rows.get(1).industry()).isNull();
        assertThat(rows.get(2).value()).isEqualTo(25.0);
        assertThat(rows.get(0).deltaPct()).isNull(); // nothing in the month before
    }

    @Test
    void goalsUseTheMarketersOwnTargetFirstThenTheOrgDefaultAndTheActualsOfTheMonth() {
        book(List.of(app(1, 10, 3, "OFFER", null), app(1, 10, 4, "SUBMITTED", null)), List.of(placement(1, 10, 2)));
        MktGoal def = goal(null, MktGoal.SUBMISSIONS, 200);
        MktGoal defInt = goal(null, MktGoal.INTERVIEWS, 60);
        MktGoal own = goal(7L, MktGoal.SUBMISSIONS, 4);
        when(goals.findDefaults(ORG)).thenReturn(List.of(def, defInt));
        when(goals.findByOrgIdAndOwnerMemberId(ORG, 7L)).thenReturn(List.of(own));
        View v = service.view(me, null);
        var rows = v.goals().rows();
        assertThat(rows).extracting("key").containsExactly("submissions", "interviews", "offers", "placements");
        assertThat(rows.get(0).actual()).isEqualTo(2);
        assertThat(rows.get(0).target()).isEqualTo(4);
        assertThat(rows.get(0).pct()).isEqualTo(50);
        assertThat(rows.get(1).target()).isEqualTo(60);
        assertThat(rows.get(1).pct()).isEqualTo(2);
        assertThat(rows.get(2).target()).isNull();
        assertThat(rows.get(3).actual()).isEqualTo(1);
        assertThat(v.goals().canEdit()).isTrue();
    }

    private static MktGoal goal(Long owner, String metric, int target) {
        MktGoal g = new MktGoal();
        g.setOwnerMemberId(owner);
        g.setMetric(metric);
        g.setPeriod(MktGoal.MONTH);
        g.setTarget(target);
        return g;
    }

    @Test
    void settingGoalsCreatesTheCallersOwnRowsUpdatesExistingOnesAndAudits() {
        MktGoal existing = goal(7L, MktGoal.OFFERS, 10);
        when(goals.findByOrgIdAndOwnerMemberId(ORG, 7L)).thenReturn(List.of(existing));
        service.updateGoals(me, new GoalsRequest(120, null, 12, null));
        ArgumentCaptor<MktGoal> saved = ArgumentCaptor.forClass(MktGoal.class);
        verify(goals, org.mockito.Mockito.times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).extracting(MktGoal::getMetric).containsExactly(MktGoal.SUBMISSIONS, MktGoal.OFFERS);
        assertThat(saved.getAllValues()).extracting(MktGoal::getTarget).containsExactly(120, 12);
        assertThat(saved.getAllValues()).allMatch(g -> Long.valueOf(7L).equals(g.getOwnerMemberId()));
        assertThat(saved.getAllValues().get(1)).isSameAs(existing);
        verify(audit).record(eq(me), eq("MARKETER_GOALS_UPDATE"), eq("PERFORMANCE_GOALS"), any(), eq("7"), eq("metrics=SUBMISSIONS,OFFERS"));
    }

    @Test
    void goalsMustBeNonNegativeAndGivenAtAllAndNothingIsSavedOtherwise() {
        assertThatThrownBy(() -> service.updateGoals(me, new GoalsRequest(null, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.updateGoals(me, null)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.updateGoals(me, new GoalsRequest(-1, null, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.updateGoals(me, new GoalsRequest(null, 100_001, null, null))).isInstanceOf(OrgException.class);
        verify(goals, never()).save(any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    // ---- recommended actions ----------------------------------------------------------------------------------------------------------

    @Test
    void recommendedActionsPointAtTheRightPagesAndSkipWhatHasNothingToDo() {
        TalentApplication fresh = app(1, 10, 2, "INTERVIEWING", null);
        TalentApplication stale = app(2, 10, 40, "SUBMITTED", null); // consultant 2 has been quiet for 40 days
        book(List.of(fresh, stale), List.of());
        when(matches.countSuggestedByConsultant(eq(ORG), anyCollection())).thenReturn(java.util.Collections.singletonList(new Object[] { 1L, 15L }));
        MktTalentDtos.Response r = new MktTalentDtos.Response(List.of(), new MktTalentDtos.Counts(2, 0, 0, 0, 0), new MktTalentDtos.Facets(List.of(), List.of()), List.of(row(1, "AVAILABLE_NOW", "UP_TO_DATE"), row(2, "AVAILABLE_NOW", "UP_TO_DATE")), 2, 0, 100, null, List.of(), false);
        when(talent.list(eq(me), any())).thenReturn(r);
        View v = service.view(me, null);
        assertThat(v.actions()).extracting("page").contains("followups", "interviews", "matches");
        var quiet = v.actions().stream().filter(a -> "quiet".equals(a.key())).findFirst().orElseThrow();
        assertThat(quiet.text()).isEqualTo("Follow up with 1 consultant");
        assertThat(quiet.detail()).isEqualTo("with no recent activity");
        assertThat(v.actions().stream().filter(a -> "matches".equals(a.key())).findFirst().orElseThrow().text()).isEqualTo("Explore 15 new job matches");
    }

    // ---- follow-up completion ---------------------------------------------------------------------------------------------------------

    @Test
    void followUpCompletionIsCompletedOverDueInTheWindow() {
        when(followups.countDue(eq(ORG), anyBoolean(), anyCollection(), eq(NOW.minusSeconds(30 * 86400L)), eq(NOW))).thenReturn(10L);
        when(followups.countDueAndCompleted(eq(ORG), anyBoolean(), anyCollection(), eq(NOW.minusSeconds(30 * 86400L)), eq(NOW))).thenReturn(8L);
        when(followups.countDue(eq(ORG), anyBoolean(), anyCollection(), eq(NOW.minusSeconds(60 * 86400L)), eq(NOW.minusSeconds(30 * 86400L)))).thenReturn(10L);
        when(followups.countDueAndCompleted(eq(ORG), anyBoolean(), anyCollection(), eq(NOW.minusSeconds(60 * 86400L)), eq(NOW.minusSeconds(30 * 86400L)))).thenReturn(5L);
        Kpi k = kpi(service.view(me, null), "followupCompletion");
        assertThat(k.value()).isEqualTo(80.0);
        assertThat(k.deltaPct()).isEqualTo(60.0);
        assertThat(k.sparkline()).hasSize(8);
    }
}
