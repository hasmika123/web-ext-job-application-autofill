package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.util.Locale;
import java.util.Optional;
import org.springframework.stereotype.Service;

/**
 * Reads the display cap of an organization, {@code enterprise.jobs.detail_cap} (docs/enterprise-v2/60 section 10): the organization's own
 * {@code org_setting} row, then the platform value (admin Settings page), then the registry default {@code MINIMAL}. A malformed value anywhere
 * falls back to the next source and ends at {@code MINIMAL}: the cap can only fail towards showing less.
 *
 * <p>Read side only. There is no organization-level write path for {@code org_setting} yet (only the invitation key is read from it, and nothing
 * writes it), so no {@code CAP_CHANGED} ledger event is written today; when an admin screen for this setting is added it must append
 * {@code JobDataLedger.capChanged(...)} for every job of the organization in the same transaction as the write (see doc 61 section 3).
 */
@Service
public class JobDetailCap {

    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;

    public JobDetailCap(OrgSettingRepository orgSettings, ResumeBuilderSettings settings) {
        this.orgSettings = orgSettings;
        this.settings = settings;
    }

    /** {@code MINIMAL} or {@code FULL} for the organization. */
    public String capFor(Long orgId) {
        if (orgId != null) {
            Optional<String> override = orgSettings.findByOrgIdAndSettingKey(orgId, EnterpriseSettingKeys.JOBS_DETAIL_CAP).map(OrgSetting::getValueJson).flatMap(JobDetailCap::parse);
            if (override.isPresent()) return override.get();
        }
        String platform;
        try {
            platform = settings.getString(EnterpriseSettingKeys.JOBS_DETAIL_CAP);
        } catch (RuntimeException unreadable) {
            return JobDetailMapper.MINIMAL;
        }
        return parse(platform).orElse(JobDetailMapper.MINIMAL);
    }

    /** {@code MINIMAL}/{@code FULL}, as a bare word or a JSON string; empty for anything else. */
    static Optional<String> parse(String raw) {
        if (raw == null) return Optional.empty();
        String v = raw.strip();
        if (v.length() >= 2 && v.startsWith("\"") && v.endsWith("\"")) v = v.substring(1, v.length() - 1);
        v = v.toUpperCase(Locale.ROOT);
        return v.equals(JobDetailMapper.MINIMAL) || v.equals(JobDetailMapper.FULL) ? Optional.of(v) : Optional.empty();
    }
}
