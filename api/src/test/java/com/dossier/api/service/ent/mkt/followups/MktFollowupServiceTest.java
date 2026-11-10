package com.dossier.api.service.ent.mkt.followups;

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

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.repository.ent.mkt.MktConsultantLookupRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ActionResult;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Bucket;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CallRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.CreateRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Page;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.ReminderRequest;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.View;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto.Window;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Scope filtering, KPI math, every list filter, insights and the record-only writes of {@link MktFollowupService}, with mocked repositories (no Docker). */
class MktFollowupServiceTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final Long ORG = 1L;
    private static final Long ME = 7L;

    private final MktScope scope = mock(MktScope.class);
    private final MktFollowupRepository repo = mock(MktFollowupRepository.class);
    private final MktFollowupEventRepository events = mock(MktFollowupEventRepository.class);
    private final MktConsultantLookupRepository lookup = mock(MktConsultantLookupRepository.class);
    private final ClientAccountRepository clients = mock(ClientAccountRepository.class);
    private final TalentApplicationRepository applications = mock(TalentApplicationRepository.class);
    private final OrgAuditService audit = mock(OrgAuditService.class);
    private final OrgMembership me = new OrgMembership(ORG, ME, 70L, "marketer", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);
    private MktFollowupService service;
    private MktScope.View assigned;

    @BeforeEach
    void setUp() {
        service = new MktFollowupService(scope, repo, events, lookup, clients, applications, audit, Clock.fixed(NOW, ZoneOffset.UTC));
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
        when(repo.save(any(MktFollowup.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    private static ConsultantProfile consultant(Long id, String name) {
        ConsultantProfile c = new ConsultantProfile();
        c.setId(id);
        c.setOrgId(ORG);
        c.setDisplayName(name);
        c.setJobTitle("Java Developer");
        return c;
    }

    private static MktFollowup f(Long id, Long consultant, String title, String status, Instant due) {
        MktFollowup f = new MktFollowup();
        f.setId(id);
        f.setOrgId(ORG);
        f.setConsultantId(consultant);
        f.setTitle(title);
        f.setCounterpartLabel("TechCorp");
        f.setChannel("PHONE");
        f.setPriority("MEDIUM");
        f.setStatus(status);
        f.setDueAt(due);
        return f;
    }

    private void stubBuckets(List<MktFollowup> today, List<MktFollowup> overdue, List<MktFollowup> upcoming) {
        Instant endToday = Instant.parse("2026-10-14T00:00:00Z");
        when(repo.findOpenDueBetween(eq(ORG), anyBoolean(), anyCollection(), eq(NOW), eq(endToday))).thenReturn(today);
        when(repo.findOpenDueBetween(eq(ORG), anyBoolean(), anyCollection(), eq(endToday), any())).thenReturn(upcoming);
        when(repo.findOverdue(eq(ORG), anyBoolean(), anyCollection(), eq(NOW))).thenReturn(overdue);
    }

    @Test
    void anEmptyOrgDrawsEmptyListsAndNoDeltas() {
        stubBuckets(List.of(), List.of(), List.of());
        View v = service.view(me, Window.THIS_WEEK, 50, null);
        assertThat(v.today().items()).isEmpty();
        assertThat(v.today().total()).isZero();
        assertThat(v.overdue().total()).isZero();
        assertThat(v.upcoming().total()).isZero();
        assertThat(v.kpis()).extracting(MktFollowupDto.Kpi::key).containsExactly("dueToday", "overdue", "completedToday", "waiting");
        assertThat(v.kpis()).allSatisfy(k -> {
            assertThat(k.value()).isZero();
            assertThat(k.deltaPct()).isNull();
            assertThat(k.sparkline()).hasSize(8);
        });
        assertThat(v.insights().responseRatePct()).isNull();
        assertThat(v.insights().avgResponseHours()).isNull();
    }

    @Test
    void onlyTheCallersConsultantsAreQueried() {
        stubBuckets(List.of(), List.of(), List.of());
        service.view(me, Window.THIS_WEEK, 50, null);
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(repo).findOverdue(eq(ORG), eq(false), ids.capture(), eq(NOW));
        assertThat(ids.getValue()).containsExactlyInAnyOrder(11L, 12L);
    }

    @Test
    void anOrgScopeCallerQueriesEveryone() {
        when(scope.resolve(me, "followups.manage")).thenReturn(new MktScope.View(ORG, ME, true, Set.of()));
        stubBuckets(List.of(), List.of(), List.of());
        service.view(me, Window.THIS_WEEK, 50, null);
        verify(repo).findOverdue(eq(ORG), eq(true), anyCollection(), eq(NOW));
    }

    @Test
    void aMarketerWithNoAssignmentsGetsASentinelNotAnEmptyInList() {
        when(scope.resolve(me, "followups.manage")).thenReturn(new MktScope.View(ORG, ME, false, Set.of()));
        stubBuckets(List.of(), List.of(), List.of());
        service.view(me, Window.THIS_WEEK, 50, null);
        ArgumentCaptor<Collection<Long>> ids = ArgumentCaptor.forClass(Collection.class);
        verify(repo).findOverdue(eq(ORG), eq(false), ids.capture(), eq(NOW));
        assertThat(ids.getValue()).containsExactly(-1L);
    }

    @Test
    void kpiMathUsesTheSameMomentLastWeek() {
        MktFollowup a = f(1L, 11L, "Interview feedback call", "PENDING", NOW.plus(1, ChronoUnit.HOURS));
        MktFollowup b = f(2L, 12L, "Send candidate availability", "IN_PROGRESS", NOW.plus(2, ChronoUnit.HOURS));
        MktFollowup late = f(3L, 11L, "Send offer update", "PENDING", NOW.minus(1, ChronoUnit.DAYS));
        stubBuckets(List.of(a, b), List.of(late), List.of());
        Instant weekAgo = NOW.minus(7, ChronoUnit.DAYS);
        when(repo.countDueBetween(eq(ORG), eq(false), anyCollection(), eq(weekAgo), eq(Instant.parse("2026-10-07T00:00:00Z")))).thenReturn(4L);
        when(repo.countOverdueAt(eq(ORG), eq(false), anyCollection(), eq(weekAgo))).thenReturn(2L);
        when(repo.countCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(Instant.parse("2026-10-06T00:00:00Z")), eq(weekAgo))).thenReturn(10L);
        when(repo.countCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(Instant.parse("2026-10-13T00:00:00Z")), eq(Instant.parse("2026-10-14T00:00:00Z")))).thenReturn(12L);
        when(repo.countWaiting(eq(ORG), eq(false), anyCollection())).thenReturn(5L);
        View v = service.view(me, Window.THIS_WEEK, 50, null);
        Map<String, MktFollowupDto.Kpi> k = new java.util.HashMap<>();
        v.kpis().forEach(x -> k.put(x.key(), x));
        assertThat(k.get("dueToday").value()).isEqualTo(2);
        assertThat(k.get("dueToday").deltaPct()).isEqualTo(-50.0);
        assertThat(k.get("overdue").value()).isEqualTo(1);
        assertThat(k.get("overdue").deltaPct()).isEqualTo(-50.0);
        assertThat(k.get("completedToday").value()).isEqualTo(12);
        assertThat(k.get("completedToday").deltaPct()).isEqualTo(20.0);
        assertThat(k.get("waiting").value()).isEqualTo(5);
        assertThat(k.get("waiting").deltaPct()).isNull();
    }

    @Test
    void pctIsNullWithoutAPreviousValue() {
        assertThat(MktFollowupService.pct(5, 0)).isNull();
        assertThat(MktFollowupService.pct(6, 4)).isEqualTo(50.0);
    }

    @Test
    void rowsCarryTheConsultantNameAndTheDerivedOverdueFlag() {
        stubBuckets(List.of(f(1L, 11L, "Interview feedback call", "PENDING", NOW.plus(1, ChronoUnit.HOURS))), List.of(f(3L, 12L, "Send offer update", "PENDING", NOW.minus(1, ChronoUnit.DAYS))), List.of());
        View v = service.view(me, Window.THIS_WEEK, 50, null);
        assertThat(v.today().items().get(0).consultantName()).isEqualTo("Alex Morgan");
        assertThat(v.today().items().get(0).overdue()).isFalse();
        assertThat(v.overdue().items().get(0).consultantName()).isEqualTo("Priya Sharma");
        assertThat(v.overdue().items().get(0).overdue()).isTrue();
    }

    @Test
    void theBoardCapsRowsButKeepsTheFullTotal() {
        List<MktFollowup> twelve = new ArrayList<>();
        for (long i = 0; i < 12; i++) twelve.add(f(i + 1, 11L, "Item " + i, "PENDING", NOW.plus(i + 1, ChronoUnit.MINUTES)));
        stubBuckets(twelve, List.of(), List.of());
        View v = service.view(me, Window.THIS_WEEK, 5, null);
        assertThat(v.today().items()).hasSize(5);
        assertThat(v.today().total()).isEqualTo(12);
    }

    @Test
    void searchMatchesTitleClientAndConsultantName() {
        MktFollowup a = f(1L, 11L, "Interview feedback call", "PENDING", NOW.plus(1, ChronoUnit.HOURS));
        MktFollowup b = f(2L, 12L, "Share updated resume", "PENDING", NOW.plus(2, ChronoUnit.HOURS));
        b.setCounterpartLabel("Global Bank");
        stubBuckets(List.of(a, b), List.of(), List.of());
        assertThat(service.view(me, Window.THIS_WEEK, 50, "feedback").today().items()).extracting(MktFollowupDto.Row::id).containsExactly(1L);
        assertThat(service.view(me, Window.THIS_WEEK, 50, "global bank").today().items()).extracting(MktFollowupDto.Row::id).containsExactly(2L);
        assertThat(service.view(me, Window.THIS_WEEK, 50, "priya").today().items()).extracting(MktFollowupDto.Row::id).containsExactly(2L);
        assertThat(service.view(me, Window.THIS_WEEK, 50, "nothing like this").today().items()).isEmpty();
    }

    @Test
    void listBucketsSortAndPage() {
        MktFollowup hi = f(1L, 11L, "A", "PENDING", NOW.plus(3, ChronoUnit.HOURS));
        hi.setPriority("HIGH");
        MktFollowup lo = f(2L, 12L, "B", "PENDING", NOW.plus(1, ChronoUnit.HOURS));
        lo.setPriority("LOW");
        MktFollowup mid = f(3L, 11L, "C", "PENDING", NOW.plus(2, ChronoUnit.HOURS));
        stubBuckets(List.of(lo, mid, hi), List.of(), List.of());
        assertThat(service.list(me, Bucket.TODAY, 0, 50, null, "dueAt,desc").items()).extracting(MktFollowupDto.Row::id).containsExactly(1L, 3L, 2L);
        assertThat(service.list(me, Bucket.TODAY, 0, 50, null, "priority").items()).extracting(MktFollowupDto.Row::id).containsExactly(1L, 3L, 2L);
        assertThat(service.list(me, Bucket.TODAY, 0, 50, null, "consultant").items().get(0).consultantName()).isEqualTo("Alex Morgan");
        Page second = service.list(me, Bucket.TODAY, 1, 2, null, null);
        assertThat(second.items()).hasSize(1);
        assertThat(second.total()).isEqualTo(3);
        when(repo.findWaiting(eq(ORG), eq(false), anyCollection())).thenReturn(List.of(f(9L, 11L, "W", "WAITING", NOW.plus(2, ChronoUnit.DAYS))));
        assertThat(service.list(me, Bucket.WAITING, 0, 50, null, null).items()).extracting(MktFollowupDto.Row::id).containsExactly(9L);
        assertThat(service.list(me, Bucket.OVERDUE, 0, 50, null, null).total()).isZero();
    }

    @Test
    void sizeIsCappedAtOneHundred() {
        stubBuckets(List.of(), List.of(), List.of());
        assertThat(service.list(me, Bucket.TODAY, 0, 5000, null, null).size()).isEqualTo(100);
        assertThat(service.list(me, Bucket.TODAY, 0, 0, null, null).size()).isEqualTo(50);
    }

    @Test
    void insightsComputeRateAndResponseTimeFromEvents() {
        stubBuckets(List.of(), List.of(), List.of());
        Instant from = NOW.minus(7, ChronoUnit.DAYS);
        when(repo.countCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(from), eq(NOW))).thenReturn(32L);
        when(repo.countWaitingChangedBetween(eq(ORG), eq(false), anyCollection(), eq(from), eq(NOW))).thenReturn(15L);
        MktFollowup d1 = f(1L, 11L, "x", "COMPLETED", NOW.minus(2, ChronoUnit.DAYS));
        d1.setCompletedAt(NOW.minus(1, ChronoUnit.DAYS));
        MktFollowup d2 = f(2L, 11L, "y", "COMPLETED", NOW.minus(2, ChronoUnit.DAYS));
        d2.setCompletedAt(NOW.minus(1, ChronoUnit.DAYS));
        when(repo.findCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(from), eq(NOW))).thenReturn(List.of(d1, d2));
        when(events.findByOrgIdAndFollowupIdIn(eq(ORG), anyCollection())).thenReturn(List.of(
            event(1L, "REMINDER_SENT", NOW.minus(72, ChronoUnit.HOURS)), // 48h before completion
            event(2L, "CALL_LOGGED", NOW.minus(48, ChronoUnit.HOURS)), // 24h before completion
            event(2L, "STATUS_CHANGED", NOW.minus(1, ChronoUnit.HOURS)) // ignored: not an outbound touch
        ));
        MktFollowupDto.Insights i = service.view(me, Window.THIS_WEEK, 50, null).insights();
        assertThat(i.completed()).isEqualTo(32);
        assertThat(i.waiting()).isEqualTo(15);
        assertThat(i.responseRatePct()).isEqualTo(68.1); // 32 / 47
        assertThat(i.avgResponseHours()).isEqualTo(36.0);
        assertThat(i.window()).isEqualTo("THIS_WEEK");
    }

    @Test
    void lastWeekAndThisMonthUseTheirOwnWindows() {
        stubBuckets(List.of(), List.of(), List.of());
        service.view(me, Window.LAST_WEEK, 50, null);
        verify(repo).countCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(NOW.minus(14, ChronoUnit.DAYS)), eq(NOW.minus(7, ChronoUnit.DAYS)));
        service.view(me, Window.THIS_MONTH, 50, null);
        verify(repo).countCompletedBetween(eq(ORG), eq(false), anyCollection(), eq(NOW.minus(30, ChronoUnit.DAYS)), eq(NOW));
    }

    private static MktFollowupEvent event(Long followup, String kind, Instant at) {
        MktFollowupEvent e = new MktFollowupEvent();
        e.setOrgId(ORG);
        e.setFollowupId(followup);
        e.setKind(kind);
        e.setOccurredAt(at);
        return e;
    }

    // ---- writes ----------------------------------------------------------------------------------------------------------

    @Test
    void completingStampsTheTimeLogsAnEventAndAudits() {
        MktFollowup row = f(5L, 11L, "Confirm start date", "PENDING", NOW.plusSeconds(60));
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(row));
        ActionResult r = service.complete(me, 5L);
        assertThat(row.getStatus()).isEqualTo("COMPLETED");
        assertThat(row.getCompletedAt()).isEqualTo(NOW);
        assertThat(r.item().status()).isEqualTo("COMPLETED");
        ArgumentCaptor<MktFollowupEvent> ev = ArgumentCaptor.forClass(MktFollowupEvent.class);
        verify(events).save(ev.capture());
        assertThat(ev.getValue().getKind()).isEqualTo("STATUS_CHANGED");
        assertThat(ev.getValue().getByMemberId()).isEqualTo(ME);
        verify(audit).record(eq(me), eq("MARKETER_FOLLOWUP_STATUS"), eq("FOLLOWUP"), any(), eq("5"), any());
    }

    @Test
    void reopeningClearsCompletedAt() {
        MktFollowup row = f(5L, 11L, "x", "COMPLETED", NOW);
        row.setCompletedAt(NOW);
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(row));
        service.updateStatus(me, 5L, "in_progress");
        assertThat(row.getStatus()).isEqualTo("IN_PROGRESS");
        assertThat(row.getCompletedAt()).isNull();
    }

    @Test
    void aFollowupOfAnUnassignedConsultantIsA404ForEveryWrite() {
        MktFollowup foreign = f(8L, 99L, "x", "PENDING", NOW.plusSeconds(60));
        when(repo.findByOrgIdAndId(ORG, 8L)).thenReturn(Optional.of(foreign));
        assertThatThrownBy(() -> service.complete(me, 8L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.updateStatus(me, 8L, "WAITING")).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.logCall(me, 8L, new CallRequest("hello", false))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.sendReminder(me, 8L, new ReminderRequest(null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.complete(me, 404L)).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any());
        verify(events, never()).save(any());
    }

    @Test
    void createForAnUnassignedConsultantIs404() {
        CreateRequest req = new CreateRequest(99L, null, null, "Call", null, null, null, null, null, NOW.plusSeconds(3600));
        assertThatThrownBy(() -> service.create(me, req)).isInstanceOf(OrgNotFoundException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void createDefaultsStatusFromTheDueTimeAndFillsTheSubLine() {
        ActionResult today = service.create(me, new CreateRequest(11L, null, null, "Call the recruiter", null, "TechCorp", "phone", "high", null, NOW.plus(2, ChronoUnit.HOURS)));
        assertThat(today.item().status()).isEqualTo("PENDING");
        assertThat(today.item().channel()).isEqualTo("PHONE");
        assertThat(today.item().priority()).isEqualTo("HIGH");
        assertThat(today.item().detail()).isEqualTo("Alex Morgan - Java Developer");
        ActionResult later = service.create(me, new CreateRequest(11L, null, null, "Call the recruiter", null, null, null, null, null, NOW.plus(3, ChronoUnit.DAYS)));
        assertThat(later.item().status()).isEqualTo("NOT_STARTED");
        verify(audit, org.mockito.Mockito.times(2)).record(eq(me), eq("MARKETER_FOLLOWUP_CREATE"), eq("FOLLOWUP"), any(), any(), any());
    }

    @Test
    void createRejectsBadEnumsAndSensitiveText() {
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, null, "x", null, null, "FAX", null, null, NOW))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, null, "x", null, null, null, "URGENT", null, NOW))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, null, "ssn 123-45-6789", null, null, null, null, null, NOW))).isInstanceOf(com.dossier.api.service.privacy.SensitiveContentException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, null, null, "<b>x</b>", null, null, null, null, null, NOW))).isInstanceOf(OrgException.class);
        verify(repo, never()).save(any());
    }

    @Test
    void anApplicationOfAnotherConsultantIs404() {
        com.dossier.api.domain.ent.talent.TalentApplication app = new com.dossier.api.domain.ent.talent.TalentApplication();
        app.setId(50L);
        app.setConsultantId(12L);
        when(applications.findByOrgIdAndId(ORG, 50L)).thenReturn(Optional.of(app));
        assertThatThrownBy(() -> service.create(me, new CreateRequest(11L, 50L, null, "x", null, null, null, null, null, NOW))).isInstanceOf(OrgNotFoundException.class);
    }

    @Test
    void sendReminderOnlyRecordsARequestAndNeverEmails() {
        MktFollowup row = f(5L, 11L, "Share updated resume", "PENDING", NOW.plusSeconds(60));
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(row));
        ActionResult r = service.sendReminder(me, 5L, new ReminderRequest("Please confirm by Friday"));
        assertThat(r.emailed()).isFalse();
        assertThat(r.event()).isEqualTo("REMINDER_SENT");
        assertThat(row.getStatus()).isEqualTo("PENDING"); // a reminder request does not change the status
        ArgumentCaptor<MktFollowupEvent> ev = ArgumentCaptor.forClass(MktFollowupEvent.class);
        verify(events).save(ev.capture());
        assertThat(ev.getValue().getKind()).isEqualTo("REMINDER_SENT");
        assertThat(ev.getValue().getNote()).isEqualTo("Please confirm by Friday");
    }

    @Test
    void logCallRequiresANoteAndCanParkTheItemAsWaiting() {
        MktFollowup row = f(5L, 11L, "Check reference status", "PENDING", NOW.plusSeconds(60));
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(row));
        assertThatThrownBy(() -> service.logCall(me, 5L, new CallRequest("  ", false))).isInstanceOf(OrgException.class);
        service.logCall(me, 5L, new CallRequest("Left a voicemail", false));
        assertThat(row.getStatus()).isEqualTo("IN_PROGRESS");
        service.logCall(me, 5L, new CallRequest("Spoke to the recruiter, waiting for the client", true));
        assertThat(row.getStatus()).isEqualTo("WAITING");
        verify(events, org.mockito.Mockito.times(2)).save(any(MktFollowupEvent.class));
    }

    @Test
    void anUnknownStatusIsRefused() {
        MktFollowup row = f(5L, 11L, "x", "PENDING", NOW.plusSeconds(60));
        when(repo.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(row));
        assertThatThrownBy(() -> service.updateStatus(me, 5L, "OVERDUE")).isInstanceOf(OrgException.class); // overdue is derived, never stored
        assertThatThrownBy(() -> service.updateStatus(me, 5L, null)).isInstanceOf(OrgException.class);
    }

    @Test
    void reusableWindowQueriesServeOtherPages() {
        stubBuckets(List.of(f(1L, 11L, "A", "PENDING", NOW.plus(1, ChronoUnit.HOURS))), List.of(f(2L, 12L, "B", "PENDING", NOW.minus(1, ChronoUnit.HOURS))), List.of());
        assertThat(service.today(assigned)).extracting(MktFollowupDto.Row::id).containsExactly(1L);
        assertThat(service.overdue(assigned)).extracting(MktFollowupDto.Row::id).containsExactly(2L);
        assertThat(service.upcoming(assigned)).isEmpty();
    }
}
