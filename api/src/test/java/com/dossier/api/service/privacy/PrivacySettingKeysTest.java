package com.dossier.api.service.privacy;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.settings.SettingDefinitions;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The privacy and retention keys (B2) are in the settings registry with safe defaults and sane bounds; nothing is hard-coded elsewhere. */
class PrivacySettingKeysTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private Key key(String name) {
        Key k = SettingDefinitions.find(name);
        assertThat(k).as(name).isNotNull();
        return k;
    }

    private void intKey(String name, String def, int min, int max) {
        Key k = key(name);
        assertThat(k.type()).as(name).isEqualTo(Type.INT);
        assertThat(k.defaultValue()).as("default of " + name).isEqualTo(def);
        assertThat(k.min()).isEqualTo((double) min);
        assertThat(k.max()).isEqualTo((double) max);
        assertThat(k.area()).isEqualTo(name.substring(0, name.indexOf('.')));
        assertThat(ResumeBuilderSettings.isValid(k, def, mapper)).isTrue();
        assertThat(ResumeBuilderSettings.isValid(k, String.valueOf(max + 1), mapper)).as("above max").isFalse();
    }

    @Test
    void retentionWindowsHaveSafeDefaults() {
        intKey("privacy.retention.admin_audit_months", "24", 0, 120);
        intKey("privacy.retention.sessions_grace_days", "7", 1, 365);
        intKey("privacy.retention.ai_call_months", "13", 0, 120);
        intKey("privacy.retention.bug_report_months", "24", 0, 120);
        intKey("privacy.retention.deletion_report_months", "36", 0, 120);
        intKey("privacy.retention.batch_size", "500", 50, 2000);
        intKey("privacy.retention.max_batches", "40", 1, 500);
    }

    @Test
    void theSwitchesAndLimitsHaveSafeDefaults() {
        assertThat(key(AdminSettingKeys.PRIVACY_RETENTION_ENABLED).defaultValue()).isEqualTo("true");
        assertThat(key(AdminSettingKeys.PRIVACY_RETENTION_DRY_RUN).defaultValue()).isEqualTo("false");
        assertThat(key(AdminSettingKeys.PRIVACY_EXPORT_INCLUDE_FILES).defaultValue()).isEqualTo("true");
        intKey("privacy.deletion.grace_hours", "24", 0, 720);
        intKey("privacy.export.max_mb", "200", 5, 2000);
        intKey("privacy.export.expiry_hours", "72", 1, 720);
        intKey("privacy.export.max_per_day", "3", 1, 20);
    }

    @Test
    void everyWindowKeyOfARetentionTargetIsDeclared() {
        for (RetentionTarget t : new RetentionTarget[] {
            new RetentionTargets.AdminAudit(null),
            new RetentionTargets.RefreshTokens(null),
            new RetentionTargets.AiCalls(null),
            new RetentionTargets.BugReports(null),
            new RetentionTargets.DeletionReports(null),
        }) {
            assertThat(SettingDefinitions.find(t.settingKey())).as(t.job()).isNotNull();
            assertThat(t.unit()).isIn("months", "days");
        }
    }

    @Test
    void legalVersionsAreShortLabelsAndNeverBlank() {
        Key terms = key(AdminSettingKeys.LEGAL_TERMS_VERSION);
        assertThat(terms.type()).isEqualTo(Type.STRING);
        assertThat(terms.defaultValue()).isEqualTo("2026-10");
        assertThat(AdminSettingKeys.allowsBlank(terms)).isFalse();
        assertThat(AdminSettingKeys.shapeError(terms, "2026-10")).isNull();
        assertThat(AdminSettingKeys.shapeError(terms, "v 1; drop")).isEqualTo("INVALID");
        assertThat(AdminSettingKeys.shapeError(key(AdminSettingKeys.LEGAL_PRIVACY_VERSION), "x".repeat(31))).isEqualTo("INVALID");
    }
}
