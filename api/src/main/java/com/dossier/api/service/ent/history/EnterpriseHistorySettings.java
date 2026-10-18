package com.dossier.api.service.ent.history;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/**
 * How long an organization keeps its application, interview and submission history (docs/change-audit/README.md section 4.4).
 * Resolution: the organization's own {@code org_setting} row, then the global registry value (admin Settings page), then the registry default
 * (0 = for the life of the record). A malformed or out-of-range override is ignored (the global value applies), the same rule as the other
 * organization settings.
 */
@Service
public class EnterpriseHistorySettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public EnterpriseHistorySettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** Months of history kept for {@code orgId}; 0 keeps it for the life of the record. */
    public int retentionMonths(Long orgId) {
        return months(orgId, EnterpriseSettingKeys.HISTORY_RETENTION_MONTHS);
    }

    /** Months a Marketing Manager approval request or escalation is kept for {@code orgId} (registry default 36); 0 keeps it for the life of the organization. */
    public int mktMgmtMonths(Long orgId) {
        return months(orgId, EnterpriseSettingKeys.HISTORY_MKT_MGMT_MONTHS);
    }

    private int months(Long orgId, String key) {
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
