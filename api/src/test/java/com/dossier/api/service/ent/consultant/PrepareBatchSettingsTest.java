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

/**
 * The Prepare selected openings settings (docs/enterprise-v2/63 section 1 and the 2026-10-18 decision): the platform value is the master switch and the
 * maximum, the organization opts in itself (off by default) and may hold lower numbers, clamped on every read.
 */
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
    void offUntilThePlatformSwitchesItOnAndTheOrganizationOptsInItself() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(false);
        assertThat(settings.enabledFor(5L)).isFalse();
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(true);
        assertThat(settings.platformEnabled()).isTrue();
        assertThat(settings.orgEnabled(5L)).as("no row = the organization has not opted in").isFalse();
        assertThat(settings.enabledFor(5L)).as("platform on, organization silent: off").isFalse();
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        assertThat(settings.enabledFor(5L)).isTrue();
        assertThat(settings.enabledFor(null)).isFalse();
    }

    @Test
    void anUnreadableSwitchFailsClosed() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenThrow(new IllegalStateException("boom"));
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        assertThat(settings.platformEnabled()).isFalse();
        assertThat(settings.enabledFor(5L)).isFalse();
    }

    @Test
    void theOrganizationSwitchNeedsBothAndAnythingButTrueIsOff() {
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(true);
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "false");
        assertThat(settings.enabledFor(5L)).isFalse();
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "yes please");
        assertThat(settings.enabledFor(5L)).isFalse();
        // the organization can not switch on what the platform has off
        when(platform.getBool(EnterpriseSettingKeys.PREPARE_ENABLED)).thenReturn(false);
        org(EnterpriseSettingKeys.PREPARE_ENABLED, "true");
        assertThat(settings.enabledFor(5L)).isFalse();
    }

    @Test
    void capsComeFromTheOrganizationClampedIntoTheRangeAndIgnoreMalformedValues() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_DAILY_CAP)).thenReturn(30);
        assertThat(settings.dailyCap(5L)).isEqualTo(30);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "12");
        assertThat(settings.dailyCap(5L)).isEqualTo(12);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "5000");
        assertThat(settings.dailyCap(5L)).as("above the platform maximum: clamped to it").isEqualTo(30);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "0");
        assertThat(settings.dailyCap(5L)).as("below the registry minimum: clamped up").isEqualTo(1);
        org(EnterpriseSettingKeys.PREPARE_DAILY_CAP, "lots");
        assertThat(settings.dailyCap(5L)).isEqualTo(30);
    }

    @Test
    void loweringThePlatformMaximumLowersEveryOrganization() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_MONTHLY_CAP)).thenReturn(300);
        org(EnterpriseSettingKeys.PREPARE_MONTHLY_CAP, "250");
        assertThat(settings.monthlyCap(5L)).isEqualTo(250);
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_MONTHLY_CAP)).thenReturn(100);
        assertThat(settings.monthlyCap(5L)).isEqualTo(100);
        assertThat(settings.platformMax(EnterpriseSettingKeys.PREPARE_MONTHLY_CAP)).isEqualTo(100);
    }

    @Test
    void anUnreadablePlatformNumberFallsBackToTheRegistryDefault() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_MAX_BATCH)).thenThrow(new IllegalStateException("boom"));
        assertThat(settings.maxBatch(5L)).isEqualTo(10);
        assertThat(settings.platformMax(EnterpriseSettingKeys.PREPARE_MAX_BATCH)).isEqualTo(10);
    }

    @Test
    void theSessionLengthStaysAnOrganizationOverrideInsideTheRegistryRange() {
        when(platform.getInt(EnterpriseSettingKeys.PREPARE_SESSION_MINUTES)).thenReturn(240);
        assertThat(settings.sessionMinutes(5L)).isEqualTo(240);
        org(EnterpriseSettingKeys.PREPARE_SESSION_MINUTES, "60");
        assertThat(settings.sessionMinutes(5L)).isEqualTo(60);
        org(EnterpriseSettingKeys.PREPARE_SESSION_MINUTES, "99999");
        assertThat(settings.sessionMinutes(5L)).as("out of the registry range: the platform value").isEqualTo(240);
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
