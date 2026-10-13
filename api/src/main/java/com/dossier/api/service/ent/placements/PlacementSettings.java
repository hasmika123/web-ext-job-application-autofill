package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.ent.PlacementDTO;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/**
 * The windows of the Placements board, all admin-configured: how many days ahead a placement counts as ending soon, how close an end date turns red,
 * and how far ahead a start counts as starting soon. Resolution per key: the organization's own {@code org_setting} row, then the global registry
 * value (admin Settings page), then the registry default. A malformed or out-of-range override is ignored (the global value applies).
 */
@Service
public class PlacementSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public PlacementSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public int endingSoonDays(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_PLACEMENTS_ENDING_SOON_DAYS);
    }

    public int endingUrgentDays(Long orgId) {
        return Math.min(resolve(orgId, EnterpriseSettingKeys.ORG_PLACEMENTS_ENDING_URGENT_DAYS), endingSoonDays(orgId));
    }

    public int startingSoonDays(Long orgId) {
        return resolve(orgId, EnterpriseSettingKeys.ORG_PLACEMENTS_STARTING_SOON_DAYS);
    }

    public PlacementDTO.Windows windows(Long orgId) {
        return new PlacementDTO.Windows(endingSoonDays(orgId), endingUrgentDays(orgId), startingSoonDays(orgId));
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
