package com.dossier.api.service.org;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Whether organization features are switched on (APP-E2E-PLAN section 2.2, story E2E-O1.9).
 *
 * <p>The switch is the admin setting {@code feature.orgs.enabled} (the interim settings seam over {@code app_setting};
 * A5.3 later moves it to the registry key {@code flag.orgs} with the same meaning). When an admin has stored a value it
 * wins and takes effect within the settings cache window (a minute). When none is stored, the
 * {@code dossier.orgs.enabled} property decides: env {@code ORGS_ENABLED}, <b>false in production</b>, true under the
 * dev profile and in the test suite. So production ships dark, and flipping it on is one admin setting or one env var.
 *
 * <p>While it is off, every {@code /api/orgs/**}, {@code /api/join/**} and {@code /api/me/orgs/**} request answers the
 * same generic 404 as a missing org ({@code OrgsEnabledFilter}), and the web hides the org navigation.
 */
@Service
public class OrgFeatureFlag {

    private final ResumeBuilderSettings settings;
    private final boolean propertyDefault;

    public OrgFeatureFlag(ResumeBuilderSettings settings, @Value("${dossier.orgs.enabled:false}") boolean propertyDefault) {
        this.settings = settings;
        this.propertyDefault = propertyDefault;
    }

    public boolean isEnabled() {
        try {
            return settings.getStoredBool(ResumeBuilderSettingKeys.FEATURE_ORGS).orElse(propertyDefault);
        } catch (RuntimeException e) {
            return false; // fail closed: if the settings cannot be read, org features stay dark
        }
    }
}
