package com.dossier.api.service.ent.marketing;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/**
 * The Marketing Assignments limits an organization may tune: the overload threshold (percent of capacity), the bulk cap and the
 * highest capacity of one marketer. Resolution order per key: the organization's own {@code org_setting} row, then the global
 * registry value (admin Settings page), then the registry default. A malformed or out-of-range override is ignored (the global
 * value applies), the same rule as {@code InviteSettings}.
 */
@Service
public class MarketingSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public MarketingSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** A marketer is overloaded at or above this percent of capacity (default 90). */
    public int overloadPct(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_MARKETING_OVERLOAD_PCT);
    }

    /** Most consultants one change may name (default 200). */
    public int bulkMax(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_MARKETING_BULK_MAX);
    }

    /** Highest capacity a marketer may be given (default 200). */
    public int capacityMax(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_MARKETING_CAPACITY_MAX);
    }

    private int resolve(Long orgId, String key) {
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
