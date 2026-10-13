package com.dossier.api.service.org;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The invitation settings that an organization may override (X1.15). Resolution order for a key: the organization's own
 * {@code org_setting} row, then the global registry value (admin Settings page), then the registry default. A malformed override is
 * ignored (it can only fall back to the safer global value, never silently widen).
 */
@Service
public class InviteSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public InviteSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** Whether an invitation can only be accepted by the account whose email is the invited address (E7, default true). */
    public boolean requireEmailMatch(Long orgId) {
        Optional<Boolean> override = orgId == null ? Optional.empty() : orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.ORG_INVITE_REQUIRE_EMAIL_MATCH).map(OrgSetting::getValueJson).flatMap(InviteSettings::parseBool);
        return override.orElseGet(() -> settings.getBool(EnterpriseSettingKeys.ORG_INVITE_REQUIRE_EMAIL_MATCH));
    }

    private static Optional<Boolean> parseBool(String json) {
        if (json == null) return Optional.empty();
        return switch (json.strip().toLowerCase(java.util.Locale.ROOT)) {
            case "true" -> Optional.of(true);
            case "false" -> Optional.of(false);
            default -> Optional.empty();
        };
    }
}
