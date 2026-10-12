package com.dossier.api.service.org;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** E2E-O1.9: an admin-stored value wins, otherwise the property default decides; a broken settings read keeps orgs dark. */
class OrgFeatureFlagTest {

    private final ResumeBuilderSettings settings = mock(ResumeBuilderSettings.class);

    @Test
    void theDeclaredDefaultOfTheSettingIsOff() {
        assertThat(ResumeBuilderSettingKeys.require(ResumeBuilderSettingKeys.FEATURE_ORGS).defaultValue()).isEqualTo("false");
    }

    @Test
    void withNothingStoredThePropertyDecides() {
        when(settings.getStoredBool(ResumeBuilderSettingKeys.FEATURE_ORGS)).thenReturn(Optional.empty());
        assertThat(new OrgFeatureFlag(settings, false).isEnabled()).isFalse();
        assertThat(new OrgFeatureFlag(settings, true).isEnabled()).isTrue();
    }

    @Test
    void aStoredAdminValueBeatsTheProperty() {
        when(settings.getStoredBool(ResumeBuilderSettingKeys.FEATURE_ORGS)).thenReturn(Optional.of(true));
        assertThat(new OrgFeatureFlag(settings, false).isEnabled()).isTrue();
        when(settings.getStoredBool(ResumeBuilderSettingKeys.FEATURE_ORGS)).thenReturn(Optional.of(false));
        assertThat(new OrgFeatureFlag(settings, true).isEnabled()).isFalse();
    }

    @Test
    void ifTheSettingsCannotBeReadOrgsStayDark() {
        when(settings.getStoredBool(ResumeBuilderSettingKeys.FEATURE_ORGS)).thenThrow(new IllegalStateException("db down"));
        assertThat(new OrgFeatureFlag(settings, true).isEnabled()).isFalse();
    }
}
