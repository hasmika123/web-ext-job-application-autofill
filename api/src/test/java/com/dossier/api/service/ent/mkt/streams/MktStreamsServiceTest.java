package com.dossier.api.service.ent.mkt.streams;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.ent.mkt.MktJobStream;
import com.dossier.api.domain.ent.mkt.MktStreamAlert;
import com.dossier.api.domain.ent.mkt.MktStreamRule;
import com.dossier.api.domain.ent.mkt.MktStreamSyncLog;
import com.dossier.api.repository.ent.mkt.MktJobStreamRepository;
import com.dossier.api.repository.ent.mkt.MktStreamAlertRepository;
import com.dossier.api.repository.ent.mkt.MktStreamRuleRepository;
import com.dossier.api.repository.ent.mkt.MktStreamSyncLogRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto.*;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

/** Unit tests of the Job Streams service: gate, KPI math, every filter, the write actions and the connector seam. No Docker needed. */
class MktStreamsServiceTest {

    static final Long ORG = 7L;
    static final Instant NOW = Instant.parse("2026-11-04T12:00:00Z");

    MktScope scope = mock(MktScope.class);
    MktJobStreamRepository streams = mock(MktJobStreamRepository.class);
    MktStreamSyncLogRepository logs = mock(MktStreamSyncLogRepository.class);
    MktStreamAlertRepository alerts = mock(MktStreamAlertRepository.class);
    MktStreamRuleRepository rules = mock(MktStreamRuleRepository.class);
    OrgAuditService audit = mock(OrgAuditService.class);
    MktStreamsService service;
    OrgMembership me = new OrgMembership(ORG, 11L, 21L, "marketer@acme.com", OrgRole.MEMBER, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE);

    @BeforeEach
    void setUp() {
        service = new MktStreamsService(scope, streams, logs, alerts, rules, audit, Clock.fixed(NOW, ZoneOffset.UTC));
        when(streams.saveAndFlush(any(MktJobStream.class))).thenAnswer(i -> {
            MktJobStream s = i.getArgument(0);
            if (s.getId() == null) s.setId(99L);
            return s;
        });
        when(rules.saveAndFlush(any(MktStreamRule.class))).thenAnswer(i -> i.getArgument(0));
    }

    static MktJobStream stream(long id, String label, boolean active, String status, int daysOld) {
        MktJobStream s = new MktJobStream();
        s.setId(id);
        s.setOrgId(ORG);
        s.setSourceLabel(label);
        s.setActive(active);
        s.setStatus(status);
        s.setCreatedAt(NOW.minus(daysOld, ChronoUnit.DAYS));
        s.setNewOpenings(10);
        return s;
    }

    static MktStreamSyncLog log(long stream, Instant at, int openings, boolean ok) {
        MktStreamSyncLog l = new MktStreamSyncLog();
        l.setOrgId(ORG);
        l.setStreamId(stream);
        l.setSyncedAt(at);
        l.setOpenings(openings);
        l.setStatus(ok ? "OK" : "FAILED");
        return l;
    }

    static MktStreamAlert alert(Instant at, boolean resolved) {
        MktStreamAlert a = new MktStreamAlert();
        a.setOrgId(ORG);
        a.setSeverity("WARNING");
        a.setTitle("t");
        a.setRaisedAt(at);
        if (resolved) a.setResolvedAt(at.plusSeconds(60));
        return a;
    }

    static MktStreamsService.Query q() {
        return new MktStreamsService.Query(null, null, null, null, false, 0, 25, null, 7);
    }

    View view(List<MktJobStream> all, List<MktStreamSyncLog> sinceAsc, List<MktStreamSyncLog> newestFirst, List<MktStreamAlert> raised, MktStreamsService.Query query) {
        when(streams.findByOrgIdOrderByCreatedAtAscIdAsc(ORG)).thenReturn(all);
        when(logs.findByOrgIdAndSyncedAtGreaterThanEqualOrderBySyncedAtAsc(eq(ORG), any())).thenReturn(sinceAsc);
        when(logs.findByOrgIdOrderBySyncedAtDescIdDesc(eq(ORG), any(Pageable.class))).thenReturn(newestFirst);
        when(alerts.findByOrgIdAndRaisedAtGreaterThanEqualOrderByRaisedAtAsc(eq(ORG), any())).thenReturn(raised);
        when(alerts.findByOrgIdAndResolvedAtIsNullOrderByRaisedAtDesc(eq(ORG), any(Pageable.class))).thenReturn(List.of());
        when(rules.findByOrgId(ORG)).thenReturn(List.of());
        return service.get(me, query);
    }

    // ---- gate --------------------------------------------------------------------------------------------------------------------

    @Test
    void everyEntryPointIsGatedByMatchesRunAndTouchesNothingWhenDenied() {
        when(scope.resolve(me, "matches.run")).thenThrow(new OrgNotFoundException());
        assertThatThrownBy(() -> service.get(me, q())).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("X", null, 30, null, null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.update(me, 1L, new UpdateRequest("Y", null, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.pause(me, 1L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.resume(me, 1L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.updateRule(me, "AUTO_PUBLISH", new RuleRequest(true, null))).isInstanceOf(OrgNotFoundException.class);
        verify(streams, never()).saveAndFlush(any());
        verify(rules, never()).saveAndFlush(any());
        verify(audit, never()).record(any(OrgMembership.class), any(), any(), any(), any(), any());
    }

    // ---- empty org / KPI math ------------------------------------------------------------------------------------------------------

    @Test
    void anEmptyOrganizationGetsHonestEmptyStates() {
        View v = view(List.of(), List.of(), List.of(), List.of(), q());
        assertThat(v.streams().items()).isEmpty();
        assertThat(v.streams().total()).isZero();
        assertThat(v.activity()).isEmpty();
        assertThat(v.alerts()).isEmpty();
        assertThat(v.chart().series()).isEmpty();
        assertThat(v.chart().days()).hasSize(7);
        Kpi active = kpi(v, "activeStreams");
        assertThat(active.value()).isZero();
        assertThat(active.deltaPct()).isNull();
        assertThat(kpi(v, "syncHealth").value()).isNull();
        assertThat(kpi(v, "syncHealth").deltaPct()).isNull();
        assertThat(kpi(v, "streamErrors").deltaPct()).isNull();
        assertThat(v.rules()).extracting(RuleRow::key).containsExactly("DEFAULT_KEYWORDS", "CLIENT_MAPPING", "DUPLICATE_DETECTION", "AUTO_PUBLISH");
        assertThat(v.rules()).allMatch(r -> !r.enabled() && r.value() == null);
    }

    static Kpi kpi(View v, String key) {
        return v.kpis().stream().filter(k -> k.key().equals(key)).findFirst().orElseThrow();
    }

    @Test
    void activeStreamsCountsActiveOnesAndComparesWithThirtyDaysAgo() {
        List<MktJobStream> all = new ArrayList<>();
        for (int i = 1; i <= 5; i++) all.add(stream(i, "S" + i, true, "ACTIVE", 60));
        all.add(stream(6, "New", true, "ACTIVE", 10));
        all.add(stream(7, "Paused", false, "PAUSED", 60));
        View v = view(all, List.of(), List.of(), List.of(), q());
        Kpi k = kpi(v, "activeStreams");
        assertThat(k.value()).isEqualTo(6.0);
        assertThat(k.deltaPct()).isEqualTo(20.0);
        assertThat(k.sparkline()).hasSize(8).endsWith(6.0);
    }

    @Test
    void syncHealthIsTheOkShareOfTheLastFortyTwoSyncsAgainstTheFortyTwoBefore() {
        List<MktStreamSyncLog> newest = new ArrayList<>();
        for (int i = 0; i < 42; i++) newest.add(log(1, NOW.minus(i, ChronoUnit.HOURS), 5, true));
        for (int i = 0; i < 42; i++) newest.add(log(1, NOW.minus(100 + i, ChronoUnit.HOURS), 5, i >= 2)); // two failures in the previous window
        View v = view(List.of(stream(1, "A", true, "ACTIVE", 60)), List.of(), newest, List.of(), q());
        Kpi k = kpi(v, "syncHealth");
        assertThat(k.value()).isEqualTo(100.0);
        assertThat(k.deltaPct()).isEqualTo(5.0); // 100 vs 95.2
        assertThat(v.activity()).hasSize(20);
    }

    @Test
    void syncHealthWithoutAPreviousWindowDrawsNoDelta() {
        List<MktStreamSyncLog> newest = List.of(log(1, NOW.minusSeconds(60), 5, true), log(1, NOW.minusSeconds(120), 5, false));
        View v = view(List.of(stream(1, "A", true, "ACTIVE", 60)), List.of(), newest, List.of(), q());
        assertThat(kpi(v, "syncHealth").value()).isEqualTo(50.0);
        assertThat(kpi(v, "syncHealth").deltaPct()).isNull();
    }

    @Test
    void newOpeningsSumsOkSyncsOfTheLastSevenDaysAgainstTheSevenBefore() {
        List<MktStreamSyncLog> since = List.of(
            log(1, NOW.minus(10, ChronoUnit.DAYS), 100, true),
            log(1, NOW.minus(9, ChronoUnit.DAYS), 100, false), // failed syncs capture nothing
            log(1, NOW.minus(2, ChronoUnit.DAYS), 150, true),
            log(1, NOW.minus(1, ChronoUnit.HOURS), 50, true)
        );
        View v = view(List.of(stream(1, "A", true, "ACTIVE", 60)), since, List.of(), List.of(), q());
        assertThat(kpi(v, "newOpenings").value()).isEqualTo(200.0);
        assertThat(kpi(v, "newOpenings").deltaPct()).isEqualTo(100.0);
    }

    @Test
    void streamErrorsCountsAlertsOfTheLastThirtyDaysAgainstTheThirtyBefore() {
        List<MktStreamAlert> raised = new ArrayList<>();
        for (int i = 0; i < 9; i++) raised.add(alert(NOW.minus(35 + i, ChronoUnit.DAYS), true));
        for (int i = 0; i < 4; i++) raised.add(alert(NOW.minus(i + 1, ChronoUnit.DAYS), false));
        View v = view(List.of(stream(1, "A", true, "ACTIVE", 60)), List.of(), List.of(), raised, q());
        assertThat(kpi(v, "streamErrors").value()).isEqualTo(4.0);
        assertThat(kpi(v, "streamErrors").deltaPct()).isEqualTo(-55.6);
    }

    @Test
    void chartHasOneColumnPerDayAndOneSeriesPerStreamThatCapturedAnything() {
        List<MktStreamSyncLog> since = List.of(log(1, NOW.minusSeconds(60), 30, true), log(1, NOW.minus(1, ChronoUnit.DAYS), 10, true), log(2, NOW.minus(1, ChronoUnit.DAYS), 0, true));
        View v = view(List.of(stream(1, "A", true, "ACTIVE", 60), stream(2, "B", true, "ACTIVE", 60)), since, List.of(), List.of(), q());
        assertThat(v.chart().days()).hasSize(7).endsWith("2026-11-04");
        assertThat(v.chart().series()).hasSize(1);
        assertThat(v.chart().series().get(0).label()).isEqualTo("A");
        assertThat(v.chart().series().get(0).values()).hasSize(7).endsWith(10, 30);
        View v14 = view(List.of(stream(1, "A", true, "ACTIVE", 60)), since, List.of(), List.of(), new MktStreamsService.Query(null, null, null, null, false, 0, 25, null, 14));
        assertThat(v14.chart().days()).hasSize(14);
    }

    // ---- filters -----------------------------------------------------------------------------------------------------------------

    List<MktJobStream> board() {
        MktJobStream a = stream(1, "LinkedIn Jobs", true, "ACTIVE", 60);
        a.setSubtitle("Global Talent Solutions");
        a.setKeywords("Java, AWS");
        MktJobStream b = stream(2, "Indeed", true, "ERROR", 59);
        b.setKeywords("Data Analyst");
        MktJobStream c = stream(3, "Client Portal", true, "ACTIVE", 58);
        c.setClientScope("ACME Clients");
        MktJobStream d = stream(4, "Dice", false, "PAUSED", 57);
        return List.of(a, b, c, d);
    }

    List<String> labels(MktStreamsService.Query query) {
        return view(board(), List.of(), List.of(), List.of(), query).streams().items().stream().map(StreamRow::sourceLabel).toList();
    }

    @Test
    void pausedStreamsAreHiddenUnlessShowInactive() {
        assertThat(labels(q())).containsExactly("LinkedIn Jobs", "Indeed", "Client Portal");
        assertThat(labels(new MktStreamsService.Query(null, null, null, null, true, 0, 25, null, 7))).containsExactly("LinkedIn Jobs", "Indeed", "Client Portal", "Dice");
    }

    @Test
    void filtersBySourceStatusClientAndSearch() {
        assertThat(labels(new MktStreamsService.Query(null, "indeed", null, null, false, 0, 25, null, 7))).containsExactly("Indeed");
        assertThat(labels(new MktStreamsService.Query(null, null, "ERROR", null, false, 0, 25, null, 7))).containsExactly("Indeed");
        assertThat(labels(new MktStreamsService.Query(null, null, "PAUSED", null, false, 0, 25, null, 7))).containsExactly("Dice"); // choosing Paused implies showing it
        assertThat(labels(new MktStreamsService.Query(null, null, null, "ACME Clients", false, 0, 25, null, 7))).containsExactly("LinkedIn Jobs", "Indeed", "Client Portal"); // no scope = serves every client
        assertThat(labels(new MktStreamsService.Query(null, null, null, "Other Co", false, 0, 25, null, 7))).containsExactly("LinkedIn Jobs", "Indeed");
        assertThat(labels(new MktStreamsService.Query("data analyst", null, null, null, false, 0, 25, null, 7))).containsExactly("Indeed");
        assertThat(labels(new MktStreamsService.Query("global talent", null, null, null, false, 0, 25, null, 7))).containsExactly("LinkedIn Jobs");
        assertThat(labels(new MktStreamsService.Query("zzz", null, null, null, false, 0, 25, null, 7))).isEmpty();
    }

    @Test
    void sortsAndPagesAndOffersTheFilterChoices() {
        assertThat(labels(new MktStreamsService.Query(null, null, null, null, false, 0, 25, "source", 7))).containsExactly("Client Portal", "Indeed", "LinkedIn Jobs");
        assertThat(labels(new MktStreamsService.Query(null, null, null, null, false, 0, 25, "-source", 7))).containsExactly("LinkedIn Jobs", "Indeed", "Client Portal");
        View p2 = view(board(), List.of(), List.of(), List.of(), new MktStreamsService.Query(null, null, null, null, true, 1, 2, null, 7));
        assertThat(p2.streams().items()).extracting(StreamRow::sourceLabel).containsExactly("Client Portal", "Dice");
        assertThat(p2.streams().total()).isEqualTo(4);
        assertThat(p2.filters().sources()).containsExactly("Client Portal", "Dice", "Indeed", "LinkedIn Jobs");
        assertThat(p2.filters().clients()).containsExactly("ACME Clients");
        assertThat(p2.filters().statuses()).containsExactly("ACTIVE", "PAUSED", "ERROR");
    }

    @Test
    void sizeIsCappedAtOneHundred() {
        View v = view(board(), List.of(), List.of(), List.of(), new MktStreamsService.Query(null, null, null, null, true, 0, 5000, null, 7));
        assertThat(v.streams().size()).isEqualTo(100);
    }

    // ---- writes ------------------------------------------------------------------------------------------------------------------

    @Test
    void createRecordsAnActiveStreamAndAudits() {
        when(streams.existsByOrgIdAndSourceLabelIgnoreCase(ORG, "Monster")).thenReturn(false);
        StreamRow row = service.create(me, new CreateRequest("  Monster  ", "Remote roles", 45, "Java, java, AWS,, ", "ACME Clients"));
        assertThat(row.sourceLabel()).isEqualTo("Monster");
        assertThat(row.status()).isEqualTo("ACTIVE");
        assertThat(row.keywords()).containsExactly("Java", "AWS");
        assertThat(row.syncEveryMinutes()).isEqualTo(45);
        assertThat(row.lastSyncAt()).isNull(); // nothing has synced: the page shows "Never"
        ArgumentCaptor<MktJobStream> saved = ArgumentCaptor.forClass(MktJobStream.class);
        verify(streams).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getOrgId()).isEqualTo(ORG);
        verify(audit).record(eq(me), eq("MARKETER_STREAM_CREATE"), eq("STREAM"), any(), any(), any());
    }

    @Test
    void createRefusesADuplicateNameAndSensitiveText() {
        when(streams.existsByOrgIdAndSourceLabelIgnoreCase(ORG, "indeed")).thenReturn(true);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("indeed", null, 30, null, null))).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("Feed", "ssn 123-45-6789", 30, null, null))).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> service.create(me, new CreateRequest("<b>x</b>", null, 30, null, null))).isInstanceOf(OrgException.class);
    }

    @Test
    void configurePatchesOnlyWhatWasSent() {
        MktJobStream s = stream(5, "Dice", true, "ACTIVE", 60);
        s.setKeywords("Java");
        s.setSubtitle("Tech");
        when(streams.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(s));
        StreamRow row = service.update(me, 5L, new UpdateRequest(null, null, 120, "AWS, Azure", ""));
        assertThat(row.syncEveryMinutes()).isEqualTo(120);
        assertThat(row.keywords()).containsExactly("AWS", "Azure");
        assertThat(row.subtitle()).isEqualTo("Tech");
        assertThat(row.clientScope()).isNull();
        verify(audit).record(eq(me), eq("MARKETER_STREAM_UPDATE"), eq("STREAM"), any(), eq("5"), any());
    }

    @Test
    void aStreamOfAnotherTenantIsA404ForEveryAction() {
        when(streams.findByOrgIdAndId(ORG, 500L)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.update(me, 500L, new UpdateRequest("x", null, null, null, null))).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.pause(me, 500L)).isInstanceOf(OrgNotFoundException.class);
        assertThatThrownBy(() -> service.resume(me, 500L)).isInstanceOf(OrgNotFoundException.class);
        verify(streams, never()).saveAndFlush(any());
    }

    @Test
    void pauseAndResumeToggleStatusAndActive() {
        MktJobStream s = stream(5, "Dice", true, "ACTIVE", 60);
        when(streams.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(s));
        StreamRow paused = service.pause(me, 5L);
        assertThat(paused.status()).isEqualTo("PAUSED");
        assertThat(paused.active()).isFalse();
        StreamRow resumed = service.resume(me, 5L);
        assertThat(resumed.status()).isEqualTo("ACTIVE");
        assertThat(resumed.active()).isTrue();
        verify(audit).record(eq(me), eq("MARKETER_STREAM_PAUSE"), eq("STREAM"), any(), eq("5"), any());
        verify(audit).record(eq(me), eq("MARKETER_STREAM_RESUME"), eq("STREAM"), any(), eq("5"), any());
    }

    @Test
    void ruleToggleCreatesTheRowWhenMissingAndRejectsUnknownKeys() {
        when(rules.findByOrgIdAndRuleKey(ORG, "AUTO_PUBLISH")).thenReturn(Optional.empty());
        RuleRow r = service.updateRule(me, "auto_publish", new RuleRequest(true, " Sync new openings "));
        assertThat(r.enabled()).isTrue();
        assertThat(r.value()).isEqualTo("Sync new openings");
        verify(audit).record(eq(me), eq("MARKETER_STREAM_RULE"), eq("STREAM"), any(), eq("AUTO_PUBLISH"), any());
        assertThatThrownBy(() -> service.updateRule(me, "NOPE", new RuleRequest(true, null))).isInstanceOf(OrgNotFoundException.class);
    }

    // ---- the connector seam ------------------------------------------------------------------------------------------------------

    @Test
    void recordSyncUpdatesTheStreamWithTheChangeAgainstThePreviousOkSync() {
        MktJobStream s = stream(5, "Dice", true, "ERROR", 60);
        when(streams.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(s));
        when(logs.findByOrgIdAndStreamIdOrderBySyncedAtDescIdDesc(eq(ORG), eq(5L), any(Pageable.class))).thenReturn(List.of(log(5, NOW.minusSeconds(3600), 100, false), log(5, NOW.minusSeconds(7200), 100, true)));
        assertThat(service.recordSync(ORG, 5L, 112, true, "Sync completed", NOW)).isTrue();
        assertThat(s.getNewOpenings()).isEqualTo(112);
        assertThat(s.getOpeningsDeltaPct()).isEqualByComparingTo(new BigDecimal("12.00"));
        assertThat(s.getLastSyncAt()).isEqualTo(NOW);
        assertThat(s.getStatus()).isEqualTo("ACTIVE"); // a good sync clears the error state
        verify(logs).save(any(MktStreamSyncLog.class));
        verify(alerts, never()).save(any());
    }

    @Test
    void recordSyncOfAFailureRaisesAnErrorAlertButKeepsAPausedStreamPaused() {
        MktJobStream active = stream(5, "Dice", true, "ACTIVE", 60);
        when(streams.findByOrgIdAndId(ORG, 5L)).thenReturn(Optional.of(active));
        service.recordSync(ORG, 5L, 0, false, "Connection timeout", NOW);
        assertThat(active.getStatus()).isEqualTo("ERROR");
        ArgumentCaptor<MktStreamAlert> a = ArgumentCaptor.forClass(MktStreamAlert.class);
        verify(alerts).save(a.capture());
        assertThat(a.getValue().getSeverity()).isEqualTo("ERROR");
        assertThat(a.getValue().getTitle()).isEqualTo("Dice sync failed");
        MktJobStream paused = stream(6, "Indeed", false, "PAUSED", 60);
        when(streams.findByOrgIdAndId(ORG, 6L)).thenReturn(Optional.of(paused));
        service.recordSync(ORG, 6L, 0, false, "x", NOW);
        assertThat(paused.getStatus()).isEqualTo("PAUSED");
    }

    @Test
    void recordSyncForAnotherTenantsStreamDoesNothing() {
        when(streams.findByOrgIdAndId(eq(ORG), anyLong())).thenReturn(Optional.empty());
        assertThat(service.recordSync(ORG, 1L, 5, true, null, NOW)).isFalse();
        verify(logs, never()).save(any());
    }

    @Test
    void keywordCleaning() {
        assertThat(MktStreamsService.cleanKeywords(" a ,A, b ,, c ")).isEqualTo("a, b, c");
        assertThat(MktStreamsService.cleanKeywords("  ,  ")).isNull();
        assertThat(MktStreamsService.splitKeywords("a, b")).containsExactly("a", "b");
        assertThat(MktStreamsService.pct(5, 0)).isNull();
    }
}
