package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import org.springframework.stereotype.Service;

/**
 * Reads the Prepare selected openings settings (docs/enterprise-v2/63 section 1): the organization's own {@code org_setting} row, then the platform value
 * (admin Settings page), then the registry default. A malformed or out-of-range organization value falls back to the platform value; an unreadable platform
 * value fails towards "off" and to the registry default. Nothing here is hard-coded.
 */
@Service
public class PrepareBatchSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public PrepareBatchSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** The platform switch AND the organization has not switched it off. */
    public boolean enabledFor(Long orgId) {
        boolean platform;
        try {
            platform = settings.getBool(EnterpriseSettingKeys.PREPARE_ENABLED);
        } catch (RuntimeException unreadable) {
            return false;
        }
        if (!platform) return false;
        if (orgId == null) return false;
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.PREPARE_ENABLED)
            .map(OrgSetting::getValueJson)
            .map(v -> !"false".equals(v == null ? "" : v.strip().toLowerCase(Locale.ROOT)))
            .orElse(true);
    }

    public int dailyCap(Long orgId) {
        return intFor(orgId, EnterpriseSettingKeys.PREPARE_DAILY_CAP);
    }

    public int monthlyCap(Long orgId) {
        return intFor(orgId, EnterpriseSettingKeys.PREPARE_MONTHLY_CAP);
    }

    public int maxBatch(Long orgId) {
        return intFor(orgId, EnterpriseSettingKeys.PREPARE_MAX_BATCH);
    }

    public int sessionMinutes(Long orgId) {
        return intFor(orgId, EnterpriseSettingKeys.PREPARE_SESSION_MINUTES);
    }

    private int intFor(Long orgId, String key) {
        var def = EnterpriseSettingKeys.find(key);
        int global;
        try {
            global = settings.getInt(key);
        } catch (RuntimeException unreadable) {
            global = Integer.parseInt(def.defaultValue().strip()); // the registry default is the declared fallback
        }
        if (orgId == null) return global;
        int platform = global;
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .map(v -> {
                try {
                    int n = Integer.parseInt(v.strip());
                    boolean inRange = def == null || ((def.min() == null || n >= def.min()) && (def.max() == null || n <= def.max()));
                    return inRange ? n : platform;
                } catch (RuntimeException e) {
                    return platform;
                }
            })
            .orElse(platform);
    }
}
