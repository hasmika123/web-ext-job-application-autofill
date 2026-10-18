package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** The guard knobs: registry defaults are the safe ones, an organization override wins when valid and is ignored when malformed or out of range. */
class PipelineGuardSettingsTest {

    static final Long ORG = 7L;

    OrgSettingRepository orgSettings = mock(OrgSettingRepository.class);
    ResumeBuilderSettings platform = mock(ResumeBuilderSettings.class);
    PipelineGuardSettings settings = new PipelineGuardSettings(orgSettings, platform);

    @BeforeEach
    void defaults() {
        when(platform.getString(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY)).thenReturn("WARN");
        when(platform.getInt(EnterpriseSettingKeys.ORG_PIPELINE_SAME_CLIENT_WINDOW_DAYS)).thenReturn(90);
        when(platform.getInt(EnterpriseSettingKeys.ORG_PIPELINE_MAX_PER_REQUIREMENT)).thenReturn(0);
        when(platform.getInt(EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX)).thenReturn(0);
        when(platform.getBool(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK)).thenReturn(true);
        when(platform.getString(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL)).thenReturn("NEVER");
        when(platform.getBool(EnterpriseSettingKeys.ORG_RESUMES_MANAGER_REVIEW)).thenReturn(false);
        when(platform.getInt(EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_EXPIRY_DAYS)).thenReturn(7);
    }

    void override(String key, String json) {
        OrgSetting s = new OrgSetting();
        s.setValueJson(json);
        when(orgSettings.findByOrgIdAndSettingKey(ORG, key)).thenReturn(Optional.of(s));
    }

    @Test
    void theRegistryShipsTheSafeDefaults() {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY).defaultValue()).isEqualTo("WARN");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY).allowed()).containsExactly("WARN", "BLOCK", "REQUIRE_APPROVAL");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_SAME_CLIENT_WINDOW_DAYS).defaultValue()).isEqualTo("90");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_MAX_PER_REQUIREMENT).defaultValue()).isEqualTo("0");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX).defaultValue()).isEqualTo("0");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK).defaultValue()).isEqualTo("true");
    }

    @Test
    void withoutAnOverrideThePlatformValueApplies() {
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("WARN");
        assertThat(settings.sameClientWindowDays(ORG)).isEqualTo(90);
        assertThat(settings.maxPerRequirement(ORG)).isZero();
        assertThat(settings.openMatchesMax(ORG)).isZero();
        assertThat(settings.handoverOpenWork(ORG)).isTrue();
    }

    @Test
    void anOrganizationOverrideWins() {
        override(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY, "\"BLOCK\"");
        override(EnterpriseSettingKeys.ORG_PIPELINE_SAME_CLIENT_WINDOW_DAYS, "30");
        override(EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX, "12");
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK, "false");
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("BLOCK");
        assertThat(settings.sameClientWindowDays(ORG)).isEqualTo(30);
        assertThat(settings.openMatchesMax(ORG)).isEqualTo(12);
        assertThat(settings.handoverOpenWork(ORG)).isFalse();
    }

    @Test
    void aMalformedOrOutOfRangeOverrideIsIgnored() {
        override(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY, "\"MAYBE\"");
        override(EnterpriseSettingKeys.ORG_PIPELINE_SAME_CLIENT_WINDOW_DAYS, "5000");
        override(EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX, "lots");
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK, "perhaps");
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("WARN");
        assertThat(settings.sameClientWindowDays(ORG)).isEqualTo(90);
        assertThat(settings.openMatchesMax(ORG)).isZero();
        assertThat(settings.handoverOpenWork(ORG)).isTrue();
    }

    @Test
    void aBadPlatformValueFailsTowardsAskingNotTowardsBlocking() {
        when(platform.getString(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY)).thenReturn("garbage");
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("WARN");
        assertThat(settings.duplicatePolicy(null)).isEqualTo("WARN");
    }

    // ---- manager approvals (MM-02): every default changes nothing ----------------------------------------------------------------

    @Test
    void theManagerApprovalKeysShipTheDefaultsThatChangeNothing() {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL).defaultValue()).isEqualTo("NEVER");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL).allowed()).containsExactly("NEVER", "HIGH_PRIORITY", "ALWAYS");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_RESUMES_MANAGER_REVIEW).defaultValue()).isEqualTo("false");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_EXPIRY_DAYS).defaultValue()).isEqualTo("7");
        assertThat(settings.managerApproval(ORG)).isEqualTo("NEVER");
        assertThat(settings.managerReview(ORG)).isFalse();
        assertThat(settings.approvalExpiryDays(ORG)).isEqualTo(7);
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("WARN");
    }

    @Test
    void requireApprovalIsAValidDuplicatePolicyAndAnOrganizationOverrideWins() {
        override(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY, "\"REQUIRE_APPROVAL\"");
        override(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL, "\"HIGH_PRIORITY\"");
        override(EnterpriseSettingKeys.ORG_RESUMES_MANAGER_REVIEW, "true");
        override(EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_EXPIRY_DAYS, "14");
        assertThat(settings.duplicatePolicy(ORG)).isEqualTo("REQUIRE_APPROVAL");
        assertThat(settings.managerApproval(ORG)).isEqualTo("HIGH_PRIORITY");
        assertThat(settings.managerReview(ORG)).isTrue();
        assertThat(settings.approvalExpiryDays(ORG)).isEqualTo(14);
    }

    @Test
    void aMalformedManagerApprovalOverrideFallsBackToHoldingNothing() {
        override(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL, "\"SOMETIMES\"");
        override(EnterpriseSettingKeys.ORG_RESUMES_MANAGER_REVIEW, "maybe");
        override(EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_EXPIRY_DAYS, "400");
        assertThat(settings.managerApproval(ORG)).isEqualTo("NEVER");
        assertThat(settings.managerReview(ORG)).isFalse();
        assertThat(settings.approvalExpiryDays(ORG)).isEqualTo(7);
        when(platform.getString(EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL)).thenThrow(new IllegalStateException("unreadable"));
        assertThat(settings.managerApproval(null)).isEqualTo("NEVER");
    }
}
