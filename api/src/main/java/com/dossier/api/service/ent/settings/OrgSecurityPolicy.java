package com.dossier.api.service.ent.settings;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * An organization's own Security choices (Organization Settings, X2.9) and the platform bounds they must stay inside. The organization's value
 * lives in its {@code org_setting} row; a missing, malformed or out-of-bounds row reads as "not set" (the platform behaviour), so tightening the
 * platform bounds later never leaves an organization on a value it could no longer choose. Readers are the sign-in/refresh path (idle timeout) and
 * the reset/change-password path (minimum length) of that organization's own host.
 */
@Service
public class OrgSecurityPolicy {

    /** The platform's own password rule (ManagedUserVM), which no organization can go under. */
    public static final int PLATFORM_PASSWORD_MIN = 4;

    public record Bounds(int sessionMin, int sessionMax, int passwordFloor, int passwordCeiling) {}

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public OrgSecurityPolicy(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    public Bounds bounds() {
        int sMin = settings.getInt(EnterpriseSettingKeys.ORG_SECURITY_SESSION_TIMEOUT_MIN_MINUTES);
        int sMax = Math.max(sMin, settings.getInt(EnterpriseSettingKeys.ORG_SECURITY_SESSION_TIMEOUT_MAX_MINUTES));
        int floor = Math.max(PLATFORM_PASSWORD_MIN, settings.getInt(EnterpriseSettingKeys.ORG_SECURITY_PASSWORD_MIN_LENGTH_FLOOR));
        int ceiling = Math.max(floor, settings.getInt(EnterpriseSettingKeys.ORG_SECURITY_PASSWORD_MIN_LENGTH_CEILING));
        return new Bounds(sMin, sMax, floor, ceiling);
    }

    public int reasonMinChars() {
        return settings.getInt(EnterpriseSettingKeys.ORG_SETTINGS_REASON_MIN_CHARS);
    }

    /** The organization's own idle-session timeout in minutes, when it set one inside the bounds. */
    public Optional<Integer> sessionTimeoutMinutes(Long orgId) {
        Bounds b = bounds();
        return stored(orgId, EnterpriseSettingKeys.ORG_SECURITY_SESSION_TIMEOUT_MINUTES).filter(n -> n >= b.sessionMin() && n <= b.sessionMax());
    }

    /** The organization's own password minimum, when it set one inside the bounds. */
    public Optional<Integer> ownPasswordMinLength(Long orgId) {
        Bounds b = bounds();
        return stored(orgId, EnterpriseSettingKeys.ORG_SECURITY_PASSWORD_MIN_LENGTH).filter(n -> n >= b.passwordFloor() && n <= b.passwordCeiling());
    }

    /** The shortest password accepted for an account of this organization: its own minimum, else the platform's. */
    public int passwordMinLength(Long orgId) {
        if (orgId == null) return PLATFORM_PASSWORD_MIN;
        return ownPasswordMinLength(orgId).orElse(PLATFORM_PASSWORD_MIN);
    }

    /** Seconds a refresh token of an organization session may live: the smaller of {@code platformSeconds} and the organization's idle timeout. */
    public long refreshSeconds(Long orgId, long platformSeconds) {
        if (orgId == null) return platformSeconds;
        return sessionTimeoutMinutes(orgId).map(m -> Math.min(platformSeconds, m * 60L)).orElse(platformSeconds);
    }

    private Optional<Integer> stored(Long orgId, String key) {
        if (orgId == null) return Optional.empty();
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .flatMap(v -> {
                try {
                    return Optional.of(Integer.parseInt(v.strip()));
                } catch (NumberFormatException e) {
                    return Optional.empty();
                }
            });
    }
}
