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
 * The platform keys the Settings home adds to the Resume Builder and AI registries (ADMIN-E2E-PLAN 2.1; A5.1):
 * jobs, inbox, ops, rate limits, email, AI cost caps, admin policy, security, analytics, catalog, feature flags and
 * the extension remote config. Same {@link Key} record and bounds as the other registries; {@code
 * ResumeBuilderSettingKeys.find} consults this class last, so {@code ResumeBuilderSettings} reads these unchanged.
 *
 * <p>The {@code defaultValue} is the CODE default (the plan's value, which is today's env/property value where one
 * exists). A key a later story introduces is declared by that story, with the default in its acceptance criteria.
 * Keys marked "not enforced yet" are declared and editable, but nothing reads them until the story that owns the
 * feature does; the description says so, so the admin page never claims a switch that does nothing.
 *
 * <p>No secret is ever a setting: provider keys, tokens and passwords are env-only, and a test asserts no key
 * declared here is named like one.
 */
public final class AdminSettingKeys {

    public static final String JOBS_MATCH_THRESHOLD = "jobs.match_threshold";
    public static final String JOBS_CANDIDATES_PER_USER = "jobs.candidates_per_user";
    public static final String JOBS_POSTING_AGE_HOURS = "jobs.posting_age_hours";
    public static final String JOBS_DAILY_TARGET = "jobs.daily_target";
    public static final String JOBS_DISABLE_AFTER_FAILURES = "jobs.disable_after_failures";
    public static final String INBOX_POLL_MINUTES = "inbox.poll_minutes";
    public static final String INBOX_RETENTION_DAYS = "inbox.retention_days";
    /** Change audit (docs/change-audit/README.md section 4.4): months of {@code application_event} history kept; 0 = for the life of the application. */
    public static final String TRACKER_HISTORY_RETENTION_MONTHS = "tracker.history.retention_months";
    public static final String OPS_ERROR_DIGEST_TO = "ops.error_digest.to";
    public static final String OPS_ERROR_DIGEST_INTERVAL_MIN = "ops.error_digest.interval_min";
    public static final String OPS_MAINTENANCE = "ops.maintenance";
    public static final String EMAIL_DAILY_SEND_CAP = "email.daily_send_cap";
    public static final String AI_DAILY_COST_CAP_CENTS = "ai.daily_cost_cap_cents";
    public static final String AI_MONTHLY_COST_CAP_CENTS = "ai.monthly_cost_cap_cents";
    public static final String AI_FREE_PARSE_RESERVED_PCT = "ai.free_parse_reserved_pct";
    public static final String EXT_MIN_VERSION = "ext.min_version";
    public static final String EXT_RULES_VERSION_HINT = "ext.rules_version_hint";
    public static final String CATALOG_MARGIN_FLOOR_SUBSCRIPTION_PCT = "catalog.margin_floor_subscription_pct";
    public static final String CATALOG_MARGIN_FLOOR_SERVICE_PCT = "catalog.margin_floor_service_pct";

    /** The ATS families whose autofill adapter the extension remote config can switch off. */
    public static final List<String> EXT_ATS_FAMILIES = List.of("workday", "greenhouse", "lever", "ashby", "smartrecruiters", "icims", "generic");

    /** The public endpoints a per-IP hourly limit can be set for (Q-3 defaults, ADMIN-E2E-PLAN section 6). */
    public static final Map<String, Integer> RATE_LIMIT_DEFAULTS_PER_HOUR = rateLimitDefaults();

    /** The default value of a FLAG key: off, everyone, nobody listed. */
    public static final String FLAG_OFF = "{\"on\":false,\"pct\":0,\"allow\":[],\"deny\":[]}";

    private static final Pattern SEMVER = Pattern.compile("\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}");
    private static final Pattern EMAIL = Pattern.compile("[^\\s@]{1,64}@[^\\s@]{1,190}\\.[^\\s@]{2,24}");
    private static final Pattern LOGIN = Pattern.compile("[A-Za-z0-9._@-]{1,50}");
    private static final String NOT_ENFORCED = " Not enforced yet: it takes effect once the feature that reads it ships.";

    private static final List<Key> ALL;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<>();

        // Jobs (the daily match job and its sources).
        integer(k, JOBS_MATCH_THRESHOLD, 60, 40, 90, Risk.MEDIUM, "Lowest match score (0-100) a posting needs to be shown to a user." + NOT_ENFORCED);
        integer(k, JOBS_CANDIDATES_PER_USER, 50, 10, 100, Risk.MEDIUM, "Postings scored per user per daily run." + NOT_ENFORCED);
        integer(k, JOBS_POSTING_AGE_HOURS, 48, 12, 168, Risk.LOW, "Oldest posting (hours) the daily run still considers." + NOT_ENFORCED);
        integer(k, JOBS_DAILY_TARGET, 15, 3, 20, Risk.LOW, "Matches a user is aimed to see each day." + NOT_ENFORCED);
        integer(k, JOBS_DISABLE_AFTER_FAILURES, 5, 2, 20, Risk.LOW, "Consecutive failed reads after which a job source is switched off." + NOT_ENFORCED);

        // Inbox (the user's own Gmail over IMAP).
        integer(k, INBOX_POLL_MINUTES, 15, 5, 120, Risk.MEDIUM, "How often connected inboxes are read, in minutes." + NOT_ENFORCED);
        integer(k, INBOX_RETENTION_DAYS, 365, 30, 730, Risk.HIGH, "Stored mail is deleted this many days after it was sent." + NOT_ENFORCED);

        // Tracker history (change audit, U6.15): read by TrackerHistoryRetentionJob. 0 = for the life of the application (decision D5).
        integer(k, TRACKER_HISTORY_RETENTION_MONTHS, 0, 0, 120, Risk.LOW, "Months of application history kept; 0 keeps it as long as the application exists.");

        // Ops.
        k.add(new Key(OPS_ERROR_DIGEST_TO, Type.STRING, "", null, null, null, "Where the server-error digest is emailed. Blank = the deployment's recipient." + NOT_ENFORCED, null, Risk.LOW));
        integer(k, OPS_ERROR_DIGEST_INTERVAL_MIN, 15, 5, 120, Risk.LOW, "Minutes between server-error digests." + NOT_ENFORCED);
        k.add(new Key(OPS_MAINTENANCE, Type.JSON, FLAG_OFF, null, null, null, "Maintenance mode: users see a banner and writes pause; admins keep full access." + NOT_ENFORCED, AdminSettingKeys::flag, Risk.HIGH));

        // Per-IP rate limits on the public endpoints, requests per hour.
        RATE_LIMIT_DEFAULTS_PER_HOUR.forEach((name, def) ->
            integer(k, "ratelimit." + name + ".per_hour", def, 1, 1000, Risk.HIGH, "Requests per hour per IP on the " + name.replace('_', ' ') + " endpoint." + NOT_ENFORCED)
        );

        // Email.
        integer(k, EMAIL_DAILY_SEND_CAP, 250, 50, 10000, Risk.MEDIUM, "Most transactional emails sent per day (the provider's own cap is lower)." + NOT_ENFORCED);

        // Platform AI cost caps (read by the AI cost governor, A4.3).
        integer(k, AI_DAILY_COST_CAP_CENTS, 4000, 500, 50000, Risk.HIGH, "Platform AI spend ceiling per day, in US cents." + NOT_ENFORCED);
        integer(k, AI_MONTHLY_COST_CAP_CENTS, 60000, 5000, 500000, Risk.HIGH, "Platform AI spend ceiling per month, in US cents." + NOT_ENFORCED);
        integer(k, AI_FREE_PARSE_RESERVED_PCT, 10, 0, 50, Risk.HIGH, "Share of the AI cap kept for free resume parsing after a cap is hit." + NOT_ENFORCED);

        // Admin policy.
        integer(k, "admin.comp_max_days.support", 30, 1, 365, Risk.MEDIUM, "Longest complimentary Pro grant (days) a support agent may give." + NOT_ENFORCED);
        integer(k, "admin.comp_max_days.finance", 90, 1, 365, Risk.MEDIUM, "Longest complimentary Pro grant (days) a finance admin may give." + NOT_ENFORCED);
        integer(k, "admin.comp_reauth_days", 30, 1, 365, Risk.MEDIUM, "A complimentary grant longer than this many days needs a fresh re-authentication." + NOT_ENFORCED);
        integer(k, "admin.support_access_hours", 24, 1, 72, Risk.MEDIUM, "How long a user's consent to support access lasts, in hours." + NOT_ENFORCED);
        integer(k, "admin.debug_session_fills", 5, 1, 20, Risk.MEDIUM, "Fills a user's debug session records before it ends." + NOT_ENFORCED);
        integer(k, "admin.debug_session_hours", 48, 1, 168, Risk.MEDIUM, "Hours a user's debug session stays open." + NOT_ENFORCED);

        // Security.
        integer(k, "security.failed_login_block_threshold", 20, 5, 100, Risk.HIGH, "Failed logins from one IP in an hour before it is blocked." + NOT_ENFORCED);
        integer(k, "security.ip_block_hours", 1, 1, 24, Risk.MEDIUM, "How long a blocked IP stays blocked, in hours." + NOT_ENFORCED);
        integer(k, "security.event_retention_days", 400, 30, 730, Risk.MEDIUM, "Security events are kept this many days." + NOT_ENFORCED);

        // Analytics and catalog. The margin floors cannot go below the hard minimums (80 % subscriptions, 20 % services).
        integer(k, "analytics.conversion_window_days", 30, 7, 90, Risk.MEDIUM, "Days after signup within which a paid conversion is attributed to it." + NOT_ENFORCED);
        integer(k, "catalog.cap_hit_alert_pct", 5, 1, 50, Risk.MEDIUM, "Alert when this percent of a plan's users hit a cap in a day." + NOT_ENFORCED);
        integer(k, "catalog.stripe.pct_bp", 290, 0, 1000, Risk.LOW, "Stripe's percentage fee in basis points, used by the margin guard." + NOT_ENFORCED);
        integer(k, "catalog.stripe.fixed_cents", 30, 0, 100, Risk.LOW, "Stripe's fixed fee per charge in cents, used by the margin guard." + NOT_ENFORCED);
        integer(k, CATALOG_MARGIN_FLOOR_SUBSCRIPTION_PCT, 80, 80, 95, Risk.HIGH, "Lowest worst-case gross margin (%) a subscription price may have. Cannot go below 80." + NOT_ENFORCED);
        integer(k, CATALOG_MARGIN_FLOOR_SERVICE_PCT, 20, 20, 60, Risk.HIGH, "Lowest gross margin (%) a service price may have. Cannot go below 20." + NOT_ENFORCED);

        // Feature flags: {on, pct, allow[], deny[]}.
        for (String flag : List.of("autopilot", "interview_practice", "orgs", "ops_timesheets")) {
            k.add(new Key("flag." + flag, Type.JSON, FLAG_OFF, null, null, null, "Rollout flag for " + flag.replace('_', ' ') + ": on, a percent of users, and allow/deny lists of logins." + NOT_ENFORCED, AdminSettingKeys::flag, Risk.MEDIUM));
        }

        // Extension remote config (data only: the Chrome Web Store forbids remote code).
        k.add(new Key(EXT_MIN_VERSION, Type.STRING, "0.0.0", null, null, null, "Oldest extension version allowed to fill (major.minor.patch). 0.0.0 = no minimum." + NOT_ENFORCED, null, Risk.HIGH));
        for (String family : EXT_ATS_FAMILIES) {
            k.add(new Key("ext.ats." + family + ".enabled", Type.BOOL, "true", null, null, null, "Whether the extension may fill " + family + " applications." + NOT_ENFORCED, null, Risk.HIGH));
        }
        k.add(new Key(EXT_RULES_VERSION_HINT, Type.STRING, "", null, null, null, "Rules version the extension should pull next (blank = whatever it ships)." + NOT_ENFORCED, null, Risk.LOW));

        Map<String, Key> by = new LinkedHashMap<>();
        for (Key key : k) {
            if (by.put(key.key(), key) != null) throw new IllegalStateException("duplicate admin setting key " + key.key());
        }
        ALL = Collections.unmodifiableList(k);
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private AdminSettingKeys() {}

    /** Every key declared here, in declaration order. */
    public static List<Key> all() {
        return ALL;
    }

    /** The declaration for {@code key}; null when it is not one of these. */
    public static Key find(String key) {
        return key == null ? null : BY_KEY.get(key);
    }

    /** True when a blank stored value is meaningful for {@code k} (an empty recipient or version hint). */
    public static boolean allowsBlank(Key k) {
        return BY_KEY.containsKey(k.key()) && k.type() == Type.STRING && !EXT_MIN_VERSION.equals(k.key());
    }

    /** {@code "INVALID"} when {@code raw} breaks a rule beyond type and bounds (semver, email shape); null when fine. */
    public static String shapeError(Key k, String raw) {
        if (raw == null || !BY_KEY.containsKey(k.key()) || raw.isBlank()) return null;
        String v = raw.trim();
        return switch (k.key()) {
            case EXT_MIN_VERSION -> SEMVER.matcher(v).matches() ? null : "INVALID";
            case OPS_ERROR_DIGEST_TO -> EMAIL.matcher(v).matches() ? null : "INVALID";
            case EXT_RULES_VERSION_HINT -> SEMVER.matcher(v).matches() ? null : "INVALID";
            default -> null;
        };
    }

    // ---- value shapes ---------------------------------------------------------

    /** A feature flag: an object with a boolean {@code on}; optional {@code pct} 0-100 and {@code allow}/{@code deny} login lists. */
    static boolean flag(JsonNode n) {
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
                if (!e.isTextual() || !LOGIN.matcher(e.textValue()).matches()) return false;
            }
        }
        return true;
    }

    // ---- declaration helpers --------------------------------------------------

    private static void integer(List<Key> k, String key, int def, int min, int max, Risk risk, String description) {
        k.add(new Key(key, Type.INT, String.valueOf(def), (double) min, (double) max, null, description, null, risk));
    }

    private static Map<String, Integer> rateLimitDefaults() {
        Map<String, Integer> m = new LinkedHashMap<>();
        m.put("authenticate", 30);
        m.put("mfa", 10);
        m.put("google", 30);
        m.put("refresh", 120);
        m.put("inquiries", 5);
        m.put("bug_reports", 10);
        m.put("newsletter", 10);
        return Collections.unmodifiableMap(m);
    }
}
