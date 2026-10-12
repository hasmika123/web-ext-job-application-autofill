package com.dossier.api.service.settings;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The Enterprise V2 settings (docs/enterprise-v2/06-phase-plan.md section 3, X1.1): the master enterprise flag and its
 * per-phase sub-flags, the reserved platform hosts and the tenancy knobs. Same {@link Key} record and bounds as the
 * other registries; {@code ResumeBuilderSettingKeys.find} and {@code SettingDefinitions} consult this class, so the admin
 * Settings page lists these keys with no further wiring and {@code ResumeBuilderSettings} reads them unchanged.
 *
 * <p>Every {@code flag.enterprise*} key is a FLAG {@code {on, pct, allow, deny}} that defaults OFF, so a deployment that
 * never touches these settings behaves exactly as it did before Enterprise V2 (ADR-023). The allow/deny lists hold
 * <b>organization ids</b> (positive integers, or the same digits as strings), not logins.
 *
 * <p>Keys marked "not enforced yet" are declared and editable, but nothing reads them until the story that owns the
 * feature does; the description says so, so the admin page never claims a switch that does nothing.
 */
public final class EnterpriseSettingKeys {

    /** The master switch: tenant resolution, the public tenant endpoint and every enterprise route. */
    public static final String FLAG_ENTERPRISE = "flag.enterprise";
    public static final String FLAG_DOMAINS = "flag.enterprise.domains";
    public static final String FLAG_ROLES = "flag.enterprise.roles";
    public static final String FLAG_BILLING = "flag.enterprise.billing";
    public static final String FLAG_MARKETING = "flag.enterprise.marketing";
    public static final String FLAG_HR_FINANCE = "flag.enterprise.hr_finance";
    public static final String FLAG_EXTENSION_WORKSPACES = "flag.enterprise.extension_workspaces";

    /** Hostnames that are the platform itself (kiwiply.com and friends): they never resolve to a tenant. */
    public static final String HOSTS_PLATFORM = "enterprise.hosts.platform";
    public static final String DOMAINS_SUBDOMAINS_PER_DAY = "enterprise.domains.subdomains_per_day";
    public static final String DOMAINS_RECHECK_HOURS = "enterprise.domains.recheck_hours";
    public static final String DOMAINS_GRACE_HOURS_BEFORE_SUSPEND = "enterprise.domains.grace_hours_before_suspend";
    public static final String ORG_INVITE_REQUIRE_EMAIL_MATCH = "org.invite.require_email_match";
    public static final String ORG_CONSENT_REQUEST_COOLDOWN_DAYS = "org.consent.request_cooldown_days";
    public static final String BILLING_MODE_DEFAULT = "enterprise.billing.mode_default";
    public static final String QUOTE_TTL_MINUTES = "enterprise.quote.ttl_minutes";
    public static final String USAGE_RETENTION_MONTHS = "enterprise.usage.retention_months";

    /** The default of {@link #HOSTS_PLATFORM} (06-phase-plan.md section 3). */
    public static final String DEFAULT_PLATFORM_HOSTS = "[\"kiwiply.com\",\"www.kiwiply.com\",\"app.kiwiply.com\",\"api.kiwiply.com\",\"localhost\"]";

    private static final Pattern HOSTNAME = Pattern.compile("(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*");
    private static final Pattern ORG_ID_TEXT = Pattern.compile("[1-9][0-9]{0,18}");
    private static final String NOT_ENFORCED = " Not enforced yet: it takes effect once the feature that reads it ships.";

    private static final List<Key> ALL;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<>();

        flag(k, FLAG_ENTERPRISE, Risk.HIGH,
            "Master switch for Enterprise V2: tenant resolution from the request host, GET /api/public/tenant and every enterprise route. "
                + "on = enabled; an allow list of organization ids narrows it to those organizations (a pilot); deny always wins. Off = those routes answer 404.");
        flag(k, FLAG_DOMAINS, Risk.HIGH, "Custom-domain lifecycle and the certificate 'ask' endpoint answering for custom hostnames. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_ROLES, Risk.MEDIUM, "Roles stored as data become authoritative and the role editor appears. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_BILLING, Risk.HIGH, "Enterprise license APIs and Stripe organization billing. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_MARKETING, Risk.MEDIUM, "Talent marketing and pipeline modules. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_HR_FINANCE, Risk.MEDIUM, "HR and Finance record modules. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_EXTENSION_WORKSPACES, Risk.MEDIUM, "Workspaces on /api/profile/version and the extension workspace header. Needs the master flag." + NOT_ENFORCED);

        k.add(new Key(HOSTS_PLATFORM, Type.JSON, DEFAULT_PLATFORM_HOSTS, null, null, null,
            "Hostnames that are the platform itself (never a tenant), as a JSON list of lower-case hostnames. A request for one of them is the personal product and the platform console." + NOT_ENFORCED,
            EnterpriseSettingKeys::hostList, Risk.HIGH));
        integer(k, DOMAINS_SUBDOMAINS_PER_DAY, 20, 1, 500, Risk.MEDIUM, "Most Kiwiply subdomains provisioned per day (keeps certificate issuance under the Let's Encrypt limits)." + NOT_ENFORCED);
        integer(k, DOMAINS_RECHECK_HOURS, 24, 1, 168, Risk.LOW, "Hours between ownership re-checks of a verified custom domain." + NOT_ENFORCED);
        integer(k, DOMAINS_GRACE_HOURS_BEFORE_SUSPEND, 72, 1, 720, Risk.MEDIUM, "Hours a failing custom domain keeps working before it is suspended." + NOT_ENFORCED);
        k.add(new Key(ORG_INVITE_REQUIRE_EMAIL_MATCH, Type.BOOL, "true", null, null, null,
            "An organization invitation can only be accepted by the account whose email matches the invited address (a per-organization override comes later)." + NOT_ENFORCED, null, Risk.MEDIUM));
        integer(k, ORG_CONSENT_REQUEST_COOLDOWN_DAYS, 7, 1, 90, Risk.LOW, "Days before an organization may ask a member for the same consent again." + NOT_ENFORCED);
        k.add(new Key(BILLING_MODE_DEFAULT, Type.ENUM, "SUBSCRIPTION_ITEMS", null, null, List.of("SUBSCRIPTION_ITEMS", "COMPUTED_INVOICE"),
            "How an organization's licenses are billed by default: one Stripe subscription item per line, or one computed invoice." + NOT_ENFORCED, null, Risk.HIGH));
        integer(k, QUOTE_TTL_MINUTES, 15, 1, 240, Risk.MEDIUM, "Minutes a license-change quote stays valid before it must be recomputed." + NOT_ENFORCED);
        integer(k, USAGE_RETENTION_MONTHS, 24, 3, 84, Risk.LOW, "Months of enterprise usage-ledger rows kept before they are purged." + NOT_ENFORCED);

        Map<String, Key> by = new LinkedHashMap<>();
        for (Key key : k) {
            if (by.put(key.key(), key) != null) throw new IllegalStateException("duplicate enterprise setting key " + key.key());
        }
        ALL = Collections.unmodifiableList(k);
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private EnterpriseSettingKeys() {}

    /** Every key declared here, in declaration order. */
    public static List<Key> all() {
        return ALL;
    }

    /** The declaration for {@code key}; null when it is not one of these. */
    public static Key find(String key) {
        return key == null ? null : BY_KEY.get(key);
    }

    // ---- value shapes ---------------------------------------------------------

    /**
     * An enterprise flag: an object with a boolean {@code on}; optional {@code pct} 0-100 and {@code allow}/{@code deny}
     * lists of organization ids (positive integers, or digit-only strings), at most 50 each (the stored value is capped at 1000 characters).
     */
    static boolean enterpriseFlag(JsonNode n) {
        if (n == null || !n.isObject()) return false;
        Set<String> allowed = Set.of("on", "pct", "allow", "deny");
        for (Iterator<String> it = n.fieldNames(); it.hasNext();) {
            if (!allowed.contains(it.next())) return false;
        }
        if (!n.has("on") || !n.get("on").isBoolean()) return false;
        if (n.has("pct") && !(n.get("pct").isInt() && n.get("pct").intValue() >= 0 && n.get("pct").intValue() <= 100)) return false;
        for (String list : List.of("allow", "deny")) {
            if (!n.has(list)) continue;
            JsonNode a = n.get(list);
            if (!a.isArray() || a.size() > 50) return false;
            for (JsonNode e : a) {
                boolean ok = e.isIntegralNumber() ? e.canConvertToLong() && e.longValue() > 0 : e.isTextual() && ORG_ID_TEXT.matcher(e.textValue()).matches();
                if (!ok) return false;
            }
        }
        return true;
    }

    /** A JSON list of 1 to 50 lower-case hostnames (letters, digits, hyphens and dots; at most 253 characters). */
    static boolean hostList(JsonNode n) {
        if (n == null || !n.isArray() || n.isEmpty() || n.size() > 50) return false;
        for (JsonNode e : n) {
            if (!e.isTextual() || e.textValue().length() > 253 || !HOSTNAME.matcher(e.textValue()).matches()) return false;
        }
        return true;
    }

    // ---- declaration helpers --------------------------------------------------

    private static void flag(List<Key> k, String key, Risk risk, String description) {
        k.add(new Key(key, Type.JSON, AdminSettingKeys.FLAG_OFF, null, null, null, description, EnterpriseSettingKeys::enterpriseFlag, risk));
    }

    private static void integer(List<Key> k, String key, int def, int min, int max, Risk risk, String description) {
        k.add(new Key(key, Type.INT, String.valueOf(def), (double) min, (double) max, null, description, null, risk));
    }
}
