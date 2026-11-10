package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.RefreshToken;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.domain.privacy.RetentionRun;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/**
 * The retention sweep on real MySQL (REAL-GAPS-C T1.4): each of the four tables loses exactly the rows past its window and nothing else, a dry run
 * deletes nothing, the lease keeps a second instance out, and every run leaves a record.
 */
@IntegrationTest
@Transactional
class RetentionServiceIT {

    private static final String WHO = "retention-it";

    @Autowired private RetentionService retention;
    @Autowired private JobLeaseService leases;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private AppSettingRepository settingRows;
    @Autowired private AdminAuditEventRepository auditRows;
    @Autowired private RefreshTokenRepository tokenRows;
    @Autowired private AiCallRepository aiCalls;
    @Autowired private BugReportRepository bugReports;

    private final Instant now = Instant.now();

    @AfterEach
    void resetSettings() {
        settings.invalidate();
    }

    private Instant monthsAgo(int months) {
        return now.atZone(ZoneOffset.UTC).minusMonths(months).toInstant();
    }

    private RetentionTarget target(String job) {
        return retention.target(job).orElseThrow();
    }

    private AdminAuditEvent audit(Instant at) {
        AdminAuditEvent e = new AdminAuditEvent();
        e.setActorLogin("ret-admin");
        e.setAction("TEST");
        e.setCreatedDate(at);
        return auditRows.saveAndFlush(e);
    }

    private BugReport bug(BugStatus status, Instant at) {
        BugReport b = new BugReport();
        b.setSource("web");
        b.setMessage("retention test");
        b.setCategory(BugCategory.BUG);
        b.setStatus(status);
        b.setCreatedDate(at);
        return bugReports.saveAndFlush(b);
    }

    private AiCall aiCall(Instant at) {
        AiCall c = new AiCall();
        c.setTask("parse");
        c.setModel("m");
        c.setProvider("gemini");
        c.setCreatedAt(at);
        return aiCalls.saveAndFlush(c);
    }

    @Test
    void adminAuditKeepsRecentRowsAndDropsRowsPastTwentyFourMonths() {
        AdminAuditEvent old = audit(monthsAgo(30));
        AdminAuditEvent recent = audit(monthsAgo(3));
        RetentionService.Result r = retention.run(target("ADMIN_AUDIT"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("DONE");
        assertThat(r.deleted()).isGreaterThanOrEqualTo(1);
        assertThat(auditRows.existsById(old.getId())).isFalse();
        assertThat(auditRows.existsById(recent.getId())).isTrue();
        // the sweep itself is audited and recorded: counts only
        List<RetentionRun> runs = retention.recent("ADMIN_AUDIT", 5);
        assertThat(runs).isNotEmpty();
        assertThat(runs.get(0).getDeleted()).isEqualTo(r.deleted());
        assertThat(auditRows.findAll()).anyMatch(e -> RetentionService.AUDIT_PURGE.equals(e.getAction()) && "ADMIN_AUDIT".equals(e.getTargetId()));
    }

    @Test
    void aDryRunCountsWhatWouldGoAndDeletesNothing() {
        AdminAuditEvent old = audit(monthsAgo(30));
        RetentionService.Result r = retention.run(target("ADMIN_AUDIT"), RetentionService.TRIGGER_ADMIN, "boss", true, now);
        assertThat(r.dryRun()).isTrue();
        assertThat(r.candidates()).isGreaterThanOrEqualTo(1);
        assertThat(r.deleted()).isZero();
        assertThat(auditRows.existsById(old.getId())).isTrue();
        assertThat(auditRows.findAll()).anyMatch(e -> RetentionService.AUDIT_DRY_RUN.equals(e.getAction()));
    }

    @Test
    void aiCallsPastThirteenMonthsGoAndTheRestStay() {
        AiCall old = aiCall(monthsAgo(14));
        AiCall recent = aiCall(monthsAgo(2));
        retention.run(target("AI_CALL"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(aiCalls.existsById(old.getId())).isFalse();
        assertThat(aiCalls.existsById(recent.getId())).isTrue();
    }

    @Test
    void onlyResolvedBugReportsPastTheWindowGo_anOpenOneIsNeverPurged() {
        BugReport oldResolved = bug(BugStatus.RESOLVED, monthsAgo(30));
        BugReport oldWontFix = bug(BugStatus.WONTFIX, monthsAgo(30));
        BugReport oldOpen = bug(BugStatus.NEW, monthsAgo(30));
        BugReport oldInProgress = bug(BugStatus.IN_PROGRESS, monthsAgo(30));
        BugReport recentResolved = bug(BugStatus.RESOLVED, monthsAgo(1));
        retention.run(target("BUG_REPORT"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(bugReports.existsById(oldResolved.getId())).isFalse();
        assertThat(bugReports.existsById(oldWontFix.getId())).isFalse();
        assertThat(bugReports.existsById(oldOpen.getId())).isTrue();
        assertThat(bugReports.existsById(oldInProgress.getId())).isTrue();
        assertThat(bugReports.existsById(recentResolved.getId())).isTrue();
    }

    @Test
    void refreshTokensAreDeletedOnlyAfterTheyExpiredPlusTheGrace() {
        // the seeded "user" owns the rows (the table has a foreign key to the account)
        Long userId = userId();
        RefreshToken longGone = tokenFor(userId, "ret-long-gone", now.minus(Duration.ofDays(10)));
        RefreshToken justExpired = tokenFor(userId, "ret-just-expired", now.minus(Duration.ofDays(2)));
        RefreshToken live = tokenFor(userId, "ret-live", now.plus(Duration.ofDays(30)));
        live.setRevoked(true); // revoked but still presentable: kept, so a replay is still recognised
        tokenRows.saveAndFlush(live);
        retention.run(target("REFRESH_TOKEN"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(tokenRows.existsById(longGone.getId())).isFalse();
        assertThat(tokenRows.existsById(justExpired.getId())).isTrue();
        assertThat(tokenRows.existsById(live.getId())).isTrue();
    }

    @Autowired private com.dossier.api.repository.UserRepository users;

    private Long userId() {
        return users.findOneByLogin("user").orElseThrow().getId();
    }

    private RefreshToken tokenFor(Long userId, String jti, Instant expiresAt) {
        RefreshToken t = new RefreshToken();
        t.setJti(jti);
        t.setFamilyId("fam-" + jti);
        t.setUserId(userId);
        t.setExpiresAt(expiresAt);
        t.setCreatedAt(expiresAt.minus(Duration.ofDays(90)));
        return tokenRows.saveAndFlush(t);
    }

    @Test
    void aSecondInstanceHoldingTheLeaseMakesThisRunDoNothing() {
        AiCall old = aiCall(monthsAgo(14));
        assertThat(leases.tryAcquire("retention:AI_CALL", "other-instance", Duration.ofMinutes(30), now)).isTrue();
        assertThat(leases.tryAcquire("retention:AI_CALL", "third-instance", Duration.ofMinutes(30), now)).as("a held lease cannot be taken").isFalse();

        RetentionService.Result r = retention.run(target("AI_CALL"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("SKIPPED");
        assertThat(aiCalls.existsById(old.getId())).as("nothing was deleted while the other instance held the lease").isTrue();

        leases.release("retention:AI_CALL", "other-instance", "done", now);
        retention.run(target("AI_CALL"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(aiCalls.existsById(old.getId())).isFalse();
    }

    @Test
    void anExpiredLeaseCanBeTakenOverSoACrashedInstanceNeverBlocksTheJob() {
        assertThat(leases.tryAcquire("retention:TEST_CRASH", "dead-instance", Duration.ofMinutes(30), now.minus(Duration.ofHours(2)))).isTrue();
        assertThat(leases.tryAcquire("retention:TEST_CRASH", "live-instance", Duration.ofMinutes(30), now)).isTrue();
    }

    @Test
    void theWindowComesFromTheSettingsRegistryAndZeroKeepsEverything() {
        AdminAuditEvent old = audit(monthsAgo(30));
        setting(AdminSettingKeys.PRIVACY_RETENTION_ADMIN_AUDIT_MONTHS, "0");
        assertThat(retention.run(target("ADMIN_AUDIT"), RetentionService.TRIGGER_SCHEDULE, null, null, now).status()).isEqualTo("SKIPPED");
        assertThat(auditRows.existsById(old.getId())).isTrue();

        setting(AdminSettingKeys.PRIVACY_RETENTION_ADMIN_AUDIT_MONTHS, "48"); // a longer window than the row's age
        retention.run(target("ADMIN_AUDIT"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(auditRows.existsById(old.getId())).isTrue();

        setting(AdminSettingKeys.PRIVACY_RETENTION_ADMIN_AUDIT_MONTHS, "12");
        retention.run(target("ADMIN_AUDIT"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(auditRows.existsById(old.getId())).isFalse();
    }

    @Test
    void theMasterSwitchOffMeansNoPurgeAtAll() {
        AiCall old = aiCall(monthsAgo(14));
        setting(AdminSettingKeys.PRIVACY_RETENTION_ENABLED, "false");
        RetentionService.Result r = retention.run(target("AI_CALL"), RetentionService.TRIGGER_SCHEDULE, null, null, now);
        assertThat(r.status()).isEqualTo("SKIPPED");
        assertThat(aiCalls.existsById(old.getId())).isTrue();
    }

    private void setting(String key, String value) {
        settingRows.save(new AppSetting(key, value, WHO, Instant.now()));
        settingRows.flush();
        settings.invalidate();
    }
}
