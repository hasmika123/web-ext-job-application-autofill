package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import org.springframework.stereotype.Service;

/** Resolves the per-run matching cap: organization override, then the platform setting. */
@Service
public final class MatchingBatchSettings {

    public static final int DEFAULT = 20;

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public MatchingBatchSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public int maxFor(Long orgId) {
        int global = global();
        if (orgId == null) return global;
        return orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.MATCHING_BATCH_SIZE)
            .map(OrgSetting::getValueJson)
            .map(value -> valid(value, global))
            .orElse(global);
    }

    private int global() {
        try {
            int value = settings.getInt(EnterpriseSettingKeys.MATCHING_BATCH_SIZE);
            return value >= 1 && value <= 100 ? value : DEFAULT;
        } catch (RuntimeException ignored) {
            return DEFAULT;
        }
    }

    private static int valid(String raw, int fallback) {
        try {
            int value = Integer.parseInt(raw == null ? "" : raw.strip());
            return value >= 1 && value <= 100 ? value : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }
}
