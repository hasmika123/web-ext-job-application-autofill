package com.dossier.api.service.ent.marketing;

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

/**
 * The knobs of planned handovers and cover (Sprint 2 / H-assign), all admin-configured with safe defaults: temporary cover lasts at most 90 days, a handover may be
 * planned 180 days ahead, and the licence allowance {@code consultants.max} is OFF (0) until an administrator sets it. An organization's own value wins when it is valid.
 */
class MarketingSettingsScheduleTest {

    static final Long ORG = 7L;

    OrgSettingRepository orgSettings = mock(OrgSettingRepository.class);
    ResumeBuilderSettings platform = mock(ResumeBuilderSettings.class);
    MarketingSettings settings = new MarketingSettings(orgSettings, platform);

    @BeforeEach
    void defaults() {
        when(platform.getInt(EnterpriseSettingKeys.ORG_ASSIGNMENTS_DELEGATE_MAX_DAYS)).thenReturn(90);
        when(platform.getInt(EnterpriseSettingKeys.ORG_ASSIGNMENTS_SCHEDULE_MAX_DAYS)).thenReturn(180);
        when(platform.getInt(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX)).thenReturn(0);
    }

    void override(String key, String json) {
        OrgSetting s = new OrgSetting();
        s.setValueJson(json);
        when(orgSettings.findByOrgIdAndSettingKey(ORG, key)).thenReturn(Optional.of(s));
    }

    @Test
    void theRegistryShipsTheSafeDefaults() {
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_ASSIGNMENTS_DELEGATE_MAX_DAYS).defaultValue()).isEqualTo("90");
        assertThat(EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_ASSIGNMENTS_SCHEDULE_MAX_DAYS).defaultValue()).isEqualTo("180");
        var licence = EnterpriseSettingKeys.find(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX);
        assertThat(licence.defaultValue()).as("the licence cap is off until an administrator sets it").isEqualTo("0");
        assertThat(licence.min()).isZero();
        assertThat(licence.description()).contains("consultants.max");
    }

    @Test
    void withoutAnOverrideThePlatformValueApplies() {
        assertThat(settings.delegateMaxDays(ORG)).isEqualTo(90);
        assertThat(settings.scheduleMaxDays(ORG)).isEqualTo(180);
        assertThat(settings.consultantsMax(ORG)).isZero();
        assertThat(settings.consultantsMax(null)).isZero();
    }

    @Test
    void anOrganizationOverrideWinsWhenValid() {
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_DELEGATE_MAX_DAYS, "30");
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_SCHEDULE_MAX_DAYS, "365");
        override(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX, "12");
        assertThat(settings.delegateMaxDays(ORG)).isEqualTo(30);
        assertThat(settings.scheduleMaxDays(ORG)).isEqualTo(365);
        assertThat(settings.consultantsMax(ORG)).isEqualTo(12);
    }

    @Test
    void aMalformedOrOutOfRangeOverrideIsIgnored() {
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_DELEGATE_MAX_DAYS, "9999");
        override(EnterpriseSettingKeys.ORG_ASSIGNMENTS_SCHEDULE_MAX_DAYS, "soon");
        override(EnterpriseSettingKeys.ORG_LICENSE_CONSULTANTS_MAX, "-4");
        assertThat(settings.delegateMaxDays(ORG)).isEqualTo(90);
        assertThat(settings.scheduleMaxDays(ORG)).isEqualTo(180);
        assertThat(settings.consultantsMax(ORG)).isZero();
    }
}
