package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class MatchingBatchSettingsTest {

    private final OrgSettingRepository orgSettings = mock(OrgSettingRepository.class);
    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);
    private final MatchingBatchSettings batchSettings = new MatchingBatchSettings(orgSettings, settings);

    @Test
    void defaultIsTwentyAndOrganizationMayOverrideItWithinBounds() {
        when(settings.getInt(EnterpriseSettingKeys.MATCHING_BATCH_SIZE)).thenReturn(20);
        assertThat(batchSettings.maxFor(7L)).isEqualTo(20);

        OrgSetting override = new OrgSetting();
        override.setValueJson("37");
        when(orgSettings.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.MATCHING_BATCH_SIZE)).thenReturn(Optional.of(override));
        assertThat(batchSettings.maxFor(7L)).isEqualTo(37);
    }

    @Test
    void invalidGlobalOrOrganizationValuesFallBackSafely() {
        when(settings.getInt(EnterpriseSettingKeys.MATCHING_BATCH_SIZE)).thenReturn(0);
        assertThat(batchSettings.maxFor(7L)).isEqualTo(20);

        OrgSetting override = new OrgSetting();
        override.setValueJson("101");
        when(orgSettings.findByOrgIdAndSettingKey(7L, EnterpriseSettingKeys.MATCHING_BATCH_SIZE)).thenReturn(Optional.of(override));
        assertThat(batchSettings.maxFor(7L)).isEqualTo(20);
    }
}
