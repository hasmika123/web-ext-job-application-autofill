package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The knobs of the escalation rules (docs/enterprise-v2/deferred/marketing-manager.md section 4.2 and 7), read per organization: the organization's own
 * {@code org_setting} row, then the platform value (admin Settings page), then the registry default. A malformed or out-of-range override is ignored (the next
 * source applies), the same rule as {@code PipelineGuardSettings}. Nothing is hard-coded: the defaults live in {@link EnterpriseSettingKeys}.
 */
@Service
public class EscalationSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public EscalationSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** Days without activity after which an assigned opportunity is stalled (default 7). */
    public int stalledDays(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_STALLED_DAYS);
    }

    /** Days a follow-up may be overdue before it is escalated (default 3; 0 = at once). */
    public int followupOverdueDays(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_FOLLOWUP_OVERDUE_DAYS);
    }

    /** Hours a consultant's question may wait for the marketer's answer (default 48). */
    public int questionSlaHours(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_QUESTION_SLA_HOURS);
    }

    /** Hours an approval request may wait for a decision (default 24). */
    public int approvalSlaHours(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_SLA_HOURS);
    }

    /** One digest notice per manager per run (default true) instead of one per escalation. */
    public boolean digest(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_MGMT_ESCALATION_DIGEST;
        Optional<Boolean> own = override(orgId, key).map(v -> v.strip().replace("\"", "").toLowerCase(Locale.ROOT)).filter(v -> v.equals("true") || v.equals("false")).map(Boolean::parseBoolean);
        if (own.isPresent()) return own.get();
        try {
            return settings.getBool(key);
        } catch (RuntimeException unreadable) {
            return true;
        }
    }

    private int intValue(Long orgId, String key) {
        var def = EnterpriseSettingKeys.find(key);
        int global = settings.getInt(key);
        return override(orgId, key)
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

    private Optional<String> override(Long orgId, String key) {
        if (orgId == null) return Optional.empty();
        return orgSettings.findByOrgIdAndSettingKey(orgId, key).map(OrgSetting::getValueJson);
    }
}
