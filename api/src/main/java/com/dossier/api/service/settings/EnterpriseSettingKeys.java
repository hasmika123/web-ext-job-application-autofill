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
 * <p>Keys whose feature has not shipped ("not enforced yet") are kept in {@link #deferred()}: the constants exist so the
 * story that owns the feature can read them, but they are NOT registered ({@link #all()}, {@link #find}), so the admin
 * page never offers a switch that does nothing. The story that starts reading a key moves its declaration from the
 * deferred list to the live one ({@code d} to {@code k} in the static block below).
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
    /** X2.2: the module booleans of {@code GET /api/me/tenant} read these two as well (12-identity.md section 3); declared, not offered in admin yet. */
    public static final String FLAG_INTEGRATIONS = "flag.enterprise.integrations";
    public static final String FLAG_ANALYTICS = "flag.enterprise.analytics";

    /** Hostnames that are the platform itself (kiwiply.com and friends): they never resolve to a tenant. */
    public static final String HOSTS_PLATFORM = "enterprise.hosts.platform";
    /** Base domains under which {@code {label}.<base>} may name a tenant subdomain. */
    public static final String HOSTS_TENANT_BASE_DOMAINS = "enterprise.hosts.tenant_base_domains";
    public static final String TENANT_CACHE_SECONDS = "enterprise.tenant.cache_seconds";
    public static final String TENANT_RATE_PER_MIN = "enterprise.tenant.rate_per_min";
    public static final String DOMAINS_SUBDOMAINS_PER_DAY = "enterprise.domains.subdomains_per_day";
    public static final String DOMAINS_RECHECK_HOURS = "enterprise.domains.recheck_hours";
    public static final String DOMAINS_GRACE_HOURS_BEFORE_SUSPEND = "enterprise.domains.grace_hours_before_suspend";
    public static final String ORG_INVITE_REQUIRE_EMAIL_MATCH = "org.invite.require_email_match";
    /** Marketing Assignments board: when a marketer counts as overloaded (percent of capacity), the most consultants one bulk call may name, and the highest capacity a marketer may be given. An organization may override each in org_setting. */
    public static final String ORG_MARKETING_OVERLOAD_PCT = "org.marketing.overload_pct";
    public static final String ORG_MARKETING_BULK_MAX = "org.marketing.bulk_max";
    public static final String ORG_MARKETING_CAPACITY_MAX = "org.marketing.capacity_max";
    /** Interviews page: how long a status change may be undone (minutes), the most interviewers one interview may list, and the minutes before a reminder may be requested again. An organization may override each in org_setting. */
    public static final String ORG_INTERVIEWS_UNDO_MINUTES = "org.interviews.undo_minutes";
    public static final String ORG_INTERVIEWS_MAX_DURATION_MINUTES = "org.interviews.max_duration_minutes";
    public static final String ORG_INTERVIEWS_MAX_INTERVIEWERS = "org.interviews.max_interviewers";
    public static final String ORG_INTERVIEWS_REMINDER_COOLDOWN_MINUTES = "org.interviews.reminder_cooldown_minutes";
    public static final String ORG_CONSENT_REQUEST_COOLDOWN_DAYS = "org.consent.request_cooldown_days";
    public static final String BILLING_MODE_DEFAULT = "enterprise.billing.mode_default";
    public static final String QUOTE_TTL_MINUTES = "enterprise.quote.ttl_minutes";
    public static final String USAGE_RETENTION_MONTHS = "enterprise.usage.retention_months";

    /** The default of {@link #HOSTS_PLATFORM} (06-phase-plan.md section 3). */
    public static final String DEFAULT_PLATFORM_HOSTS = "[\"kiwiply.com\",\"www.kiwiply.com\",\"app.kiwiply.com\",\"api.kiwiply.com\"]";

    /**
     * The default of {@link #HOSTS_TENANT_BASE_DOMAINS}: production only. {@code localhost} (for {@code acme.localhost}) is
     * never a default: it is added by the resolver only where {@code dossier.tenant-host.allow-localhost-tenants} is true
     * (the dev and test profiles). Loopback names are always platform hosts in the resolver, so they are not listed here.
     * The web app derives its own copy of the platform list from its site URL and {@code PLATFORM_HOSTS}; this setting is
     * the source of truth and the two must be kept in step (documented in DEPLOY.md and web/.env.example).
     */
    public static final String DEFAULT_TENANT_BASE_DOMAINS = "[\"kiwiply.com\"]";

    private static final Pattern HOSTNAME = Pattern.compile("(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*");
    private static final Pattern ORG_ID_TEXT = Pattern.compile("[1-9][0-9]{0,18}");
    private static final String NOT_ENFORCED = " Not enforced yet: it takes effect once the feature that reads it ships.";

    private static final List<Key> ALL;
    private static final List<Key> DEFERRED;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<>();
        List<Key> d = new ArrayList<>(); // declared, not enforced yet, hidden from admin

        flag(k, FLAG_ENTERPRISE, Risk.HIGH,
            "Master switch for Enterprise V2: tenant resolution from the request host, GET /api/public/tenant and every enterprise route. "
                + "on = enabled; an allow list of organization ids narrows it to those organizations (a pilot); deny always wins. Off = those routes answer 404.");
        flag(k, FLAG_DOMAINS, Risk.HIGH, "Custom-domain lifecycle and the certificate 'ask' endpoint answering for custom hostnames. Needs the master flag.");
        flag(k, FLAG_ROLES, Risk.MEDIUM, "Organization member permissions are read from role data (several roles per member, scopes) instead of the fixed role enum, and GET /api/orgs/{id}/roles answers. A member whose role data is missing or disagrees with the enum keeps the enum. Needs the master flag.");
        flag(d, FLAG_BILLING, Risk.HIGH, "Enterprise license APIs and Stripe organization billing. Needs the master flag." + NOT_ENFORCED);
        flag(k, FLAG_MARKETING, Risk.MEDIUM, "Talent marketing and pipeline modules (the Consultants, Resumes, Marketing Assignments, Jobs and Applications pages). Needs the master flag.");
        flag(d, FLAG_HR_FINANCE, Risk.MEDIUM, "HR and Finance record modules. Needs the master flag." + NOT_ENFORCED);
        flag(d, FLAG_EXTENSION_WORKSPACES, Risk.MEDIUM, "Workspaces on /api/profile/version and the extension workspace header. Needs the master flag." + NOT_ENFORCED);

        flag(d, FLAG_INTEGRATIONS, Risk.MEDIUM, "Integrations and webhooks module (Phase 12). Needs the master flag." + NOT_ENFORCED);
        flag(d, FLAG_ANALYTICS, Risk.MEDIUM, "Analytics and reports module (Phase 12). Needs the master flag." + NOT_ENFORCED);

        k.add(new Key(HOSTS_PLATFORM, Type.JSON, DEFAULT_PLATFORM_HOSTS, null, null, null,
            "Hostnames that are the platform itself (never a tenant), as a JSON list of lower-case hostnames. A request for one of them is the personal product and the platform console.",
            EnterpriseSettingKeys::hostList, Risk.HIGH));
        k.add(new Key(HOSTS_TENANT_BASE_DOMAINS, Type.JSON, DEFAULT_TENANT_BASE_DOMAINS, null, null, null,
            "Base domains under which {label}.<base> can name an organization's subdomain, as a JSON list. Development hosts such as acme.localhost are enabled by the dev profile, not by this list.",
            EnterpriseSettingKeys::hostList, Risk.HIGH));
        integer(k, TENANT_CACHE_SECONDS, 60, 0, 600, Risk.LOW, "Seconds the API remembers which tenant a hostname belongs to. 0 = no caching. A tenant, hostname or status change evicts the entry at once on that instance.");
        integer(k, TENANT_RATE_PER_MIN, 120, 10, 6000, Risk.MEDIUM, "Requests per minute per hostname and visitor IP on GET /api/public/tenant.");
        integer(d, DOMAINS_SUBDOMAINS_PER_DAY, 20, 1, 500, Risk.MEDIUM, "Most Kiwiply subdomains provisioned per day (keeps certificate issuance under the Let's Encrypt limits)." + NOT_ENFORCED);
        integer(d, DOMAINS_RECHECK_HOURS, 24, 1, 168, Risk.LOW, "Hours between ownership re-checks of a verified custom domain." + NOT_ENFORCED);
        integer(d, DOMAINS_GRACE_HOURS_BEFORE_SUSPEND, 72, 1, 720, Risk.MEDIUM, "Hours a failing custom domain keeps working before it is suspended." + NOT_ENFORCED);
        k.add(new Key(ORG_INVITE_REQUIRE_EMAIL_MATCH, Type.BOOL, "true", null, null, null,
            "An organization invitation can only be accepted by the account whose email matches the invited address (409 INVITE_EMAIL_MISMATCH otherwise). Off: any signed-in account may accept and the acceptance is audited with a mismatch flag. An organization can override it in org_setting.", null, Risk.MEDIUM));
        integer(k, ORG_MARKETING_OVERLOAD_PCT, 90, 50, 100, Risk.LOW, "Marketing Assignments: a marketer counts as overloaded once assigned consultants reach this percent of their capacity. An organization can override it in org_setting.");
        integer(k, ORG_MARKETING_BULK_MAX, 200, 1, 1000, Risk.LOW, "Marketing Assignments: most consultants one assign, update, unassign or undo call may name. An organization can override it in org_setting.");
        integer(k, ORG_MARKETING_CAPACITY_MAX, 200, 1, 1000, Risk.LOW, "Marketing Assignments: the highest capacity (consultants at once) a marketer may be given. An organization can override it in org_setting.");
        integer(k, ORG_INTERVIEWS_UNDO_MINUTES, 10, 1, 120, Risk.LOW, "Interviews: how many minutes a recorded status change may be undone. An organization can override it in org_setting.");
        integer(k, ORG_INTERVIEWS_MAX_DURATION_MINUTES, 480, 15, 1440, Risk.LOW, "Interviews: the longest interview (minutes) that may be scheduled. An organization can override it in org_setting.");
        integer(k, ORG_INTERVIEWS_MAX_INTERVIEWERS, 6, 1, 20, Risk.LOW, "Interviews: the most interviewers one interview may list. An organization can override it in org_setting.");
        integer(k, ORG_INTERVIEWS_REMINDER_COOLDOWN_MINUTES, 60, 1, 1440, Risk.LOW, "Interviews: minutes before a reminder may be requested again for the same interview (the request is a record; no email is sent). An organization can override it in org_setting.");
        integer(d, ORG_CONSENT_REQUEST_COOLDOWN_DAYS, 7, 1, 90, Risk.LOW, "Days before an organization may ask a member for the same consent again." + NOT_ENFORCED);
        d.add(new Key(BILLING_MODE_DEFAULT, Type.ENUM, "SUBSCRIPTION_ITEMS", null, null, List.of("SUBSCRIPTION_ITEMS", "COMPUTED_INVOICE"),
            "How an organization's licenses are billed by default: one Stripe subscription item per line, or one computed invoice." + NOT_ENFORCED, null, Risk.HIGH));
        integer(d, QUOTE_TTL_MINUTES, 15, 1, 240, Risk.MEDIUM, "Minutes a license-change quote stays valid before it must be recomputed." + NOT_ENFORCED);
        integer(d, USAGE_RETENTION_MONTHS, 24, 3, 84, Risk.LOW, "Months of enterprise usage-ledger rows kept before they are purged." + NOT_ENFORCED);

        Map<String, Key> by = new LinkedHashMap<>();
        for (Key key : k) {
            if (by.put(key.key(), key) != null) throw new IllegalStateException("duplicate enterprise setting key " + key.key());
        }
        ALL = Collections.unmodifiableList(k);
        DEFERRED = Collections.unmodifiableList(d);
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private EnterpriseSettingKeys() {}

    /** Every key declared here, in declaration order. */
    public static List<Key> all() {
        return ALL;
    }

    /** Declared but not enforced yet (hidden from admin and from {@link #find}); see the class comment. */
    public static List<Key> deferred() {
        return DEFERRED;
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
