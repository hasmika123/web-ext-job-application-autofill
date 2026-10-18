package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * The single reader of the Prepare selected openings settings (docs/enterprise-v2/63 section 1, and the 2026-10-18 decision that the Org Admin controls it).
 *
 * <ul>
 *   <li><b>Switch.</b> The platform value (admin Settings page) is the MASTER switch: it only makes the feature available. The organization then opts in
 *       itself with its own {@code org_setting} row of the same key, and that row is absent (= OFF) until its Org Admin turns it on. The feature is on for an
 *       organization only when the platform is ON and the organization is ON. An unreadable platform value fails towards off.</li>
 *   <li><b>Caps and batch size.</b> The platform value is the MAXIMUM. The organization may hold its own lower number; whatever is stored is clamped into
 *       {@code [registry minimum, platform value]} on every read, so lowering the platform value lowers every organization at once. A malformed row is ignored
 *       (the platform value applies).</li>
 *   <li>{@code session_minutes} stays a platform number an organization may override inside the registry range.</li>
 * </ul>
 * Nothing here is hard-coded: the registry declares defaults and bounds. The licence of the individual consultant is NOT decided here (see
 * {@link PrepareBatchEntitlement}).
 */
@Service
public class PrepareBatchSettings {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public PrepareBatchSettings(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** The master switch (admin Settings page); an unreadable value fails closed. */
    public boolean platformEnabled() {
        try {
            return settings.getBool(EnterpriseSettingKeys.PREPARE_ENABLED);
        } catch (RuntimeException unreadable) {
            return false;
        }
    }

    /** Whether the organization itself has opted in (its own row, {@code true}); absent or anything else is OFF. */
    public boolean orgEnabled(Long orgId) {
        if (orgId == null) return false;
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.PREPARE_ENABLED)
            .map(OrgSetting::getValueJson)
            .map(v -> "true".equals(v == null ? "" : v.strip().toLowerCase(Locale.ROOT)))
            .orElse(false);
    }

    /** The platform switch AND the organization's own opt-in. */
    public boolean enabledFor(Long orgId) {
        return orgId != null && platformEnabled() && orgEnabled(orgId);
    }

    public int dailyCap(Long orgId) {
        return capFor(orgId, EnterpriseSettingKeys.PREPARE_DAILY_CAP);
    }

    public int monthlyCap(Long orgId) {
        return capFor(orgId, EnterpriseSettingKeys.PREPARE_MONTHLY_CAP);
    }

    public int maxBatch(Long orgId) {
        return capFor(orgId, EnterpriseSettingKeys.PREPARE_MAX_BATCH);
    }

    public int sessionMinutes(Long orgId) {
        return intFor(orgId, EnterpriseSettingKeys.PREPARE_SESSION_MINUTES);
    }

    /** The platform maximum of one of the three organization-settable numbers (an unreadable value falls back to the registry default). */
    public int platformMax(String key) {
        var def = EnterpriseSettingKeys.find(key);
        try {
            int n = settings.getInt(key);
            if (def != null && def.min() != null && n < def.min()) return def.min().intValue();
            if (def != null && def.max() != null && n > def.max()) return def.max().intValue();
            return n;
        } catch (RuntimeException unreadable) {
            return Integer.parseInt(def.defaultValue().strip());
        }
    }

    /** The registry minimum of a number (what the organization can not go below). */
    public int registryMin(String key) {
        var def = EnterpriseSettingKeys.find(key);
        return def == null || def.min() == null ? 1 : def.min().intValue();
    }

    /** The organization's own stored number for a cap (not clamped), or empty when it has none or it is malformed. */
    public Optional<Integer> ownNumber(Long orgId, String key) {
        if (orgId == null) return Optional.empty();
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .flatMap(v -> {
                try {
                    return Optional.of(Integer.parseInt(v.strip()));
                } catch (RuntimeException e) {
                    return Optional.empty();
                }
            });
    }

    /** The number that applies to the organization: its own, clamped into [registry minimum, platform maximum], else the platform value. */
    private int capFor(Long orgId, String key) {
        int max = platformMax(key);
        int min = Math.min(registryMin(key), max);
        return ownNumber(orgId, key).map(n -> Math.max(min, Math.min(n, max))).orElse(max);
    }

    /** The old rule for the numbers an organization may override inside the registry range (session length). */
    private int intFor(Long orgId, String key) {
        var def = EnterpriseSettingKeys.find(key);
        int platform = platformMax(key);
        return ownNumber(orgId, key)
            .filter(n -> def == null || ((def.min() == null || n >= def.min()) && (def.max() == null || n <= def.max())))
            .orElse(platform);
    }
}
