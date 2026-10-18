package com.dossier.api.service.ent.interviews;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/**
 * The Interviews limits an organization may tune (admin Settings page, overridable per organization in {@code org_setting}): how long a
 * status change may be undone, how many interviewers one interview lists, the minutes before a reminder may be requested again and the
 * longest interview. Resolution: the organization's own row, then the global value, then the registry default; a malformed or
 * out-of-range override is ignored (the same rule as {@code MarketingSettings}).
 */
@Service
public class InterviewSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public InterviewSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public int undoMinutes(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_INTERVIEWS_UNDO_MINUTES);
    }

    public int maxInterviewers(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_INTERVIEWS_MAX_INTERVIEWERS);
    }

    public int reminderCooldownMinutes(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_INTERVIEWS_REMINDER_COOLDOWN_MINUTES);
    }

    public int maxDurationMinutes(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_INTERVIEWS_MAX_DURATION_MINUTES);
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
