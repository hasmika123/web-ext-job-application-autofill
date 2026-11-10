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
    }

    void override(String key, String json) {
        OrgSetting s = new OrgSetting();
        s.setValueJson(json);
        when(orgSettings.findByOrgIdAndSettingKey(ORG, key)).thenReturn(Optional.of(s));
    }

    @Test
    void theRegistryShipsTheSafeDefaults() {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY).defaultValue()).isEqualTo("WARN");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY).allowed()).containsExactly("WARN", "BLOCK");
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
}
