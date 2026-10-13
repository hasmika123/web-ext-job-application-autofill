package com.dossier.api.service.ent.clients;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.List;
import java.util.Locale;
import org.springframework.stereotype.Service;

/**
 * The Clients page's tunable rules: the day counts behind the health badge and the consumer mail domains a contact may not use.
 * Resolution order per key: the organization's own {@code org_setting} row, then the global registry value (admin Settings page),
 * then the registry default. A malformed or out-of-range override is ignored (the global value applies), like {@code MarketingSettings}.
 * The two day counts are returned as a consistent pair: At Risk is always strictly above Healthy.
 */
@Service
public class ClientsSettings {

    /** The two thresholds of {@link ClientHealth}. */
    public record Thresholds(int healthyDays, int atRiskDays) {}

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public ClientsSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public Thresholds thresholds(Long orgId) {
        int healthy = resolve(orgId, EnterpriseSettingKeys.ORG_CLIENTS_HEALTHY_DAYS);
        int atRisk = resolve(orgId, EnterpriseSettingKeys.ORG_CLIENTS_AT_RISK_DAYS);
        if (atRisk <= healthy) atRisk = healthy + 1;
        return new Thresholds(healthy, atRisk);
    }

    /** Lower-case domains a contact's e-mail may not belong to. */
    @SuppressWarnings("unchecked")
    public List<String> consumerDomains() {
        try {
            List<String> list = settings.getJson(EnterpriseSettingKeys.ORG_CLIENTS_CONSUMER_DOMAINS, List.class);
            return list == null ? List.of() : list.stream().map(s -> String.valueOf(s).toLowerCase(Locale.ROOT)).toList();
        } catch (RuntimeException e) {
            return List.of();
        }
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
