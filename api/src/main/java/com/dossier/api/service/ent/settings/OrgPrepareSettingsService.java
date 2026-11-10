package com.dossier.api.service.ent.settings;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.dto.ent.OrgPrepareSettingsDTO;
import com.dossier.api.service.ent.consultant.PrepareBatchEntitlement;
import com.dossier.api.service.ent.consultant.PrepareBatchSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Organization Settings page, "Prepare selected openings" section (decision 2026-10-18, docs/enterprise-v2/63 section 1). The Org Admin turns the feature
 * on for the organization (OFF by default) and may lower the daily limit, the monthly limit and the openings per batch; the platform's values are the
 * maximum. Values are stored in the organization's own {@code org_setting} rows under the same registry keys {@link PrepareBatchSettings} reads, so that class
 * stays the one reader. A number above the platform maximum is clamped to it (the reply shows what was kept); a number below the registry minimum or not a
 * whole number is a 422 naming the field; {@code null} puts a number back to following the platform. The organization is always the caller's authorised
 * seat's. Every change writes one {@code ORG_SETTINGS} audit row (who, when, old and new value). While the platform switch is off nothing can be changed (409).
 */
@Service
public class OrgPrepareSettingsService {

    static final Set<String> KEYS = Set.of("enabled", "dailyCap", "monthlyCap", "maxBatch");
    public static final String PLATFORM_OFF = "PREPARE_PLATFORM_OFF";
    /** The add-on's catalog name, shown so the Org Admin knows which license item to look for. */
    static final String FEATURE_NAME = "Autopilot prepare";

    private final OrganizationRepository organizations;
    private final OrgSettingRepository orgSettings;
    private final PrepareBatchSettings settings;
    private final PrepareBatchEntitlement entitlement;
    private final OrgAuditService audit;

    public OrgPrepareSettingsService(OrganizationRepository organizations, OrgSettingRepository orgSettings, PrepareBatchSettings settings, PrepareBatchEntitlement entitlement, OrgAuditService audit) {
        this.organizations = organizations;
        this.orgSettings = orgSettings;
        this.settings = settings;
        this.entitlement = entitlement;
        this.audit = audit;
    }

    @Transactional(readOnly = true)
    public OrgPrepareSettingsDTO get(OrgMembership me) {
        return view(load(me).getId());
    }

    @Transactional
    public OrgPrepareSettingsDTO save(OrgMembership me, JsonNode body) {
        if (body == null || !body.isObject()) throw OrgException.invalid("body", "must be an object");
        for (Iterator<String> it = body.fieldNames(); it.hasNext();) {
            String k = it.next();
            if (!KEYS.contains(k)) throw OrgException.invalid(k, "is not a setting you can change here");
        }
        Organization org = load(me);
        Long orgId = org.getId();
        // validate everything first, write after: a refused change leaves nothing half-applied
        Boolean newEnabled = null;
        if (body.has("enabled")) {
            JsonNode n = body.get("enabled");
            if (!n.isBoolean()) throw OrgException.invalid("enabled", "must be true or false");
            newEnabled = n.booleanValue();
        }
        Change daily = number(body, "dailyCap", EnterpriseSettingKeys.PREPARE_DAILY_CAP);
        Change monthly = number(body, "monthlyCap", EnterpriseSettingKeys.PREPARE_MONTHLY_CAP);
        Change batch = number(body, "maxBatch", EnterpriseSettingKeys.PREPARE_MAX_BATCH);
        if (!settings.platformEnabled() && (newEnabled != null || daily != null || monthly != null || batch != null)) {
            throw OrgException.coded(409, PLATFORM_OFF, "Preparing selected openings is not available on your plan yet. Contact Kiwiply.", Map.of());
        }
        List<String> parts = new ArrayList<>();
        if (newEnabled != null) {
            boolean old = settings.orgEnabled(orgId);
            if (old != newEnabled) {
                upsert(me, EnterpriseSettingKeys.PREPARE_ENABLED, String.valueOf(newEnabled));
                parts.add("enabled old=" + word(old) + " new=" + word(newEnabled));
            }
        }
        apply(me, daily, "dailyCap", EnterpriseSettingKeys.PREPARE_DAILY_CAP, parts);
        apply(me, monthly, "monthlyCap", EnterpriseSettingKeys.PREPARE_MONTHLY_CAP, parts);
        apply(me, batch, "maxBatch", EnterpriseSettingKeys.PREPARE_MAX_BATCH, parts);
        if (!parts.isEmpty()) audit.record(me, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, orgId.toString(), "section=prepare " + String.join("; ", parts));
        return view(orgId);
    }

    // ---- internals --------------------------------------------------------------------------------------------------------------

    /** A requested number: {@code value} is the clamped number to store, or null to follow the platform. */
    private record Change(Integer value) {}

    private Change number(JsonNode body, String field, String key) {
        if (!body.has(field)) return null;
        JsonNode n = body.get(field);
        if (n.isNull()) return new Change(null);
        if (!n.isIntegralNumber() || !n.canConvertToInt()) throw OrgException.invalid(field, "must be a whole number");
        int min = settings.registryMin(key);
        int max = Math.max(min, settings.platformMax(key));
        int v = n.intValue();
        if (v < min) throw OrgException.invalid(field, "must be at least " + min);
        return new Change(Math.min(v, max)); // above the platform maximum: kept at the maximum
    }

    private void apply(OrgMembership me, Change change, String field, String key, List<String> parts) {
        if (change == null) return;
        Optional<Integer> old = settings.ownNumber(me.orgId(), key);
        Optional<OrgSetting> row = orgSettings.findByOrgIdAndSettingKey(me.orgId(), key);
        if (change.value() == null) {
            if (row.isEmpty()) return;
            orgSettings.delete(row.get());
            parts.add(field + " old=" + old.map(String::valueOf).orElse("default") + " new=default");
            return;
        }
        if (old.isPresent() && old.get().equals(change.value())) return;
        upsert(me, key, String.valueOf(change.value()));
        parts.add(field + " old=" + old.map(String::valueOf).orElse("default") + " new=" + change.value());
    }

    private OrgPrepareSettingsDTO view(Long orgId) {
        PrepareBatchEntitlement.Coverage coverage = entitlement.coverage(orgId);
        return new OrgPrepareSettingsDTO(
            settings.platformEnabled(),
            settings.orgEnabled(orgId),
            limit(orgId, EnterpriseSettingKeys.PREPARE_DAILY_CAP, settings.dailyCap(orgId)),
            limit(orgId, EnterpriseSettingKeys.PREPARE_MONTHLY_CAP, settings.monthlyCap(orgId)),
            limit(orgId, EnterpriseSettingKeys.PREPARE_MAX_BATCH, settings.maxBatch(orgId)),
            new OrgPrepareSettingsDTO.Licensed(coverage.licensed(), coverage.consultants(), FEATURE_NAME)
        );
    }

    private OrgPrepareSettingsDTO.Limit limit(Long orgId, String key, int effective) {
        int max = settings.platformMax(key);
        return new OrgPrepareSettingsDTO.Limit(effective, max, Math.min(settings.registryMin(key), max), settings.ownNumber(orgId, key).isPresent());
    }

    private Organization load(OrgMembership me) {
        if (me == null) throw new OrgNotFoundException();
        Organization org = organizations.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (org.getStatus() == OrgStatus.CLOSED) throw OrgException.coded(409, "ORG_CLOSED", "This organization is closed.", Map.of());
        return org;
    }

    private static String word(boolean on) {
        return on ? "on" : "off";
    }

    private void upsert(OrgMembership me, String key, String json) {
        OrgSetting row = orgSettings.findByOrgIdAndSettingKey(me.orgId(), key).orElseGet(() -> {
            OrgSetting s = new OrgSetting();
            s.setOrgId(me.orgId());
            s.setSettingKey(key);
            return s;
        });
        row.setValueJson(json);
        row.setUpdatedBy(me.login());
        orgSettings.saveAndFlush(row);
    }
}
