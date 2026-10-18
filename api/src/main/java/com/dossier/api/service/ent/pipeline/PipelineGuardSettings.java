package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The knobs of the assignment guards (Sprint 2 / B1), read per organization: the organization's own {@code org_setting} row, then the platform value
 * (admin Settings page), then the registry default. A malformed or out-of-range override is ignored (the next source applies), the same rule as
 * {@code MarketingSettings}. Nothing is hard-coded: the defaults live in {@link EnterpriseSettingKeys}.
 */
@Service
public class PipelineGuardSettings {

    public static final String WARN = "WARN";
    public static final String BLOCK = "BLOCK";
    /** MM-02: the override of a duplicate warning is sent to a Marketing Manager (deferred/marketing-manager.md section 4.1.1). */
    public static final String REQUIRE_APPROVAL = "REQUIRE_APPROVAL";
    /** MM-02: when assigning an opportunity waits for a manager. */
    public static final String APPROVAL_NEVER = "NEVER";
    public static final String APPROVAL_HIGH_PRIORITY = "HIGH_PRIORITY";
    public static final String APPROVAL_ALWAYS = "ALWAYS";

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public PipelineGuardSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** {@code WARN} (default), {@code BLOCK} or {@code REQUIRE_APPROVAL}. */
    public String duplicatePolicy(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_PIPELINE_DUPLICATE_POLICY;
        Optional<String> own = override(orgId, key).flatMap(PipelineGuardSettings::policy);
        if (own.isPresent()) return own.get();
        try {
            return policy(settings.getString(key)).orElse(WARN);
        } catch (RuntimeException unreadable) {
            return WARN; // fails towards asking, never towards silently allowing or refusing
        }
    }

    /** {@code NEVER} (default: nothing is held), {@code HIGH_PRIORITY} or {@code ALWAYS}: when assigning an opportunity waits for a Marketing Manager. */
    public String managerApproval(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_PIPELINE_MANAGER_APPROVAL;
        Optional<String> own = override(orgId, key).flatMap(PipelineGuardSettings::approvalMode);
        if (own.isPresent()) return own.get();
        try {
            return approvalMode(settings.getString(key)).orElse(APPROVAL_NEVER);
        } catch (RuntimeException unreadable) {
            return APPROVAL_NEVER; // an unreadable setting holds nothing: today's behaviour
        }
    }

    /** Whether a marketer-made resume is reviewed by a manager before the consultant is asked (default false). */
    public boolean managerReview(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_RESUMES_MANAGER_REVIEW;
        Optional<Boolean> own = override(orgId, key).map(v -> v.strip().replace("\"", "").toLowerCase(Locale.ROOT)).filter(v -> v.equals("true") || v.equals("false")).map(Boolean::parseBoolean);
        if (own.isPresent()) return own.get();
        try {
            return settings.getBool(key);
        } catch (RuntimeException unreadable) {
            return false;
        }
    }

    /** Days a manager approval request waits before it expires (1 to 30, default 7). */
    public int approvalExpiryDays(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_APPROVAL_EXPIRY_DAYS);
    }

    /** Days within which the same role through another vendor counts as a duplicate. */
    public int sameClientWindowDays(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_SAME_CLIENT_WINDOW_DAYS);
    }

    /** Most consultants that may hold one posting at once; 0 = off. */
    public int maxPerRequirement(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_MAX_PER_REQUIREMENT);
    }

    /** Most open opportunities one consultant may hold; 0 = off. */
    public int openMatchesMax(Long orgId) {
        return intValue(orgId, EnterpriseSettingKeys.ORG_PIPELINE_OPEN_MATCHES_MAX);
    }

    /** Whether open work follows a consultant to a new marketer. */
    public boolean handoverOpenWork(Long orgId) {
        String key = EnterpriseSettingKeys.ORG_ASSIGNMENTS_HANDOVER_OPEN_WORK;
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

    static Optional<String> policy(String raw) {
        if (raw == null) return Optional.empty();
        String v = raw.strip();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
        v = v.toUpperCase(Locale.ROOT);
        return v.equals(WARN) || v.equals(BLOCK) || v.equals(REQUIRE_APPROVAL) ? Optional.of(v) : Optional.empty();
    }

    static Optional<String> approvalMode(String raw) {
        if (raw == null) return Optional.empty();
        String v = raw.strip();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
        v = v.toUpperCase(Locale.ROOT);
        return v.equals(APPROVAL_NEVER) || v.equals(APPROVAL_HIGH_PRIORITY) || v.equals(APPROVAL_ALWAYS) ? Optional.of(v) : Optional.empty();
    }
}
