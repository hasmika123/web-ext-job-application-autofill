package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.privacy.RetentionRun;
import com.dossier.api.repository.privacy.RetentionRunRepository;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Supplier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

/** The sweep's rules without a database: windows, dry run, batch cap, the lease, and what gets recorded. */
class RetentionServiceTest {

    /** An in-memory table of ids; "older" ids qualify. */
    static class FakeTarget implements RetentionTarget {

        final List<Long> rows = new ArrayList<>();
        int window = 0;

        @Override public String job() { return "FAKE"; }
        @Override public String table() { return "fake"; }
        @Override public String settingKey() { return "privacy.retention.ai_call_months"; }
        @Override public String unit() { return "months"; }
        @Override public String description() { return "fake"; }
        @Override public long count(Instant cutoff) { return rows.size(); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return new ArrayList<>(rows.subList(0, Math.min(limit, rows.size()))); }
        @Override public int delete(List<Long> ids) { int before = rows.size(); rows.removeAll(ids); return before - rows.size(); }
    }

    private final FakeTarget target = new FakeTarget();
    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    private final JobLeaseService leases = mock(JobLeaseService.class);
    private final RetentionRunRepository runs = mock(RetentionRunRepository.class);
    private final AdminAuditService audit = mock(AdminAuditService.class);
    private RetentionService service;
    private boolean leaseFree = true;
    private final Instant now = Instant.parse("2026-10-16T12:00:00Z");

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        PlatformTransactionManager tm = mock(PlatformTransactionManager.class);
        when(tm.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_ENABLED)).thenReturn(true);
        when(settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_DRY_RUN)).thenReturn(false);
        when(settings.getInt(AdminSettingKeys.PRIVACY_RETENTION_BATCH_SIZE)).thenReturn(500);
        when(settings.getInt(AdminSettingKeys.PRIVACY_RETENTION_MAX_BATCHES)).thenReturn(2);
        when(settings.getInt("privacy.retention.ai_call_months")).thenAnswer(i -> target.window);
        when(leases.withLease(anyString(), any(Duration.class), any(Instant.class), any(Supplier.class), any(Function.class))).thenAnswer(inv -> {
            if (!leaseFree) return Optional.empty();
            Supplier<Object> work = inv.getArgument(3);
            return Optional.ofNullable(work.get());
        });
        service = new RetentionService(List.of(target), settings, leases, runs, audit, tm);
        target.window = 13;
    }

    private void fill(int n) {
        for (long i = 1; i <= n; i++) target.rows.add(i);
    }

    @Test
    void deletesInBatchesAndAuditsWhatWentWithoutContent() {
        fill(300);
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("DONE");
        assertThat(r.deleted()).isEqualTo(300);
        assertThat(r.cutoff()).isEqualTo(Instant.parse("2025-09-16T12:00:00Z")); // 13 months back
        assertThat(target.rows).isEmpty();
        ArgumentCaptor<RetentionRun> run = ArgumentCaptor.forClass(RetentionRun.class);
        verify(runs).save(run.capture());
        assertThat(run.getValue().getDeleted()).isEqualTo(300);
        assertThat(run.getValue().getTriggerKind()).isEqualTo("SCHEDULE");
        verify(audit).record(eq(RetentionService.AUDIT_PURGE), eq("RETENTION"), eq("FAKE"), any(), any());
    }

    @Test
    void theBatchCapLeavesTheRestForTheNextRun() {
        fill(1500); // batch 500 x max 2 = 1000 per run
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("PARTIAL");
        assertThat(r.deleted()).isEqualTo(1000);
        assertThat(target.rows).hasSize(500);
        assertThat(service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now).status()).isEqualTo("DONE");
        assertThat(target.rows).isEmpty();
    }

    @Test
    void aDryRunCountsAndDeletesNothingAndSaysSo() {
        fill(40);
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_ADMIN, "boss", true, now);
        assertThat(r.dryRun()).isTrue();
        assertThat(r.candidates()).isEqualTo(40);
        assertThat(r.deleted()).isZero();
        assertThat(target.rows).hasSize(40);
        verify(audit).record(eq(RetentionService.AUDIT_DRY_RUN), eq("RETENTION"), eq("FAKE"), any(), any());
    }

    @Test
    void theSettingMakesTheScheduledRunADryRun() {
        when(settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_DRY_RUN)).thenReturn(true);
        fill(10);
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.dryRun()).isTrue();
        assertThat(target.rows).hasSize(10);
    }

    @Test
    void windowZeroKeepsEverything() {
        target.window = 0;
        fill(10);
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("SKIPPED");
        assertThat(target.rows).hasSize(10);
        verify(leases, never()).withLease(anyString(), any(), any(), any(), any());
    }

    @Test
    void theMasterSwitchStopsRealPurgesButNotDryRuns() {
        when(settings.getBool(AdminSettingKeys.PRIVACY_RETENTION_ENABLED)).thenReturn(false);
        fill(10);
        assertThat(service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now).status()).isEqualTo("SKIPPED");
        assertThat(target.rows).hasSize(10);
        RetentionService.Result dry = service.run(target, RetentionService.TRIGGER_ADMIN, "boss", true, now);
        assertThat(dry.status()).isEqualTo("DONE");
        assertThat(dry.candidates()).isEqualTo(10);
    }

    @Test
    void aSecondInstanceHoldingTheLeaseMeansThisOneDoesNothing() {
        leaseFree = false;
        fill(10);
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("SKIPPED");
        assertThat(r.note()).contains("another instance");
        assertThat(target.rows).hasSize(10);
        verify(runs, never()).save(any());
        verify(audit, never()).record(anyString(), anyString(), anyString(), any(), any());
    }

    @Test
    void nothingToDeleteWritesNoRunRowForAScheduledSweep() {
        RetentionService.Result r = service.run(target, RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("DONE");
        verify(runs, never()).save(any());
        verify(audit, never()).record(anyString(), anyString(), anyString(), any(), any());
    }
}
