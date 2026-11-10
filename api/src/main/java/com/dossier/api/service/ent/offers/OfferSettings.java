package com.dossier.api.service.ent.offers;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/**
 * The offer windows, admin-configured: how many days an extended offer stays open when the org entered no deadline. Resolution: the organization's
 * own {@code org_setting} row, then the global registry value (admin Settings page), then the registry default. A malformed or out-of-range
 * override is ignored.
 */
@Service
public class OfferSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public OfferSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public int expiryDays(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_OFFERS_EXPIRY_DAYS;
        int global = settings.getInt(key);
        if (orgId == null) return global;
        var def = EnterpriseSettingKeys.find(key);
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .map(v -> {
                try {
                    int n = Integer.parseInt(v.strip());
                    boolean inRange = def == null || ((def.min() == null || n >= def.min()) && (def.max() == null || n <= def.max()));
                    return inRange ? n : global;
                } catch (NumberFormatException e) {
                    return global;
                }
            })
            .orElse(global);
    }
}
