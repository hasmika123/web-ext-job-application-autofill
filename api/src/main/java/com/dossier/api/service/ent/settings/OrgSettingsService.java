package com.dossier.api.service.ent.settings;

import com.dossier.api.domain.ent.OrgSetting;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.ent.OrgSettingRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.ent.OrgSettingsDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Organization Settings page, General and Security sections (X2.9, docs/enterprise-v2/14 section 4). The organization is always the caller's
 * authorised seat's; nothing in a body can name another. Identity values live on the organization row (display name, time zone) and in its
 * {@code org_setting} rows (language, contact e-mail, session timeout, password minimum). A body is a partial object: an absent field is left alone,
 * an explicit {@code null} (or empty text) clears it back to the default. Every value is validated against the admin settings registry's bounds. A
 * Security change needs a reason (length from the registry) and writes one {@code ORG_SETTINGS} audit row naming the setting, old and new value
 * and the reason; General changes are audited by field name. The legal name is not here: it is changed through Kiwiply support.
 */
@Service
public class OrgSettingsService {

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@,;<>\"]{1,64}@[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$");
    private static final Set<String> GENERAL_KEYS = Set.of("displayName", "timeZone", "locale", "contactEmail");
    private static final Set<String> SECURITY_KEYS = Set.of("sessionTimeoutMinutes", "passwordMinLength", "reason");
    public static final String DEFAULT_LOCALE = "en";
    static final int REASON_MAX = 300;

    private final OrganizationRepository organizations;
    private final OrgSettingRepository orgSettings;
    private final ResumeBuilderSettings settings;
    private final OrgSecurityPolicy security;
    private final OrgAuditService audit;
    private final ObjectMapper mapper;

    public OrgSettingsService(
        OrganizationRepository organizations,
        OrgSettingRepository orgSettings,
        ResumeBuilderSettings settings,
        OrgSecurityPolicy security,
        OrgAuditService audit,
        ObjectMapper mapper
    ) {
        this.organizations = organizations;
        this.orgSettings = orgSettings;
        this.settings = settings;
        this.security = security;
        this.audit = audit;
        this.mapper = mapper;
    }

    /** The organization's contact / support e-mail set on the Settings page, or null. Read by the policy pages (the support page shows it). */
    @Transactional(readOnly = true)
    public String contactEmail(Long orgId) {
        return storedString(orgId, EnterpriseSettingKeys.ORG_CONTACT_SUPPORT_EMAIL).orElse(null);
    }

    @Transactional(readOnly = true)
    public OrgSettingsDTO get(OrgMembership me) {
        return view(load(me));
    }

    @Transactional
    public OrgSettingsDTO saveGeneral(OrgMembership me, JsonNode body) {
        requireObject(body, GENERAL_KEYS);
        Organization org = load(me);
        List<String> changed = new ArrayList<>();
        if (body.has("displayName")) {
            String name = cleanDisplayName(body.get("displayName"), org.getName());
            if (!name.equals(org.getDisplayName() == null ? org.getName() : org.getDisplayName())) {
                org.setDisplayName(name);
                org.setConfigVersion(org.getConfigVersion() + 1); // the public tenant answer carries the name
                changed.add("displayName");
            }
        }
        if (body.has("timeZone")) {
            JsonNode n = body.get("timeZone");
            String tz = n.isNull() ? "UTC" : cleanTimeZone(n);
            if (!tz.equals(org.getTimezone())) {
                org.setTimezone(tz);
                changed.add("timeZone");
            }
        }
        if (body.has("locale")) {
            JsonNode n = body.get("locale");
            String locale = n.isNull() || (n.isTextual() && n.textValue().isBlank()) ? null : cleanLocale(n);
            if (!java.util.Objects.equals(locale, storedString(org.getId(), EnterpriseSettingKeys.ORG_LOCALE).orElse(null))) {
                writeString(me, EnterpriseSettingKeys.ORG_LOCALE, locale);
                changed.add("locale");
            }
        }
        if (body.has("contactEmail")) {
            JsonNode n = body.get("contactEmail");
            String email = n.isNull() || (n.isTextual() && n.textValue().isBlank()) ? null : cleanEmail(n);
            if (!java.util.Objects.equals(email, storedString(org.getId(), EnterpriseSettingKeys.ORG_CONTACT_SUPPORT_EMAIL).orElse(null))) {
                writeString(me, EnterpriseSettingKeys.ORG_CONTACT_SUPPORT_EMAIL, email);
                changed.add("contactEmail");
            }
        }
        if (!changed.isEmpty()) {
            organizations.saveAndFlush(org);
            audit.record(me, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "section=general fields=" + String.join(",", changed));
        }
        return view(org);
    }

    @Transactional
    public OrgSettingsDTO saveSecurity(OrgMembership me, JsonNode body) {
        requireObject(body, SECURITY_KEYS);
        Organization org = load(me);
        OrgSecurityPolicy.Bounds bounds = security.bounds();
        Optional<Integer> oldTimeout = security.sessionTimeoutMinutes(org.getId());
        Optional<Integer> oldMin = security.ownPasswordMinLength(org.getId());
        // validate everything first, write after: a refused change leaves no half-applied state
        boolean touchTimeout = false;
        boolean touchMin = false;
        Integer newTimeout = null;
        Integer newMin = null;
        if (body.has("sessionTimeoutMinutes")) {
            newTimeout = cleanInt(body.get("sessionTimeoutMinutes"), "sessionTimeoutMinutes", bounds.sessionMin(), bounds.sessionMax());
            touchTimeout = !java.util.Objects.equals(newTimeout, oldTimeout.orElse(null));
        }
        if (body.has("passwordMinLength")) {
            newMin = cleanInt(body.get("passwordMinLength"), "passwordMinLength", bounds.passwordFloor(), bounds.passwordCeiling());
            touchMin = !java.util.Objects.equals(newMin, oldMin.orElse(null));
        }
        if (!touchTimeout && !touchMin) return view(org); // nothing changes: no reason needed, nothing audited
        String reason = cleanReason(body.get("reason"));
        List<String> parts = new ArrayList<>();
        if (touchTimeout) {
            writeInt(me, EnterpriseSettingKeys.ORG_SECURITY_SESSION_TIMEOUT_MINUTES, newTimeout);
            parts.add("sessionTimeoutMinutes old=" + oldTimeout.map(String::valueOf).orElse("default") + " new=" + (newTimeout == null ? "default" : newTimeout));
        }
        if (touchMin) {
            writeInt(me, EnterpriseSettingKeys.ORG_SECURITY_PASSWORD_MIN_LENGTH, newMin);
            parts.add("passwordMinLength old=" + oldMin.map(String::valueOf).orElse("default") + " new=" + (newMin == null ? "default" : newMin));
        }
        audit.record(me, OrgAuditService.ORG_SETTINGS, OrgAuditService.TARGET_ORG, null, org.getId().toString(), "section=security " + String.join("; ", parts) + " reason=" + reason);
        return view(org);
    }

    // ---- view -------------------------------------------------------------------------------------------------------------------

    private OrgSettingsDTO view(Organization org) {
        OrgSecurityPolicy.Bounds b = security.bounds();
        Long id = org.getId();
        String locale = storedString(id, EnterpriseSettingKeys.ORG_LOCALE).orElse(DEFAULT_LOCALE);
        return new OrgSettingsDTO(
            new OrgSettingsDTO.General(
                org.getName(),
                org.getDisplayName() == null || org.getDisplayName().isBlank() ? org.getName() : org.getDisplayName(),
                org.getTimezone(),
                locale,
                storedString(id, EnterpriseSettingKeys.ORG_CONTACT_SUPPORT_EMAIL).orElse(null)
            ),
            new OrgSettingsDTO.Security(
                security.sessionTimeoutMinutes(id).orElse(null),
                security.ownPasswordMinLength(id).orElse(null),
                new OrgSettingsDTO.Bounds(b.sessionMin(), b.sessionMax(), b.passwordFloor(), b.passwordCeiling()),
                security.reasonMinChars()
            ),
            allowedLocales()
        );
    }

    private List<String> allowedLocales() {
        try {
            String[] list = settings.getJson(EnterpriseSettingKeys.ORG_SETTINGS_LOCALES, String[].class);
            return list == null || list.length == 0 ? List.of(DEFAULT_LOCALE) : List.of(list);
        } catch (RuntimeException e) {
            return List.of(DEFAULT_LOCALE);
        }
    }

    // ---- validation -------------------------------------------------------------------------------------------------------------

    private Organization load(OrgMembership me) {
        if (me == null) throw new OrgNotFoundException();
        Organization org = organizations.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (org.getStatus() == OrgStatus.CLOSED) throw OrgException.coded(409, "ORG_CLOSED", "This organization is closed.", java.util.Map.of());
        return org;
    }

    private static void requireObject(JsonNode body, Set<String> allowed) {
        if (body == null || !body.isObject()) throw OrgException.invalid("body", "must be an object");
        for (Iterator<String> it = body.fieldNames(); it.hasNext();) {
            String k = it.next();
            if (!allowed.contains(k)) throw OrgException.invalid(k, "is not a setting you can change here");
        }
    }

    private static String cleanDisplayName(JsonNode n, String legalName) {
        if (n.isNull() || (n.isTextual() && n.textValue().isBlank())) return legalName;
        if (!n.isTextual()) throw OrgException.invalid("displayName", "must be text");
        String v = n.textValue().strip().replaceAll("\\s+", " ").replaceAll("\\p{Cntrl}", "");
        if (v.isEmpty() || v.length() > 120) throw OrgException.invalid("displayName", "must be 1 to 120 characters");
        SensitiveContent.check("displayName", "name", v);
        return v;
    }

    private static String cleanTimeZone(JsonNode n) {
        if (!n.isTextual()) throw OrgException.invalid("timeZone", "must be an IANA time zone such as America/New_York");
        String tz = n.textValue().strip();
        if (tz.isEmpty() || !ZoneId.getAvailableZoneIds().contains(tz)) throw OrgException.invalid("timeZone", "must be an IANA time zone such as America/New_York");
        return tz;
    }

    private String cleanLocale(JsonNode n) {
        if (!n.isTextual()) throw OrgException.invalid("locale", "must be a language tag such as en");
        String v = n.textValue().strip();
        if (!allowedLocales().contains(v)) throw OrgException.invalid("locale", "must be one of " + String.join(", ", allowedLocales()));
        return v;
    }

    private static String cleanEmail(JsonNode n) {
        if (!n.isTextual()) throw OrgException.invalid("contactEmail", "must be an email address");
        String v = n.textValue().strip().toLowerCase(Locale.ROOT);
        if (v.length() > 254 || !EMAIL.matcher(v).matches()) throw OrgException.invalid("contactEmail", "must be an email address");
        return v;
    }

    private static Integer cleanInt(JsonNode n, String field, int min, int max) {
        if (n.isNull()) return null; // back to the platform behaviour
        if (!n.isIntegralNumber() || !n.canConvertToInt()) throw OrgException.invalid(field, "must be a whole number");
        int v = n.intValue();
        if (v < min || v > max) throw OrgException.invalid(field, "must be between " + min + " and " + max);
        return v;
    }

    private String cleanReason(JsonNode n) {
        int min = security.reasonMinChars();
        String v = n == null || !n.isTextual() ? "" : n.textValue().strip().replaceAll("\\s+", " ").replaceAll("\\p{Cntrl}", "");
        if (v.length() < min) throw OrgException.coded(400, "REASON_REQUIRED", "A reason of at least " + min + " characters is required for this change.", java.util.Map.of("field", "reason", "minLength", min));
        if (v.length() > REASON_MAX) throw OrgException.invalid("reason", "must be at most " + REASON_MAX + " characters");
        SensitiveContent.check("reason", "reason", v);
        return v;
    }

    // ---- org_setting rows -------------------------------------------------------------------------------------------------------

    private Optional<String> storedString(Long orgId, String key) {
        return orgSettings
            .findByOrgIdAndSettingKey(orgId, key)
            .map(OrgSetting::getValueJson)
            .flatMap(v -> {
                try {
                    JsonNode n = mapper.readTree(v);
                    return n.isTextual() && !n.textValue().isBlank() ? Optional.of(n.textValue()) : Optional.<String>empty();
                } catch (JsonProcessingException e) {
                    return Optional.empty();
                }
            });
    }

    private void writeString(OrgMembership me, String key, String value) {
        if (value == null) {
            orgSettings.findByOrgIdAndSettingKey(me.orgId(), key).ifPresent(orgSettings::delete);
            return;
        }
        try {
            upsert(me, key, mapper.writeValueAsString(value));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private void writeInt(OrgMembership me, String key, Integer value) {
        if (value == null) {
            orgSettings.findByOrgIdAndSettingKey(me.orgId(), key).ifPresent(orgSettings::delete);
            return;
        }
        upsert(me, key, String.valueOf(value));
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
