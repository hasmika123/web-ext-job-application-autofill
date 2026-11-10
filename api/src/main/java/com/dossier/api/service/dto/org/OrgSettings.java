package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.service.org.OrgException;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The typed shape of {@code organization.settings_json} (docs/design/org/tenant-model.md section 2.1): never a
 * free-form bag. A key outside this record is refused, every value is validated, and a missing key keeps its
 * default, so an org that never opened the settings page behaves exactly like a new one.
 *
 * <p>{@code digestTime} is carried next to {@code digestDay} because onboarding-invites.md section 6 sends the
 * digest "at {@code settings.digestDay/time}"; the six keys of the design plus this one are the whole record.
 *
 * @param defaultRole           role given to an invitee when the inviter names none: MEMBER or STAFF only (a default
 *                              that quietly mints admins would be a privilege-escalation footgun)
 * @param defaultShareScope     the scope the join screen proposes: {@code SUMMARY} (default) or {@code NONE} for an
 *                              org that only wants seat counts. FULL is never a default: it needs a named paired member
 * @param allowSelfLeave        whether a member may leave on their own (the design default: yes)
 * @param digestDay             {@code DAILY} or a weekday {@code MON..SUN}
 * @param digestTime            {@code HH:mm} in the org's timezone
 * @param quietHours            no org notification is delivered inside this window (default 21:00 to 08:00)
 * @param showPayToConsultant   whether a consultant sees pay figures in their own timesheet view (Timesheets area)
 */
public record OrgSettings(
    OrgRole defaultRole,
    String defaultShareScope,
    boolean allowSelfLeave,
    String digestDay,
    String digestTime,
    QuietHours quietHours,
    boolean showPayToConsultant
) {
    /** A daily window that may wrap midnight; {@code start} equal to {@code end} means no quiet hours. */
    public record QuietHours(String start, String end) {}

    private static final Pattern HH_MM = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");
    private static final Set<String> SCOPES = Set.of("NONE", "SUMMARY");
    private static final Set<String> DAYS = Set.of("DAILY", "MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN");
    private static final Set<OrgRole> DEFAULT_ROLES = Set.of(OrgRole.MEMBER, OrgRole.STAFF);
    private static final Set<String> KEYS = Set.of(
        "defaultRole", "defaultShareScope", "allowSelfLeave", "digestDay", "digestTime", "quietHours", "showPayToConsultant"
    );

    /** What a brand-new org gets. */
    public static OrgSettings defaults() {
        return new OrgSettings(OrgRole.MEMBER, "SUMMARY", true, "DAILY", "08:00", new QuietHours("21:00", "08:00"), false);
    }

    /** Applies a partial JSON object over {@code base}; unknown keys and invalid values are a 422 naming the field. */
    public static OrgSettings merge(OrgSettings base, JsonNode patch) {
        if (patch == null || patch.isNull()) return base;
        if (!patch.isObject()) throw OrgException.invalid("settings", "must be an object");
        for (Iterator<String> it = patch.fieldNames(); it.hasNext();) {
            String k = it.next();
            if (!KEYS.contains(k)) throw OrgException.invalid("settings." + k, "is not a known setting");
        }
        OrgRole role = base.defaultRole;
        String scope = base.defaultShareScope;
        boolean leave = base.allowSelfLeave;
        String day = base.digestDay;
        String time = base.digestTime;
        QuietHours quiet = base.quietHours;
        boolean pay = base.showPayToConsultant;

        if (patch.has("defaultRole")) {
            try {
                role = OrgRole.valueOf(text(patch, "defaultRole"));
            } catch (IllegalArgumentException e) {
                throw OrgException.invalid("settings.defaultRole", "must be MEMBER or STAFF");
            }
        }
        if (patch.has("defaultShareScope")) scope = text(patch, "defaultShareScope");
        if (patch.has("allowSelfLeave")) leave = bool(patch, "allowSelfLeave");
        if (patch.has("digestDay")) day = text(patch, "digestDay");
        if (patch.has("digestTime")) time = text(patch, "digestTime");
        if (patch.has("showPayToConsultant")) pay = bool(patch, "showPayToConsultant");
        if (patch.has("quietHours")) {
            JsonNode q = patch.get("quietHours");
            if (!q.isObject()) throw OrgException.invalid("settings.quietHours", "must be an object {start, end}");
            for (Iterator<String> it = q.fieldNames(); it.hasNext();) {
                String k = it.next();
                if (!k.equals("start") && !k.equals("end")) throw OrgException.invalid("settings.quietHours." + k, "is not a known setting");
            }
            quiet = new QuietHours(
                q.has("start") ? text(q, "start", "settings.quietHours.start") : quiet.start(),
                q.has("end") ? text(q, "end", "settings.quietHours.end") : quiet.end()
            );
        }
        return new OrgSettings(role, scope, leave, day, time, quiet, pay).validated();
    }

    /** This record, or a 422 {@code ORG_INVALID} naming the first bad field. */
    public OrgSettings validated() {
        if (defaultRole == null || !DEFAULT_ROLES.contains(defaultRole)) throw OrgException.invalid("settings.defaultRole", "must be MEMBER or STAFF");
        if (defaultShareScope == null || !SCOPES.contains(defaultShareScope)) throw OrgException.invalid("settings.defaultShareScope", "must be SUMMARY or NONE");
        if (digestDay == null || !DAYS.contains(digestDay)) throw OrgException.invalid("settings.digestDay", "must be DAILY or MON..SUN");
        if (digestTime == null || !HH_MM.matcher(digestTime).matches()) throw OrgException.invalid("settings.digestTime", "must be HH:mm");
        if (quietHours == null) throw OrgException.invalid("settings.quietHours", "is required");
        if (quietHours.start() == null || !HH_MM.matcher(quietHours.start()).matches()) throw OrgException.invalid("settings.quietHours.start", "must be HH:mm");
        if (quietHours.end() == null || !HH_MM.matcher(quietHours.end()).matches()) throw OrgException.invalid("settings.quietHours.end", "must be HH:mm");
        return this;
    }

    /** The settings as a plain map, for tests and logging. */
    public Map<String, Object> asMap() {
        return Map.of(
            "defaultRole", defaultRole.name(),
            "defaultShareScope", defaultShareScope,
            "allowSelfLeave", allowSelfLeave,
            "digestDay", digestDay,
            "digestTime", digestTime,
            "quietHours", List.of(quietHours.start(), quietHours.end()),
            "showPayToConsultant", showPayToConsultant
        );
    }

    private static String text(JsonNode node, String key) {
        return text(node, key, "settings." + key);
    }

    private static String text(JsonNode node, String key, String path) {
        JsonNode v = node.get(key);
        if (v == null || !v.isTextual()) throw OrgException.invalid(path, "must be a string");
        return v.textValue();
    }

    private static boolean bool(JsonNode node, String key) {
        JsonNode v = node.get(key);
        if (v == null || !v.isBoolean()) throw OrgException.invalid("settings." + key, "must be true or false");
        return v.booleanValue();
    }
}
