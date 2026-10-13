package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktEventRow;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRow;
import com.dossier.api.repository.ent.mkt.MktResumeFact;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.ActionResult;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.BulkResult;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.Item;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.Kpi;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesDTO.ListResponse;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunitiesService.Query;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

/** The Opportunities service without a database: scope filtering, KPI math, every filter, the E1 rules (requests only, never the consultant's answer). */
class MktOpportunitiesServiceTest {

    static final Long ORG = 7L;
    static final Long ME = 70L;
    static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    MktScope scope = mock(MktScope.class);
    MktOpportunityRepository repo = mock(MktOpportunityRepository.class);
    MktOpportunityEventRepository events = mock(MktOpportunityEventRepository.class);
    RequirementMatchRepository matches = mock(RequirementMatchRepository.class);
    ConsultantProfileRepository consultants = mock(ConsultantProfileRepository.class);
    ClientRequirementRepository requirements = mock(ClientRequirementRepository.class);
    ClientAccountRepository clients = mock(ClientAccountRepository.class);
    ConsultantSkillRepository consultantSkills = mock(ConsultantSkillRepository.class);
    RequirementSkillRepository requirementSkills = mock(RequirementSkillRepository.class);
    OrgMemberRepository members = mock(OrgMemberRepository.class);
    UserRepository users = mock(UserRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktOpportunitiesService service;
    OrgMembership me = new OrgMembership(ORG, ME, 700L, "marketer", OrgRole.MARKETER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    List<MktOpportunityRow> rows = new ArrayList<>();
    List<MktResumeFact> resumes = new ArrayList<>();
    List<MktOpportunityEvent> saved = new ArrayList<>();
    AtomicLong ids = new AtomicLong(1000);

    @BeforeEach
    void wire() {
        service = new MktOpportunitiesService(scope, repo, events, matches, consultants, requirements, clients, consultantSkills, requirementSkills, members, users, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenReturn(new MktScope.View(ORG, ME, true, Set.of()));
        doRequireLikeScope();
        lenient().when(repo.findRows(ORG)).thenAnswer(i -> List.copyOf(rows));
        lenient().when(repo.findRow(eq(ORG), anyLong())).thenAnswer(i -> rows.stream().filter(r -> r.matchId().equals(i.getArgument(1))).findFirst());
        lenient().when(repo.findResumeFacts(ORG)).thenAnswer(i -> List.copyOf(resumes));
        lenient().when(repo.findByOrgIdAndMatchId(eq(ORG), anyLong())).thenReturn(Optional.empty());
        lenient().when(repo.save(any(MktOpportunity.class))).thenAnswer(i -> {
            MktOpportunity o = i.getArgument(0);
            if (o.getId() == null) o.setId(ids.incrementAndGet());
            return o;
        });
        lenient().when(events.save(any(MktOpportunityEvent.class))).thenAnswer(i -> {
            saved.add(i.getArgument(0));
            return i.getArgument(0);
        });
        lenient().when(events.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(eq(ORG), anyLong())).thenReturn(List.of());
        lenient().when(events.recent(eq(ORG), any(Pageable.class))).thenReturn(List.of());
        lenient().when(members.findByOrgIdAndIdIn(eq(ORG), any())).thenReturn(List.of());
        lenient().when(matches.findByOrgIdAndId(eq(ORG), anyLong())).thenAnswer(i -> rows.stream().filter(r -> r.matchId().equals(i.getArgument(1))).findFirst().map(this::match));
        lenient().when(matches.save(any(RequirementMatch.class))).thenAnswer(i -> i.getArgument(0));
    }

    /** MktScope is a mock: give `require` its real behaviour so a consultant outside the view is a 404. */
    private void doRequireLikeScope() {
        org.mockito.Mockito.doAnswer(i -> {
            MktScope.View v = i.getArgument(0);
            if (!v.sees(i.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), any());
    }

    private RequirementMatch match(MktOpportunityRow r) {
        RequirementMatch m = new RequirementMatch();
        m.setId(r.matchId());
        m.setOrgId(ORG);
        m.setConsultantId(r.consultantId());
        m.setRequirementId(r.requirementId());
        m.setScore(r.score());
        m.setStatus(r.matchStatus());
        return m;
    }

    static final Duration DAY = Duration.ofDays(1);

    /** matchStatus ASSIGNED/SUGGESTED, requirement OPEN, last activity {@code idleDays} ago, created {@code ageDays} ago. */
    MktOpportunityRow row(long matchId, long consultantId, String name, long clientId, String client, int score, String matchStatus, String interest, int idleDays, int ageDays) {
        Instant updated = NOW.minus(DAY.multipliedBy(idleDays));
        return new MktOpportunityRow(
            matchId, consultantId, name, 500 + matchId, "Role " + matchId, "Austin, TX", "HYBRID", "OPEN", clientId, client, score, "fits", matchStatus,
            "ASSIGNED".equals(matchStatus) ? updated : null, NOW.minus(DAY.multipliedBy(ageDays)),
            interest == null ? null : 900 + matchId, interest, 9L, NOW.plus(DAY), interest == null ? null : updated, null, interest == null ? null : updated, 9L
        );
    }

    MktOpportunityRow add(MktOpportunityRow r) {
        rows.add(r);
        return r;
    }

    void approvedResume(long consultantId) {
        resumes.add(new MktResumeFact(consultantId, "APPROVED", true, NOW.minus(DAY.multipliedBy(10))));
    }

    ListResponse list(Query q) {
        return service.list(me, q);
    }

    Query q(String text, Long consultant, Long client, String interest, Integer minScore, int days, boolean stale, boolean ready) {
        return new Query(text, consultant, client, interest, minScore, days, stale, ready, "recent", true, 0, 50, 30);
    }

    // ---- empty organization ----

    @Test
    void anEmptyOrganizationDrawsEmptyStatesNotNumbers() {
        ListResponse r = list(Query.defaults());
        assertThat(r.items()).isEmpty();
        assertThat(r.total()).isZero();
        assertThat(r.topMatches()).isEmpty();
        assertThat(r.responses().total()).isZero();
        assertThat(r.activity()).isEmpty();
        assertThat(r.kpis()).hasSize(4).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).as("no previous value, no delta").isNull();
            assertThat(k.sparkline()).hasSize(8).containsOnly(0L);
        });
    }

    // ---- KPI math ----

    @Test
    void kpisAreCountedFromTheRowsAndDeltasNeedAPreviousValue() {
        approvedResume(1);
        approvedResume(2);
        // open: 5 rows; two were created more than 30 days ago
        add(row(1, 1, "Alex", 1, "TechCorp", 92, "ASSIGNED", "VERY_INTERESTED", 1, 60));
        add(row(2, 1, "Alex", 2, "Global", 88, "SUGGESTED", "INTERESTED", 2, 5));   // ready (suggested, resume ok)
        add(row(3, 2, "Priya", 1, "TechCorp", 85, "ASSIGNED", "NO_RESPONSE", 20, 45)); // awaiting + stale, old
        add(row(4, 2, "Priya", 3, "Cloud", 70, "SUGGESTED", "NOT_INTERESTED", 3, 4)); // not ready: not interested
        add(row(5, 3, "Sam", 4, "Next", 74, "SUGGESTED", "OPEN", 1, 3));              // not ready: no approved resume
        Kpi open = kpi(list(Query.defaults()), "open");
        assertThat(open.value()).isEqualTo(5);
        assertThat(open.deltaPct()).as("5 now, 2 a month ago").isEqualTo(150.0);
        assertThat(kpi(list(Query.defaults()), "ready").value()).isEqualTo(1);
        assertThat(kpi(list(Query.defaults()), "awaiting").value()).isEqualTo(1);
        Kpi stale = kpi(list(Query.defaults()), "stale");
        assertThat(stale.value()).isEqualTo(1);
        assertThat(stale.deltaPct()).as("activity is not versioned: no honest delta").isNull();
        assertThat(open.sparkline().stream().mapToLong(Long::longValue).sum()).as("the one created 60 days ago is older than the 8 weeks drawn").isEqualTo(4);
    }

    Kpi kpi(ListResponse r, String key) {
        return r.kpis().stream().filter(k -> k.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void deltaPctRoundsToOneDecimalAndIsNullWithoutAPreviousValue() {
        assertThat(MktOpportunitiesService.deltaPct(86, 77)).isEqualTo(11.7);
        assertThat(MktOpportunitiesService.deltaPct(3, 0)).isNull();
        assertThat(MktOpportunitiesService.deltaPct(0, 4)).isEqualTo(-100.0);
    }

    @Test
    void aClosedJobIsNotAnOpenOpportunity() {
        approvedResume(1);
        MktOpportunityRow open = add(row(1, 1, "Alex", 1, "TechCorp", 92, "ASSIGNED", "INTERESTED", 1, 5));
        MktOpportunityRow closed = row(2, 1, "Alex", 2, "Global", 88, "ASSIGNED", "INTERESTED", 1, 5);
        rows.add(new MktOpportunityRow(closed.matchId(), closed.consultantId(), closed.consultantName(), closed.requirementId(), closed.jobTitle(), closed.location(), closed.workMode(), "FILLED",
            closed.clientId(), closed.clientName(), closed.score(), closed.reason(), closed.matchStatus(), closed.assignedAt(), closed.createdAt(), closed.oppId(), closed.interest(), closed.ownerMemberId(),
            closed.nextActionAt(), closed.lastResponseAt(), closed.interestRequestedAt(), closed.oppUpdatedAt(), closed.assignedMarketerId()));
        ListResponse r = list(Query.defaults());
        assertThat(r.items()).extracting(Item::id).containsExactly(open.matchId());
        assertThatThrownBy(() -> service.detail(me, 2L)).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- row rules ----

    @Test
    void theRowsButtonFollowsInterestResumeAndStatus() {
        approvedResume(1);
        approvedResume(2);
        approvedResume(4);
        add(row(1, 1, "A", 1, "C1", 90, "ASSIGNED", "VERY_INTERESTED", 1, 5)); // REVIEW
        add(row(2, 1, "A", 2, "C2", 90, "SUGGESTED", "INTERESTED", 1, 5));     // ASSIGN
        add(row(3, 2, "B", 3, "C3", 90, "ASSIGNED", "NOT_INTERESTED", 1, 5));  // COMPARE
        add(row(4, 3, "C", 4, "C4", 90, "ASSIGNED", "OPEN", 1, 5));            // FOLLOW_UP (no resume)
        add(row(5, 4, "D", 5, "C5", 90, "ASSIGNED", "NO_RESPONSE", 1, 5));     // FOLLOW_UP (resume ok)
        ListResponse r = list(Query.defaults());
        assertThat(item(r, 1).action()).isEqualTo("REVIEW");
        assertThat(item(r, 2).action()).isEqualTo("ASSIGN");
        assertThat(item(r, 3).action()).isEqualTo("COMPARE");
        assertThat(item(r, 4).action()).isEqualTo("FOLLOW_UP");
        assertThat(item(r, 4).resumeStatus()).isEqualTo("NEEDS_UPDATE");
        assertThat(item(r, 5).action()).isEqualTo("FOLLOW_UP");
        assertThat(item(r, 1).resumeStatus()).isEqualTo("UPDATED");
    }

    Item item(ListResponse r, long id) {
        return r.items().stream().filter(i -> i.id() == id).findFirst().orElseThrow();
    }

    @Test
    void aStaleOrUnapprovedResumeNeedsAnUpdate() {
        resumes.add(new MktResumeFact(1L, "APPROVED", true, NOW.minus(DAY.multipliedBy(200))));  // too old
        resumes.add(new MktResumeFact(2L, "PENDING", true, NOW.minus(DAY.multipliedBy(2))));     // not approved
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "INTERESTED", 1, 5));
        add(row(2, 2, "B", 1, "C", 90, "ASSIGNED", "INTERESTED", 1, 5));
        add(row(3, 3, "C", 1, "C", 90, "ASSIGNED", "INTERESTED", 1, 5)); // no resume at all
        ListResponse r = list(Query.defaults());
        assertThat(r.items()).allSatisfy(i -> assertThat(i.resumeStatus()).isEqualTo("NEEDS_UPDATE"));
    }

    @Test
    void anOpportunityWithoutMarketingStateIsNoResponseOwnedByTheAssignedMarketer() {
        approvedResume(1);
        add(row(1, 1, "A", 1, "C", 90, "SUGGESTED", null, 1, 5));
        Item i = list(Query.defaults()).items().get(0);
        assertThat(i.interest()).isEqualTo("NO_RESPONSE");
        assertThat(i.owner().id()).isEqualTo(9L);
    }

    // ---- filters ----

    @Test
    void everyFilterNarrowsTheList() {
        approvedResume(1);
        approvedResume(2);
        add(row(1, 1, "Alex Morgan", 1, "TechCorp", 92, "ASSIGNED", "VERY_INTERESTED", 1, 5));
        add(row(2, 2, "Priya Sharma", 2, "Global", 74, "SUGGESTED", "OPEN", 3, 5));
        add(row(3, 2, "Priya Sharma", 1, "TechCorp", 85, "ASSIGNED", "NO_RESPONSE", 20, 40));
        add(row(4, 1, "Alex Morgan", 3, "Cloud", 80, "ASSIGNED", "INTERESTED", 45, 90));
        assertThat(ids(list(q(null, null, null, null, null, 0, false, false)))).containsExactlyInAnyOrder(1L, 2L, 3L, 4L);
        assertThat(ids(list(q("priya", null, null, null, null, 0, false, false)))).containsExactlyInAnyOrder(2L, 3L);
        assertThat(ids(list(q("role 4", null, null, null, null, 0, false, false)))).containsExactly(4L);
        assertThat(ids(list(q(null, 1L, null, null, null, 0, false, false)))).containsExactlyInAnyOrder(1L, 4L);
        assertThat(ids(list(q(null, null, 1L, null, null, 0, false, false)))).containsExactlyInAnyOrder(1L, 3L);
        assertThat(ids(list(q(null, null, null, "OPEN", null, 0, false, false)))).containsExactly(2L);
        assertThat(ids(list(q(null, null, null, null, 85, 0, false, false)))).containsExactlyInAnyOrder(1L, 3L);
        assertThat(ids(list(q(null, null, null, null, null, 30, false, false)))).as("last 30 days of activity").containsExactlyInAnyOrder(1L, 2L, 3L);
        assertThat(ids(list(q(null, null, null, null, null, 7, false, false)))).containsExactlyInAnyOrder(1L, 2L);
        assertThat(ids(list(q(null, null, null, null, null, 30, true, false)))).as("stale ignores the period").containsExactlyInAnyOrder(3L, 4L);
        assertThat(ids(list(q(null, null, null, null, null, 30, false, true)))).as("ready: suggested + resume ok").containsExactly(2L);
    }

    List<Long> ids(ListResponse r) {
        return r.items().stream().map(Item::id).toList();
    }

    @Test
    void anUnknownInterestOrSortIsA400() {
        assertThatThrownBy(() -> list(q(null, null, null, "SO_SO", null, 0, false, false))).isInstanceOf(OrgException.class).hasMessageContaining("interest");
        assertThatThrownBy(() -> list(new Query(null, null, null, null, null, 0, false, false, "colour", true, 0, 8, 30))).isInstanceOf(OrgException.class);
    }

    @Test
    void pagingAndSortingAndTheSizeCap() {
        for (int i = 1; i <= 12; i++) add(row(i, 1, "A", 1, "C", 60 + i, "ASSIGNED", "OPEN", 1, 5));
        ListResponse first = list(new Query(null, null, null, null, null, 0, false, false, "score", true, 0, 5, 30));
        assertThat(first.total()).isEqualTo(12);
        assertThat(ids(first)).containsExactly(12L, 11L, 10L, 9L, 8L);
        assertThat(ids(list(new Query(null, null, null, null, null, 0, false, false, "score", true, 2, 5, 30)))).containsExactly(2L, 1L);
        assertThat(list(new Query(null, null, null, null, null, 0, false, false, "score", false, 0, 500, 30)).size()).as("size is capped").isEqualTo(100);
    }

    @Test
    void topMatchesAreOnePerJobBestFirstAndLimitedToFive() {
        for (int i = 1; i <= 7; i++) add(row(i, i, "P" + i, 1, "C", 70 + i, "ASSIGNED", "OPEN", 1, 5));
        rows.add(new MktOpportunityRow(99L, 99L, "Dup", 507L, "Role 7", "x", "x", "OPEN", 1L, "C", 60, "x", "SUGGESTED", null, NOW, null, null, null, null, null, null, null, null));
        List<Long> top = list(Query.defaults()).topMatches().stream().map(MktOpportunitiesDTO.TopMatch::id).toList();
        assertThat(top).containsExactly(7L, 6L, 5L, 4L, 3L);
    }

    @Test
    void responsesCountEveryInterestAndSumToTheTotal() {
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "VERY_INTERESTED", 1, 5));
        add(row(2, 2, "B", 1, "C", 90, "ASSIGNED", "VERY_INTERESTED", 1, 5));
        add(row(3, 3, "C", 1, "C", 90, "ASSIGNED", "NOT_INTERESTED", 1, 5));
        add(row(4, 4, "D", 1, "C", 90, "ASSIGNED", "NO_RESPONSE", 50, 60)); // outside the 30 day window
        MktOpportunitiesDTO.Responses r = list(Query.defaults()).responses();
        assertThat(r.total()).isEqualTo(3);
        assertThat(r.slices()).extracting(MktOpportunitiesDTO.Slice::key).containsExactly("VERY_INTERESTED", "INTERESTED", "OPEN", "NOT_INTERESTED", "NO_RESPONSE");
        assertThat(r.slices()).extracting(MktOpportunitiesDTO.Slice::count).containsExactly(2L, 0L, 0L, 1L, 0L);
        assertThat(list(new Query(null, null, null, null, null, 0, false, false, "recent", true, 0, 8, 0)).responses().total()).as("any time").isEqualTo(4);
    }

    // ---- scope: an unassigned consultant never appears and is a 404 ----

    @Test
    void anAssignedMarketerOnlySeesTheirConsultantsAndOthersAre404() {
        when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenReturn(new MktScope.View(ORG, ME, false, Set.of(1L)));
        approvedResume(1);
        approvedResume(2);
        add(row(1, 1, "Mine", 1, "C", 90, "SUGGESTED", "OPEN", 1, 5));
        add(row(2, 2, "Not mine", 2, "D", 99, "SUGGESTED", "OPEN", 1, 5));
        ListResponse r = list(Query.defaults());
        assertThat(ids(r)).containsExactly(1L);
        assertThat(r.total()).isEqualTo(1);
        assertThat(kpi(r, "open").value()).isEqualTo(1);
        assertThat(r.topMatches()).extracting(MktOpportunitiesDTO.TopMatch::id).containsExactly(1L);
        assertThat(r.filters().consultants()).extracting(MktOpportunitiesDTO.Option::name).containsExactly("Mine");
        assertThat(r.responses().total()).isEqualTo(1);

        assertThatThrownBy(() -> list(q(null, 2L, null, null, null, 0, false, false))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.detail(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.assign(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.requestFromConsultant(me, 2L, "INTEREST")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.review(me, 2L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.setNextAction(me, 2L, NOW.plus(DAY))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.create(me, 2L, 502L)).isInstanceOf(OrgNotFoundException.class);
        assertThat(service.bulkAssign(me, List.of(1L, 2L)).skipped()).extracting(MktOpportunitiesDTO.Skipped::id).as("a foreign id is just skipped, never assigned").contains(2L);
        verify(matches, never()).save(argWithConsultant(2L));
    }

    private RequirementMatch argWithConsultant(long consultantId) {
        return org.mockito.ArgumentMatchers.argThat(m -> m != null && m.getConsultantId() == consultantId);
    }

    @Test
    void aMarketerWithNoConsultantsSeesNothing() {
        when(scope.resolve(any(), eq(MktOpportunitiesService.PERMISSION))).thenReturn(new MktScope.View(ORG, ME, false, Set.of()));
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "OPEN", 1, 5));
        ListResponse r = list(Query.defaults());
        assertThat(r.items()).isEmpty();
        assertThat(r.activity()).isEmpty();
    }

    // ---- writes (E1) ----

    @Test
    void assigningNeedsAnApprovedResumeThenAsksTheConsultantAndNeverAnswersForThem() {
        add(row(1, 1, "Alex", 1, "TechCorp", 92, "SUGGESTED", null, 1, 5));
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOf(OrgException.class).extracting(e -> ((OrgException) e).getCode()).isEqualTo("RESUME_NOT_APPROVED");
        verify(matches, never()).save(any());

        approvedResume(1);
        ArgumentCaptor<MktOpportunity> opp = ArgumentCaptor.forClass(MktOpportunity.class);
        ActionResult r = service.assign(me, 1L);
        assertThat(r.changed()).isTrue();
        ArgumentCaptor<RequirementMatch> m = ArgumentCaptor.forClass(RequirementMatch.class);
        verify(matches).save(m.capture());
        assertThat(m.getValue().getStatus()).isEqualTo("ASSIGNED");
        assertThat(m.getValue().getAssignedByMemberId()).isEqualTo(ME);
        assertThat(m.getValue().getAssignedAt()).isEqualTo(NOW);
        verify(repo, org.mockito.Mockito.atLeastOnce()).save(opp.capture());
        MktOpportunity o = opp.getAllValues().get(opp.getAllValues().size() - 1);
        assertThat(o.getInterest()).as("E1: a marketer never answers for the consultant").isEqualTo("NO_RESPONSE");
        assertThat(o.getInterestRequestedAt()).isEqualTo(NOW);
        assertThat(o.getLastResponseAt()).isNull();
        assertThat(saved).extracting(MktOpportunityEvent::getKind).containsExactly("ASSIGNED", "INTEREST_REQUESTED");
        verify(audit).record(any(OrgMembership.class), eq("MARKETER_OPPORTUNITY_ASSIGN"), any(), any(), any(), any());
    }

    @Test
    void anAlreadyAssignedOpportunityIsA409() {
        approvedResume(1);
        add(row(1, 1, "Alex", 1, "TechCorp", 92, "ASSIGNED", "OPEN", 1, 5));
        assertThatThrownBy(() -> service.assign(me, 1L)).isInstanceOf(OrgException.class).extracting(e -> ((OrgException) e).getCode()).isEqualTo("ALREADY_ASSIGNED");
    }

    @Test
    void bulkAssignAssignsTheReadyOnesAndReportsTheRest() {
        approvedResume(1);
        add(row(1, 1, "A", 1, "C", 90, "SUGGESTED", "OPEN", 1, 5));
        add(row(2, 1, "A", 2, "C", 90, "ASSIGNED", "OPEN", 1, 5));
        add(row(3, 2, "B", 3, "C", 90, "SUGGESTED", "OPEN", 1, 5)); // no approved resume
        BulkResult r = service.bulkAssign(me, List.of(1L, 2L, 3L, 4L));
        assertThat(r.done()).isEqualTo(1);
        assertThat(r.skipped()).extracting(MktOpportunitiesDTO.Skipped::code).containsExactly("ALREADY_ASSIGNED", "RESUME_NOT_APPROVED", "NOT_FOUND");
        assertThatThrownBy(() -> service.bulkAssign(me, List.of())).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.bulkAssign(me, java.util.stream.LongStream.rangeClosed(1, 51).boxed().toList())).isInstanceOf(OrgException.class);
    }

    @Test
    void followUpRequestsInterestOrAResumeAndNeverChangesTheInterest() {
        approvedResume(1);
        add(row(1, 1, "Alex", 1, "TechCorp", 92, "ASSIGNED", "NO_RESPONSE", 1, 5));
        ActionResult r = service.requestFromConsultant(me, 1L, "interest");
        assertThat(r.message()).contains("Alex").contains("interest");
        assertThat(saved).extracting(MktOpportunityEvent::getKind).containsExactly("INTEREST_REQUESTED");
        ArgumentCaptor<MktOpportunity> opp = ArgumentCaptor.forClass(MktOpportunity.class);
        verify(repo, org.mockito.Mockito.atLeastOnce()).save(opp.capture());
        assertThat(opp.getValue().getInterest()).isEqualTo("NO_RESPONSE");
        assertThat(opp.getValue().getNextActionAt()).isEqualTo(NOW.plus(Duration.ofDays(3)));

        saved.clear();
        service.requestFromConsultant(me, 1L, "RESUME");
        assertThat(saved).extracting(MktOpportunityEvent::getKind).containsExactly("RESUME_REQUESTED");
    }

    @Test
    void interestCannotBeRequestedBeforeAssigningOrAfterTheConsultantAnswered() {
        add(row(1, 1, "A", 1, "C", 90, "SUGGESTED", "OPEN", 1, 5));
        add(row(2, 2, "B", 1, "C", 90, "ASSIGNED", "VERY_INTERESTED", 1, 5));
        assertThatThrownBy(() -> service.requestFromConsultant(me, 1L, "INTEREST")).extracting(e -> ((OrgException) e).getCode()).isEqualTo("NOT_ASSIGNED");
        assertThatThrownBy(() -> service.requestFromConsultant(me, 2L, "INTEREST")).extracting(e -> ((OrgException) e).getCode()).isEqualTo("ALREADY_ANSWERED");
        assertThatThrownBy(() -> service.requestFromConsultant(me, 2L, "SUBMIT")).isInstanceOf(OrgException.class);
        assertThat(saved).isEmpty();
    }

    @Test
    void theSameRequestWithinAnHourIsNotRecordedTwice() {
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "NO_RESPONSE", 1, 5));
        MktOpportunity existing = new MktOpportunity();
        existing.setId(901L);
        existing.setOrgId(ORG);
        existing.setMatchId(1L);
        when(repo.findByOrgIdAndMatchId(ORG, 1L)).thenReturn(Optional.of(existing));
        MktOpportunityEvent recent = new MktOpportunityEvent();
        recent.setKind("INTEREST_REQUESTED");
        recent.setOccurredAt(NOW.minus(Duration.ofMinutes(10)));
        when(events.findByOrgIdAndOpportunityIdOrderByOccurredAtDesc(ORG, 901L)).thenReturn(List.of(recent));
        ActionResult r = service.requestFromConsultant(me, 1L, "INTEREST");
        assertThat(r.changed()).isFalse();
        assertThat(saved).isEmpty();
    }

    @Test
    void notifyAsksOnlyThoseWhoHaveNotAnsweredAndWereNotAskedToday() {
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "NO_RESPONSE", 1, 5));  // asked? interestRequestedAt null -> ask
        add(row(2, 2, "B", 1, "C", 90, "ASSIGNED", "VERY_INTERESTED", 1, 5)); // answered
        add(row(3, 3, "C", 1, "C", 90, "SUGGESTED", "NO_RESPONSE", 1, 5));  // not assigned
        MktOpportunityRow asked = row(4, 4, "D", 1, "C", 90, "ASSIGNED", "OPEN", 1, 5);
        rows.add(new MktOpportunityRow(asked.matchId(), asked.consultantId(), asked.consultantName(), asked.requirementId(), asked.jobTitle(), asked.location(), asked.workMode(), "OPEN", asked.clientId(),
            asked.clientName(), asked.score(), asked.reason(), asked.matchStatus(), asked.assignedAt(), asked.createdAt(), asked.oppId(), asked.interest(), asked.ownerMemberId(), asked.nextActionAt(),
            asked.lastResponseAt(), NOW.minus(Duration.ofHours(2)), asked.oppUpdatedAt(), asked.assignedMarketerId()));
        BulkResult r = service.notifyAwaiting(me);
        assertThat(r.done()).isEqualTo(1);
        assertThat(r.skipped()).extracting(MktOpportunitiesDTO.Skipped::code).containsExactly("ASKED_RECENTLY");
        assertThat(saved).extracting(MktOpportunityEvent::getKind).containsExactly("INTEREST_REQUESTED");
    }

    @Test
    void setNextActionValidatesTheDate() {
        add(row(1, 1, "A", 1, "C", 90, "ASSIGNED", "OPEN", 1, 5));
        assertThat(service.setNextAction(me, 1L, NOW.plus(DAY)).changed()).isTrue();
        assertThat(service.setNextAction(me, 1L, null).message()).contains("cleared");
        assertThatThrownBy(() -> service.setNextAction(me, 1L, NOW.plus(Duration.ofDays(900)))).isInstanceOf(OrgException.class);
    }

    @Test
    void addingAnOpportunityNeedsAnExistingOpenJobAndRefusesDuplicates() {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(1L);
        c.setOrgId(ORG);
        c.setDisplayName("Alex");
        when(consultants.findByOrgIdAndId(ORG, 1L)).thenReturn(Optional.of(c));
        ClientRequirement closed = new ClientRequirement();
        closed.setId(5L);
        closed.setStatus("CLOSED");
        when(requirements.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(closed));
        assertThatThrownBy(() -> service.create(me, 1L, 5L)).extracting(e -> ((OrgException) e).getCode()).isEqualTo("JOB_NOT_OPEN");

        ClientRequirement open = new ClientRequirement();
        open.setId(6L);
        open.setStatus("OPEN");
        when(requirements.findByOrgIdAndId(ORG, 6L)).thenReturn(Optional.of(open));
        RequirementMatch dup = new RequirementMatch();
        dup.setId(88L);
        dup.setStatus("ASSIGNED");
        when(repo.findMatchByPair(ORG, 6L, 1L)).thenReturn(Optional.of(dup));
        assertThatThrownBy(() -> service.create(me, 1L, 6L)).extracting(e -> ((OrgException) e).getCode()).isEqualTo("OPPORTUNITY_EXISTS");
        assertThatThrownBy(() -> service.create(me, null, 6L)).isInstanceOf(OrgException.class);
    }

    // ---- export ----

    @Test
    void theCsvHasNoContactDetailsAndNeutralisesFormulas() {
        approvedResume(1);
        add(row(1, 1, "=cmd|' /C calc'!A0", 1, "Tech, Corp", 92, "ASSIGNED", "VERY_INTERESTED", 1, 5));
        String csv = service.exportCsv(me, q(null, null, null, null, null, 0, false, false));
        String[] lines = csv.split("\r\n");
        assertThat(lines[0]).isEqualTo("Consultant,Job Title,Client,Location,Match Score,Consultant Interest,Resume Status,Owner,Next Action,Status,Last Activity");
        assertThat(lines[1]).startsWith("'=cmd|' /C calc'!A0,").contains("\"Tech, Corp\"").contains("Very Interested").contains("Updated");
        assertThat(csv).doesNotContain("@");
        verify(audit).record(any(OrgMembership.class), eq("EXPORT"), eq("MKT_OPPORTUNITIES"), any(), any(), eq("1 rows"));
    }

    @Test
    void csvCellsAreQuotedWhenNeeded() {
        assertThat(MktOpportunitiesService.csv("a,b")).isEqualTo("\"a,b\"");
        assertThat(MktOpportunitiesService.csv("say \"hi\"")).isEqualTo("\"say \"\"hi\"\"\"");
        assertThat(MktOpportunitiesService.csv("+1")).isEqualTo("'+1");
        assertThat(MktOpportunitiesService.csv(null)).isEmpty();
    }

    // ---- feed ----

    @Test
    void theActivityFeedIsBuiltFromTheEventRows() {
        when(events.recent(eq(ORG), any(Pageable.class))).thenReturn(List.of(new MktEventRow(1L, 5L, 1L, "Alex Morgan", "INTEREST_CHANGED", "marked as Very Interested", "Senior Java Developer", "TechCorp", null, NOW.minus(Duration.ofHours(2)))));
        MktOpportunitiesDTO.Activity a = list(Query.defaults()).activity().get(0);
        assertThat(a.consultant()).isEqualTo("Alex Morgan");
        assertThat(a.text()).isEqualTo("marked as Very Interested");
        assertThat(a.detail()).isEqualTo("Senior Java Developer at TechCorp");
    }

    @Test
    void detailListsTheSameConsultantsOtherOpportunities() {
        approvedResume(1);
        add(row(1, 1, "Alex", 1, "A", 90, "ASSIGNED", "NOT_INTERESTED", 1, 5));
        add(row(2, 1, "Alex", 2, "B", 80, "SUGGESTED", "OPEN", 1, 5));
        add(row(3, 2, "Priya", 3, "C", 99, "SUGGESTED", "OPEN", 1, 5));
        when(events.forMatch(eq(ORG), eq(1L), any(Pageable.class))).thenReturn(List.of());
        MktOpportunitiesDTO.Detail d = service.detail(me, 1L);
        assertThat(d.item().action()).isEqualTo("COMPARE");
        assertThat(d.alternatives()).extracting(Item::id).containsExactly(2L);
    }
}
