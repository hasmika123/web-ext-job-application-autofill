package com.dossier.api.service.privacy;

import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.repository.RefreshTokenRepository;
import com.dossier.api.repository.privacy.AccountDeletionReportRepository;
import com.dossier.api.service.settings.AdminSettingKeys;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

/** The concrete retention targets: five tables, one small class each. */
public final class RetentionTargets {

    private RetentionTargets() {}

    /** {@code admin_audit_event}: the append-only trail of what administrators did. */
    @Component
    public static class AdminAudit implements RetentionTarget {

        private final AdminAuditEventRepository rows;

        public AdminAudit(AdminAuditEventRepository rows) {
            this.rows = rows;
        }

        @Override public String job() { return "ADMIN_AUDIT"; }
        @Override public String table() { return "admin_audit_event"; }
        @Override public String settingKey() { return AdminSettingKeys.PRIVACY_RETENTION_ADMIN_AUDIT_MONTHS; }
        @Override public String unit() { return "months"; }
        @Override public String description() { return "Admin audit events older than the window are deleted."; }
        @Override public long count(Instant cutoff) { return rows.countPurgeable(cutoff); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return rows.purgeableIds(cutoff, PageRequest.of(0, limit)); }
        @Override public int delete(List<Long> ids) { return rows.deleteByIdIn(ids); }
    }

    /** {@code refresh_token}: rows of tokens that expired more than the grace period ago (a live token, revoked or not, is never touched). */
    @Component
    public static class RefreshTokens implements RetentionTarget {

        private final RefreshTokenRepository rows;

        public RefreshTokens(RefreshTokenRepository rows) {
            this.rows = rows;
        }

        @Override public String job() { return "REFRESH_TOKEN"; }
        @Override public String table() { return "refresh_token"; }
        @Override public String settingKey() { return AdminSettingKeys.PRIVACY_RETENTION_SESSIONS_GRACE_DAYS; }
        @Override public String unit() { return "days"; }
        @Override public String description() { return "Refresh-token rows that expired more than the window ago are deleted; rows that can still be presented are kept for replay detection."; }
        @Override public long count(Instant cutoff) { return rows.countPurgeable(cutoff); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return rows.purgeableIds(cutoff, PageRequest.of(0, limit)); }
        @Override public int delete(List<Long> ids) { return rows.deleteByIdIn(ids); }
    }

    /** {@code ai_call}: the AI call ledger (tokens, cost, latency; it never held a prompt or an answer). */
    @Component
    public static class AiCalls implements RetentionTarget {

        private final AiCallRepository rows;

        public AiCalls(AiCallRepository rows) {
            this.rows = rows;
        }

        @Override public String job() { return "AI_CALL"; }
        @Override public String table() { return "ai_call"; }
        @Override public String settingKey() { return AdminSettingKeys.PRIVACY_RETENTION_AI_CALL_MONTHS; }
        @Override public String unit() { return "months"; }
        @Override public String description() { return "AI call ledger rows older than the window are deleted."; }
        @Override public long count(Instant cutoff) { return rows.countPurgeable(cutoff); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return rows.purgeableIds(cutoff, PageRequest.of(0, limit)); }
        @Override public int delete(List<Long> ids) { return rows.deleteByIdIn(ids); }
    }

    /** {@code bug_report}: resolved and won't-fix reports only; an open report is never purged. */
    @Component
    public static class BugReports implements RetentionTarget {

        private final BugReportRepository rows;

        public BugReports(BugReportRepository rows) {
            this.rows = rows;
        }

        @Override public String job() { return "BUG_REPORT"; }
        @Override public String table() { return "bug_report"; }
        @Override public String settingKey() { return AdminSettingKeys.PRIVACY_RETENTION_BUG_REPORT_MONTHS; }
        @Override public String unit() { return "months"; }
        @Override public String description() { return "Resolved and won't-fix bug reports older than the window are deleted; open reports are kept."; }
        @Override public long count(Instant cutoff) { return rows.countPurgeable(cutoff); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return rows.purgeableIds(cutoff, PageRequest.of(0, limit)); }
        @Override public int delete(List<Long> ids) { return rows.deleteByIdIn(ids); }
    }

    /** {@code account_deletion_report}: the purge reports themselves (counts only; no identity on them). */
    @Component
    public static class DeletionReports implements RetentionTarget {

        private final AccountDeletionReportRepository rows;

        public DeletionReports(AccountDeletionReportRepository rows) {
            this.rows = rows;
        }

        @Override public String job() { return "DELETION_REPORT"; }
        @Override public String table() { return "account_deletion_report"; }
        @Override public String settingKey() { return AdminSettingKeys.PRIVACY_RETENTION_DELETION_REPORT_MONTHS; }
        @Override public String unit() { return "months"; }
        @Override public String description() { return "Account-deletion purge reports older than the window are deleted."; }
        @Override public long count(Instant cutoff) { return rows.countByExecutedAtBefore(cutoff); }
        @Override public List<Long> nextIds(Instant cutoff, int limit) { return rows.purgeableIds(cutoff, PageRequest.of(0, limit)); }
        @Override public int delete(List<Long> ids) { return rows.deleteByIdIn(ids); }
    }
}
