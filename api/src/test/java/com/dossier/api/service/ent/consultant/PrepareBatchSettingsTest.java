package com.dossier.api.service.ent.consultant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** The Prepare selected openings settings and the entitlement seam (docs/enterprise-v2/63 section 1): defaults from the registry, organization overrides, the switch. */
class PrepareBatchSettingsTest {

    private final OrgSettingRepository orgSettings = mock(OrgSettingRepository.class);
    private final ResumeBuilderSettings platform = mock(ResumeBuilderSettings.class);
    private final PrepareBatchSettings settings = new PrepareBatchSettings(orgSettings, platform);

    private void org(String key, String value) {
        OrgSetting s = new OrgSetting();
        s.setOrgId(5L);
        s.setSettingKey(key);
        s.setValueJson(value);
        when(orgSettings.findByOrgIdAndSettingKey(5L, key)).thenReturn(Optional.of(s));
    }

    @Test
    void theRegistryDeclaresTheContractDefaults() {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.PREPARE_ENABLED).defaultValue()).isEqualTo("false");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.PREPARE_DAILY_CAP).defaultValue()).isEqualTo("30");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.PREPARE_MONTHLY_CAP).defaultValue()).isEqualTo("300");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.PREPARE_MAX_BATCH).defaultValue()).isEqualTo("10");
        assertThat(EnterpriseSettingKeys.all().stream().map(k -> k.key())).contains("enterprise.autopilot.prepare.enabled", "enterprise.autopilot.prepare.session_minutes");
    }

    @Test
    void offUntilThePlatformSwitchesItOn() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(false);
        assertThat(settings.enabledFor(5L)).isFalse();
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(true);
        assertThat(settings.enabledFor(5L)).isTrue();
        assertThat(settings.enabledFor(null)).isFalse();
    }

    @Test
    void anUnreadableSwitchFailsClosed() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenThrow(new IllegalStateException("boom"));
        assertThat(settings.enabledFor(5L)).isFalse();
    }

    @Test
    void anOrganizationCanOnlySwitchItOff() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(true);
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "false");
        assertThat(settings.enabledFor(5L)).isFalse();
        // and it can not switch on what the platform has off
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(false);
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        assertThat(settings.enabledFor(5L)).isFalse();
    }

    @Test
    void capsComeFromTheOrganizationThenThePlatformAndIgnoreBadOrOutOfRangeValues() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_DAILY_CAP)).thenReturn(30);
        assertThat(settings.dailyCap(5L)).isEqualTo(30);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "12");
        assertThat(settings.dailyCap(5L)).isEqualTo(12);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "5000");
        assertThat(settings.dailyCap(5L)).as("above the registry maximum").isEqualTo(30);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "lots");
        assertThat(settings.dailyCap(5L)).isEqualTo(30);
    }

    @Test
    void anUnreadablePlatformNumberFallsBackToTheRegistryDefault() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_MAX_BATCH)).thenThrow(new IllegalStateException("boom"));
        assertThat(settings.maxBatch(5L)).isEqualTo(10);
    }

    @Test
    void theEntitlementSeamIsAllowedUnlessTheSwitchIsOff() {
        PrepareBatchEntitlement entitlement = new PrepareBatchEntitlement(settings);
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(true);
        assertThat(entitlement.check(5L, 9L).allowed()).isTrue();
        assertThat(entitlement.check(5L, null).allowed()).isFalse();
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(false);
        PrepareBatchEntitlement.Decision off = entitlement.check(5L, 9L);
        assertThat(off.allowed()).isFalse();
        assertThat(off.reason()).isEqualTo("FEATURE_OFF");
    }

    @Test
    void anEventMapsToTheStateThePageShows() {
        assertThat(ConPrepareService.stateOf("OPENED")).isEqualTo("OPENED");
        assertThat(ConPrepareService.stateOf("PREFILLED")).isEqualTo("FILLED");
        assertThat(ConPrepareService.stateOf("NEEDS_INPUT")).isEqualTo("NEEDS_INPUT");
        assertThat(ConPrepareService.stateOf("SUBMIT_DETECTED")).isEqualTo("SUBMITTED");
        assertThat(ConPrepareService.stateOf("CLOSED")).isEqualTo("CLOSED");
        assertThat(ConPrepareService.stateOf("FAILED")).isEqualTo("FAILED");
        assertThat(ConPrepareService.EVENTS).containsExactly("OPENED", "PREFILLED", "NEEDS_INPUT", "SUBMIT_DETECTED", "CLOSED", "FAILED");
    }
}
