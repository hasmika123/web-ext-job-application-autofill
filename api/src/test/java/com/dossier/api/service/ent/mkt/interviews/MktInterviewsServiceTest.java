package com.dossier.api.service.ent.mkt.interviews;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.mkt.MktInterviewEvent;
import com.dossier.api.domain.ent.mkt.MktInterviewFeedback;
import com.dossier.api.domain.ent.mkt.MktInterviewMeta;
import com.dossier.api.domain.ent.mkt.MktInterviewPrepItem;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.repository.ent.mkt.MktInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewFeedbackRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewMetaRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewPrepItemRepository;
import com.dossier.api.repository.ent.mkt.MktInterviewRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.FeedbackRequest;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Kpi;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Overview;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Query;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.RescheduleRequest;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto.Row;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Scope filtering, KPI math, every filter, the derived status and the E1 write rules of {@link MktInterviewsService}, on in-memory
 * stand-ins for the repositories (no Docker). "Now" is Wednesday 2026-10-14 12:00 UTC; the week starts on Sunday 2026-10-11.
 */
class MktInterviewsServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");
    private static final Long ORG = 1L;

    private final MktScope scope = mock(MktScope.class);
    private final MktInterviewRepository interviews = mock(MktInterviewRepository.class);
    private final MktInterviewMetaRepository metas = mock(MktInterviewMetaRepository.class);
    private final MktInterviewPrepItemRepository prep = mock(MktInterviewPrepItemRepository.class);
    private final MktInterviewFeedbackRepository feedback = mock(MktInterviewFeedbackRepository.class);
    private final MktInterviewEventRepository events = mock(MktInterviewEventRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);

    private final List<TalentInterview> all = new ArrayList<>();
    private final Map<Long, MktInterviewMeta> metaById = new java.util.HashMap<>();
    private final List<MktInterviewFeedback> feedbackRows = new ArrayList<>();
    private final List<MktInterviewEvent> eventRows = new ArrayList<>();
    private final List<MktInterviewPrepItem> prepRows = new ArrayList<>();
    private final AtomicLong ids = new AtomicLong(1000);

    private MktInterviewsService service;
    private final OrgMembership me = new OrgMembership(ORG, 7L, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void wire() {
        // Alex (10) is the caller's consultant; Zed (11) is somebody else's.
        when(scope.resolve(any(), eq("interviews.coordinate"))).thenReturn(new MktScope.View(ORG, 7L, false, Set.of(10L)));
        org.mockito.Mockito.doAnswer(inv -> {
            MktScope.View v = inv.getArgument(0);
            if (!v.sees(inv.getArgument(1))) throw new OrgNotFoundException();
            return null;
        }).when(scope).require(any(), anyLong());

        when(interviews.findLiveInWindow(eq(ORG), any(), any())).thenAnswer(inv -> {
            Instant from = inv.getArgument(1), to = inv.getArgument(2);
            return live().filter(i -> !i.getScheduledAt().isBefore(from) && i.getScheduledAt().isBefore(to)).sorted(Comparator.comparing(TalentInterview::getScheduledAt)).toList();
        });
        when(interviews.findLiveStartedBefore(eq(ORG), any())).thenAnswer(inv -> {
            Instant before = inv.getArgument(1);
            return live().filter(i -> i.getScheduledAt().isBefore(before)).toList();
        });
        when(interviews.findLiveFrom(eq(ORG), any())).thenAnswer(inv -> {
            Instant from = inv.getArgument(1);
            return live().filter(i -> !i.getScheduledAt().isBefore(from)).sorted(Comparator.comparing(TalentInterview::getScheduledAt)).toList();
        });
        when(interviews.findByOrgIdAndId(eq(ORG), anyLong())).thenAnswer(inv -> all.stream().filter(i -> i.getId().equals(inv.getArgument(1))).findFirst());
        when(interviews.findConsultantNames(eq(ORG), anyCollection())).thenReturn(List.of(
            new Object[] { 10L, "Alex Morgan", "Java Developer" }, new Object[] { 11L, "Zed Other", "QA Engineer" }));
        when(interviews.findClientNames(eq(ORG), anyCollection())).thenReturn(List.of(new Object[] { 100L, "TechCorp" }, new Object[] { 101L, "Global Bank" }));
        when(interviews.findRoleTitles(eq(ORG), anyCollection())).thenReturn(List.of());
        when(interviews.save(any(TalentInterview.class))).thenAnswer(inv -> inv.getArgument(0));

        when(metas.findByOrgIdAndInterviewIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Set<Long> want = Set.copyOf(inv.<java.util.Collection<Long>>getArgument(1));
            return metaById.values().stream().filter(m -> want.contains(m.getInterviewId())).toList();
        });
        when(metas.findByOrgIdAndInterviewId(eq(ORG), anyLong())).thenAnswer(inv -> Optional.ofNullable(metaById.get(inv.<Long>getArgument(1))));
        when(metas.save(any(MktInterviewMeta.class))).thenAnswer(inv -> {
            MktInterviewMeta m = inv.getArgument(0);
            metaById.put(m.getInterviewId(), m);
            return m;
        });
        when(feedback.findByOrgIdAndInterviewIdIn(eq(ORG), anyCollection())).thenAnswer(inv -> {
            Set<Long> want = Set.copyOf(inv.<java.util.Collection<Long>>getArgument(1));
            return feedbackRows.stream().filter(f -> want.contains(f.getInterviewId())).toList();
        });
        when(feedback.save(any(MktInterviewFeedback.class))).thenAnswer(inv -> {
            MktInterviewFeedback f = inv.getArgument(0);
            feedbackRows.add(f);
            return f;
        });
        when(events.findOccurrencesWithConsultant(eq(ORG), anyString(), any(), any())).thenAnswer(inv -> {
            String kind = inv.getArgument(1);
            Instant from = inv.getArgument(2), to = inv.getArgument(3);
            return eventRows.stream()
                .filter(e -> e.getKind().equals(kind) && !e.getOccurredAt().isBefore(from) && e.getOccurredAt().isBefore(to))
                .map(e -> new Object[] { e.getOccurredAt(), all.stream().filter(i -> i.getId().equals(e.getInterviewId())).findFirst().orElseThrow().getConsultantId() })
                .toList();
        });
        when(events.findByOrgIdAndInterviewIdAndKindAndOccurredAtGreaterThanEqual(eq(ORG), anyLong(), anyString(), any())).thenAnswer(inv -> {
            Long iv = inv.getArgument(1);
            String kind = inv.getArgument(2);
            Instant since = inv.getArgument(3);
            return eventRows.stream().filter(e -> e.getInterviewId().equals(iv) && e.getKind().equals(kind) && !e.getOccurredAt().isBefore(since)).toList();
        });
        when(events.save(any(MktInterviewEvent.class))).thenAnswer(inv -> {
            MktInterviewEvent e = inv.getArgument(0);
            eventRows.add(e);
            return e;
        });
        when(prep.findByOrgIdAndInterviewIdOrderByPositionAsc(eq(ORG), anyLong())).thenAnswer(inv ->
            prepRows.stream().filter(p -> p.getInterviewId().equals(inv.<Long>getArgument(1))).sorted(Comparator.comparing(MktInterviewPrepItem::getPosition)).toList());
        when(prep.findByOrgIdAndInterviewIdAndId(eq(ORG), anyLong(), anyLong())).thenAnswer(inv ->
            prepRows.stream().filter(p -> p.getInterviewId().equals(inv.<Long>getArgument(1)) && p.getId().equals(inv.<Long>getArgument(2))).findFirst());
        when(prep.save(any(MktInterviewPrepItem.class))).thenAnswer(inv -> {
            MktInterviewPrepItem p = inv.getArgument(0);
            if (p.getId() == null) {
                p.setId(ids.incrementAndGet());
                prepRows.add(p);
            }
            return p;
        });

        service = new MktInterviewsService(scope, interviews, metas, prep, feedback, events, audit, new MktInterviewPrepTx(prep), Clock.fixed(NOW, ZoneOffset.UTC));
    }

    private java.util.stream.Stream<TalentInterview> live() {
        return all.stream().filter(i -> !"CANCELLED".equals(i.getStatus()));
    }

    private TalentInterview interview(long id, long consultant, long client, String at, String status, String round) {
        TalentInterview i = new TalentInterview();
        i.setId(id);
        i.setOrgId(ORG);
        i.setConsultantId(consultant);
        i.setClientId(client);
        i.setScheduledAt(Instant.parse(at));
        i.setStatus(status);
        i.setRoundLabel(round);
        i.setInterviewerName("Client Contact " + id);
        all.add(i);
        return i;
    }

    private MktInterviewMeta meta(long interviewId, String type, String coordination, String recruiter) {
        MktInterviewMeta m = new MktInterviewMeta();
        m.setOrgId(ORG);
        m.setInterviewId(interviewId);
        m.setInterviewType(type);
        m.setCoordinationStatus(coordination);
        m.setRecruiterName(recruiter);
        metaById.put(interviewId, m);
        return m;
    }

    private void feedbackAt(long interviewId, String at) {
        MktInterviewFeedback f = new MktInterviewFeedback();
        f.setOrgId(ORG);
        f.setInterviewId(interviewId);
        f.setRecordedByMemberId(7L);
        f.setOutcome("PASSED");
        f.setCreatedAt(Instant.parse(at));
        feedbackRows.add(f);
    }

    private void event(long interviewId, String kind, String at) {
        MktInterviewEvent e = new MktInterviewEvent();
        e.setOrgId(ORG);
        e.setInterviewId(interviewId);
        e.setKind(kind);
        e.setOccurredAt(Instant.parse(at));
        eventRows.add(e);
    }

    private void story() {
        interview(1, 10, 100, "2026-10-13T10:00:00Z", "COMPLETED", "1st Round"); // this week, finished, no feedback -> Pending Feedback
        interview(2, 10, 101, "2026-10-15T10:00:00Z", "SCHEDULED", "Final Round"); // this week, confirmed
        interview(3, 11, 100, "2026-10-16T10:00:00Z", "SCHEDULED", "1st Round"); // Zed: NOT the caller's consultant
        interview(4, 10, 100, "2026-10-17T14:00:00Z", "SCHEDULED", "2nd Round"); // this week, rescheduled
        interview(5, 10, 101, "2026-10-07T10:00:00Z", "COMPLETED", "1st Round"); // last week, has feedback
        interview(6, 10, 100, "2026-10-20T09:00:00Z", "CANCELLED", "1st Round"); // never on the board
        meta(1, "VIDEO", "SCHEDULED", "Priya Sharma");
        meta(2, "ONSITE", "CONFIRMED", "Emily Lawson");
        meta(3, "PANEL", "CONFIRMED", "David Kim");
        meta(4, "TECHNICAL", "RESCHEDULED", "David Kim").setProposedFor(Instant.parse("2026-10-18T14:00:00Z"));
        meta(5, "CLIENT", "CONFIRMED", "Priya Sharma");
        feedbackAt(5, "2026-10-08T09:00:00Z");
        event(4, MktInterviewEvent.RESCHEDULE_PROPOSED, "2026-10-13T08:00:00Z");
        event(3, MktInterviewEvent.RESCHEDULE_PROPOSED, "2026-10-13T09:00:00Z"); // Zed's: not counted
    }

    private Query query(String status, Long client, String q, String sort, String dir) {
        return new Query(null, null, status, client, q, sort, dir, 0, 25, 0);
    }

    private static Kpi kpi(Overview o, String key) {
        return o.kpis().stream().filter(k -> k.key().equals(key)).findFirst().orElseThrow();
    }

    // ---------------------------------------------------------------------------------------------- scope + KPI math

    @Test
    void emptyOrgGivesEmptyStatesAndNoDeltas() {
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.kpis()).hasSize(4).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
            assertThat(k.sparkline()).hasSize(8);
        });
        assertThat(o.schedule().items()).isEmpty();
        assertThat(o.schedule().total()).isZero();
        assertThat(o.upcoming()).isEmpty();
        assertThat(o.pendingFeedback()).isEmpty();
        assertThat(o.reminders()).isEmpty();
        assertThat(o.checklist()).isNull();
        assertThat(o.clients()).isEmpty();
    }

    @Test
    void defaultRangeIsTheCurrentSundayWeek() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.schedule().from()).isEqualTo(LocalDate.parse("2026-10-11"));
        assertThat(o.schedule().to()).isEqualTo(LocalDate.parse("2026-10-17"));
        assertThat(o.schedule().items()).extracting(Row::id).containsExactly(1L, 2L, 4L);
    }

    @Test
    void anUnassignedConsultantsInterviewNeverAppearsAnywhere() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.schedule().items()).extracting(Row::consultantId).containsOnly(10L);
        assertThat(o.upcoming()).extracting(Row::id).doesNotContain(3L);
        assertThat(o.reminders()).extracting(r -> r.id()).doesNotContain(3L);
        assertThat(kpi(o, "interviewsThisWeek").value()).isEqualTo(3); // 1, 2 and 4; Zed's 3 and the cancelled 6 are out
        assertThat(kpi(o, "reschedules").value()).isEqualTo(1); // Zed's reschedule event is not counted
    }

    @Test
    void kpiMathAgainstTheRows() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        Kpi week = kpi(o, "interviewsThisWeek");
        assertThat(week.value()).isEqualTo(3);
        assertThat(week.deltaPct()).isEqualTo(200.0); // 3 vs 1 last week
        assertThat(week.sparkline()).hasSize(8).endsWith(1L, 3L);
        Kpi confirmed = kpi(o, "confirmedInterviews");
        assertThat(confirmed.value()).isEqualTo(1); // only interview 2 of this week is CONFIRMED
        assertThat(confirmed.deltaPct()).isEqualTo(0.0); // interview 5 was last week's confirmed one
        Kpi pending = kpi(o, "pendingFeedback");
        assertThat(pending.value()).isEqualTo(1); // interview 1
        assertThat(pending.deltaPct()).isEqualTo(0.0); // 7 days ago interview 5 still had no feedback
        Kpi resched = kpi(o, "reschedules");
        assertThat(resched.value()).isEqualTo(1);
        assertThat(resched.deltaPct()).isNull(); // nothing the week before: no chip
    }

    @Test
    void aDeltaWithNoPreviousValueIsOmitted() {
        interview(2, 10, 101, "2026-10-15T10:00:00Z", "SCHEDULED", "Final Round");
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(kpi(o, "interviewsThisWeek").value()).isEqualTo(1);
        assertThat(kpi(o, "interviewsThisWeek").deltaPct()).isNull();
    }

    @Test
    void anOrgWideCallerSeesEveryConsultant() {
        story();
        when(scope.resolve(any(), eq("interviews.coordinate"))).thenReturn(new MktScope.View(ORG, 7L, true, Set.of()));
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.schedule().items()).extracting(Row::id).containsExactly(1L, 2L, 3L, 4L);
    }

    // ---------------------------------------------------------------------------------------------- derived status + rows

    @Test
    void statusIsDerivedFromMetaSlotStatusAndTime() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        Map<Long, String> byId = o.schedule().items().stream().collect(Collectors.toMap(Row::id, Row::status));
        assertThat(byId).containsEntry(1L, "PENDING_FEEDBACK").containsEntry(2L, "CONFIRMED").containsEntry(4L, "RESCHEDULED");
        TalentInterview done = interview(9, 10, 100, "2026-10-01T10:00:00Z", "SCHEDULED", "x"); // ended long ago, never marked completed
        assertThat(MktInterviewsService.statusOf(done, null, false, NOW)).isEqualTo("PENDING_FEEDBACK");
        assertThat(MktInterviewsService.statusOf(done, null, true, NOW)).isEqualTo("COMPLETED");
        TalentInterview next = interview(10, 10, 100, "2026-10-30T10:00:00Z", "SCHEDULED", "x");
        assertThat(MktInterviewsService.statusOf(next, null, false, NOW)).isEqualTo("SCHEDULED");
        assertThat(MktInterviewsService.statusOf(next, meta(10, "VIDEO", "AWAITING_CONFIRMATION", null), false, NOW)).isEqualTo("AWAITING_CONFIRMATION");
        assertThat(MktInterviewsService.statusOf(next, meta(10, "VIDEO", "PENDING_FEEDBACK", null), false, NOW)).isEqualTo("SCHEDULED"); // a future slot cannot be awaiting feedback
    }

    @Test
    void rowCarriesTypeRecruiterRoundAndProposal() {
        story();
        Row r = service.overview(me, query(null, null, null, null, null)).schedule().items().stream().filter(x -> x.id() == 4L).findFirst().orElseThrow();
        assertThat(r.type()).isEqualTo("TECHNICAL");
        assertThat(r.recruiter()).isEqualTo("David Kim");
        assertThat(r.round()).isEqualTo("2nd Round");
        assertThat(r.consultant()).isEqualTo("Alex Morgan");
        assertThat(r.role()).isEqualTo("Java Developer"); // no application: falls back to the consultant's title
        assertThat(r.client()).isEqualTo("TechCorp");
        assertThat(r.proposedFor()).isEqualTo(Instant.parse("2026-10-18T14:00:00Z"));
    }

    @Test
    void noMetaRowFallsBackToVideoAndTheInterviewerName() {
        interview(7, 10, 100, "2026-10-15T10:00:00Z", "SCHEDULED", "1st Round");
        Row r = service.overview(me, query(null, null, null, null, null)).schedule().items().get(0);
        assertThat(r.type()).isEqualTo("VIDEO");
        assertThat(r.recruiter()).isEqualTo("Client Contact 7");
        assertThat(r.status()).isEqualTo("SCHEDULED");
    }

    // ---------------------------------------------------------------------------------------------- filters, sort, paging

    @Test
    void statusFilter() {
        story();
        assertThat(service.overview(me, query("CONFIRMED", null, null, null, null)).schedule().items()).extracting(Row::id).containsExactly(2L);
        assertThat(service.overview(me, query("pending_feedback", null, null, null, null)).schedule().items()).extracting(Row::id).containsExactly(1L);
        assertThat(service.overview(me, query("RESCHEDULED", null, null, null, null)).schedule().items()).extracting(Row::id).containsExactly(4L);
        assertThatThrownBy(() -> service.overview(me, query("NOPE", null, null, null, null))).isInstanceOf(OrgException.class);
    }

    @Test
    void clientFilter() {
        story();
        assertThat(service.overview(me, query(null, 101L, null, null, null)).schedule().items()).extracting(Row::id).containsExactly(2L);
        assertThat(service.overview(me, query(null, 100L, null, null, null)).schedule().items()).extracting(Row::id).containsExactly(1L, 4L);
    }

    @Test
    void searchMatchesConsultantClientRoleAndRecruiter() {
        story();
        assertThat(service.overview(me, query(null, null, "global", null, null)).schedule().items()).extracting(Row::id).containsExactly(2L);
        assertThat(service.overview(me, query(null, null, "emily", null, null)).schedule().items()).extracting(Row::id).containsExactly(2L);
        assertThat(service.overview(me, query(null, null, "java", null, null)).schedule().total()).isEqualTo(3);
        assertThat(service.overview(me, query(null, null, "nobody", null, null)).schedule().items()).isEmpty();
    }

    @Test
    void sortAndPaging() {
        story();
        assertThat(service.overview(me, query(null, null, null, "date", "desc")).schedule().items()).extracting(Row::id).containsExactly(4L, 2L, 1L);
        assertThat(service.overview(me, query(null, null, null, "client", "asc")).schedule().items()).extracting(Row::client).containsExactly("Global Bank", "TechCorp", "TechCorp");
        Overview paged = service.overview(me, new Query(null, null, null, null, null, "date", "asc", 1, 2, 0));
        assertThat(paged.schedule().total()).isEqualTo(3);
        assertThat(paged.schedule().items()).extracting(Row::id).containsExactly(4L);
        assertThat(service.overview(me, new Query(null, null, null, null, null, null, null, 0, 5000, 0)).schedule().size()).isEqualTo(100); // capped
    }

    @Test
    void explicitRangeAndTimezoneOffset() {
        story();
        Overview last = service.overview(me, new Query(LocalDate.parse("2026-10-04"), LocalDate.parse("2026-10-10"), null, null, null, null, null, 0, 25, 0));
        assertThat(last.schedule().items()).extracting(Row::id).containsExactly(5L);
        // The viewer is at UTC-8: Tuesday evening there is already Wednesday UTC, so the week must still start on Sunday 10-11 local.
        Overview la = service.overview(me, new Query(null, null, null, null, null, null, null, 0, 25, -480));
        assertThat(la.schedule().from()).isEqualTo(LocalDate.parse("2026-10-11"));
        assertThatThrownBy(() -> service.overview(me, new Query(LocalDate.parse("2026-10-10"), LocalDate.parse("2026-10-01"), null, null, null, null, null, 0, 25, 0))).isInstanceOf(OrgException.class);
    }

    // ---------------------------------------------------------------------------------------------- the bottom cards

    @Test
    void upcomingPendingFeedbackAndReminders() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.upcoming()).extracting(Row::id).containsExactly(2L, 4L); // soonest first; not Zed's, not the cancelled one
        assertThat(o.reminders()).extracting(r -> r.id()).containsExactly(2L, 4L);
        assertThat(o.pendingFeedback()).extracting(f -> f.id()).containsExactly(1L);
        assertThat(o.pendingFeedback().get(0).daysOverdue()).isZero(); // due 2026-10-14 10:45, now 12:00: under a day
        assertThat(o.clients()).extracting(c -> c.name()).containsExactly("Global Bank", "TechCorp");
    }

    @Test
    void daysOverdueCountsWholeDaysPastTheDueTime() {
        interview(1, 10, 100, "2026-10-09T10:00:00Z", "COMPLETED", "1st Round");
        assertThat(service.overview(me, query(null, null, null, null, null)).pendingFeedback().get(0).daysOverdue()).isEqualTo(4); // due 10-10 10:45
        metaById.put(1L, new MktInterviewMeta());
        metaById.get(1L).setInterviewId(1L);
        metaById.get(1L).setFeedbackDueAt(Instant.parse("2026-10-13T12:00:00Z"));
        assertThat(service.overview(me, query(null, null, null, null, null)).pendingFeedback().get(0).daysOverdue()).isEqualTo(1);
    }

    @Test
    void checklistIsCreatedLazilyForTheNextInterviewWithTheBoardsSevenItems() {
        story();
        Overview o = service.overview(me, query(null, null, null, null, null));
        assertThat(o.checklist().interviewId()).isEqualTo(2L);
        assertThat(o.checklist().items()).extracting(i -> i.label()).containsExactlyElementsOf(MktInterviewsService.DEFAULT_PREP);
        assertThat(o.checklist().items()).hasSize(7).allSatisfy(i -> assertThat(i.done()).isFalse());
        service.overview(me, query(null, null, null, null, null)); // a second read does not create more
        assertThat(prepRows).hasSize(7);
    }

    @Test
    void aRequestThatLosesTheFirstTouchRaceReadsWhatTheWinnerCommittedInsteadOfFailing() {
        story();
        // another page (home / interviews) created the checklist a moment ago: our create hits the unique key, the fresh read sees the winner's rows
        MktInterviewPrepTx racing = mock(MktInterviewPrepTx.class);
        List<MktInterviewPrepItem> winners = new java.util.ArrayList<>();
        for (int p = 0; p < MktInterviewsService.DEFAULT_PREP.size(); p++) {
            MktInterviewPrepItem it = new MktInterviewPrepItem();
            it.setId(900L + p);
            it.setOrgId(ORG);
            it.setInterviewId(2L);
            it.setLabel(MktInterviewsService.DEFAULT_PREP.get(p));
            it.setPosition(p + 1);
            winners.add(it);
        }
        when(racing.create(eq(ORG), eq(2L), anyList(), any())).thenThrow(new org.springframework.dao.DataIntegrityViolationException("uk_mkt_interview_prep_position"));
        when(racing.read(ORG, 2L)).thenReturn(winners);
        MktInterviewsService s = new MktInterviewsService(scope, interviews, metas, prep, feedback, events, audit, racing, Clock.fixed(NOW, ZoneOffset.UTC));
        assertThat(s.checklist(me, 2L).items()).extracting(i -> i.id()).containsExactly(900L, 901L, 902L, 903L, 904L, 905L, 906L);
    }

    @Test
    void tickingAnItemPersistsAndAnotherInterviewsItemIs404() {
        story();
        long first = service.checklist(me, 2L).items().get(0).id();
        assertThat(service.tick(me, 2L, first, true).items().get(0).done()).isTrue();
        assertThat(prepRows.get(0).getDoneAt()).isEqualTo(NOW);
        assertThat(service.tick(me, 2L, first, false).items().get(0).done()).isFalse();
        service.checklist(me, 4L);
        assertThatThrownBy(() -> service.tick(me, 4L, first, true)).isInstanceOf(OrgNotFoundException.class); // item belongs to interview 2
    }

    // ---------------------------------------------------------------------------------------------- writes: E1 (record / propose only)

    @Test
    void aMissingOrForeignConsultantsInterviewIsA404ForEveryWrite() {
        story();
        RescheduleRequest r = new RescheduleRequest(NOW.plus(Duration.ofDays(2)), null);
        assertThatThrownBy(() -> service.proposeReschedule(me, 3L, r)).isInstanceOf(OrgNotFoundException.class); // Zed's
        assertThatThrownBy(() -> service.confirmSlot(me, 3L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.recordFeedback(me, 3L, new FeedbackRequest("PASSED", null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.requestReminder(me, 3L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.checklist(me, 3L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.proposeReschedule(me, 999L, r)).isInstanceOf(OrgNotFoundException.class); // does not exist
        verify(metas, never()).save(any());
        verify(events, never()).save(any());
    }

    @Test
    void aRescheduleIsAProposalTheSlotKeepsItsTimeUntilConfirmed() {
        story();
        Instant proposed = NOW.plus(Duration.ofDays(3));
        Row r = service.proposeReschedule(me, 2L, new RescheduleRequest(proposed, "Client asked for a later slot"));
        TalentInterview slot = all.get(1);
        assertThat(slot.getScheduledAt()).isEqualTo(Instant.parse("2026-10-15T10:00:00Z")); // unchanged: the consultant confirms
        assertThat(r.status()).isEqualTo("RESCHEDULED");
        assertThat(r.proposedFor()).isEqualTo(proposed);
        assertThat(metaById.get(2L).getRescheduleCount()).isEqualTo(1);
        assertThat(eventRows).anySatisfy(e -> {
            assertThat(e.getKind()).isEqualTo(MktInterviewEvent.RESCHEDULE_PROPOSED);
            assertThat(e.getActorMemberId()).isEqualTo(7L);
        });
        verify(audit).record(eq(me), eq("MARKETER_INTERVIEW_RESCHEDULE"), eq("INTERVIEW"), any(), eq("2"), anyString());
        verify(interviews, never()).save(any(TalentInterview.class));
        // recording the confirmed slot applies the proposed time
        Row confirmed = service.confirmSlot(me, 2L);
        assertThat(confirmed.status()).isEqualTo("CONFIRMED");
        assertThat(confirmed.startsAt()).isEqualTo(proposed);
        assertThat(confirmed.proposedFor()).isNull();
        verify(audit).record(eq(me), eq("MARKETER_INTERVIEW_CONFIRM"), eq("INTERVIEW"), any(), eq("2"), anyString());
    }

    @Test
    void rescheduleRules() {
        story();
        assertThatThrownBy(() -> service.proposeReschedule(me, 2L, new RescheduleRequest(NOW.minusSeconds(60), null))).isInstanceOf(OrgException.class); // not in the future
        assertThatThrownBy(() -> service.proposeReschedule(me, 1L, new RescheduleRequest(NOW.plusSeconds(86400), null)))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("INTERVIEW_NOT_OPEN")); // already happened
        assertThatThrownBy(() -> service.proposeReschedule(me, 2L, new RescheduleRequest(NOW.plusSeconds(86400), "call me on 415-555-0199 or ssn 123-45-6789")))
            .isInstanceOf(SensitiveContentException.class);
    }

    @Test
    void feedbackClearsPendingFeedbackAndNeedsAFinishedInterview() {
        story();
        assertThat(service.overview(me, query("PENDING_FEEDBACK", null, null, null, null)).schedule().items()).hasSize(1);
        Row r = service.recordFeedback(me, 1L, new FeedbackRequest("passed", "Client liked the answers."));
        assertThat(r.status()).isEqualTo("COMPLETED");
        assertThat(feedbackRows).anySatisfy(f -> {
            assertThat(f.getInterviewId()).isEqualTo(1L);
            assertThat(f.getRecordedByMemberId()).isEqualTo(7L);
            assertThat(f.getOutcome()).isEqualTo("PASSED");
        });
        assertThat(service.overview(me, query("PENDING_FEEDBACK", null, null, null, null)).schedule().items()).isEmpty();
        assertThat(kpi(service.overview(me, query(null, null, null, null, null)), "pendingFeedback").value()).isZero();
        // a future interview cannot have feedback
        assertThatThrownBy(() -> service.recordFeedback(me, 2L, new FeedbackRequest("PASSED", null)))
            .isInstanceOfSatisfying(OrgException.class, e -> assertThat(e.getCode()).isEqualTo("INTERVIEW_NOT_DONE"));
        assertThatThrownBy(() -> service.recordFeedback(me, 1L, new FeedbackRequest("MAYBE", null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.recordFeedback(me, 5L, new FeedbackRequest("PASSED", "my ssn is 123-45-6789"))).isInstanceOf(SensitiveContentException.class);
    }

    @Test
    void aFinishedButUnmarkedSlotBecomesCompletedWhenFeedbackIsRecorded() {
        TalentInterview i = interview(8, 10, 100, "2026-10-12T10:00:00Z", "SCHEDULED", "1st Round");
        service.recordFeedback(me, 8L, new FeedbackRequest("REJECTED", null));
        assertThat(i.getStatus()).isEqualTo("COMPLETED");
    }

    @Test
    void aReminderRequestIsRecordedOnceAnHourAndNothingIsSent() {
        story();
        service.requestReminder(me, 2L);
        service.requestReminder(me, 2L);
        assertThat(eventRows).filteredOn(e -> MktInterviewEvent.REMINDER_REQUESTED.equals(e.getKind())).hasSize(1);
        verify(audit).record(eq(me), eq("MARKETER_INTERVIEW_REMIND"), eq("INTERVIEW"), any(), eq("2"), anyString());
        assertThatThrownBy(() -> service.requestReminder(me, 1L)).isInstanceOf(OrgException.class); // finished
    }

    @Test
    void noWriteTouchesAnythingOutsideTheInterviewRecords() {
        story();
        service.proposeReschedule(me, 2L, new RescheduleRequest(NOW.plusSeconds(86400), null));
        service.confirmSlot(me, 2L);
        service.requestReminder(me, 4L);
        service.recordFeedback(me, 1L, new FeedbackRequest("PASSED", null));
        // E1: the only slot write ever is the time of a slot whose new time was just recorded as confirmed; no status other than COMPLETED is set.
        assertThat(all).filteredOn(x -> x.getId() != 1L && x.getId() != 5L).allSatisfy(x -> assertThat(x.getStatus()).isIn("SCHEDULED", "CANCELLED"));
    }
}
