package com.dossier.api.service.settings;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The subscription module's settings (docs/subscriptions/03-pricing-model.md section 2 and 08-data-model.md section 7; story K3.4): billing
 * intervals, the annual switches and discount, the fee model, quote TTL, seat limits, the catalog shadow switch, the public-catalog cache and
 * the migration notice. Same {@link Key} record and bounds as the other registries; {@code SettingDefinitions} and {@code
 * ResumeBuilderSettingKeys.find} consult this class, so the admin Settings page lists them (areas {@code billing}, {@code catalog} and {@code
 * enterprise}) with no further wiring. The keys of the margin guard that already exist ({@code catalog.stripe.pct_bp}, {@code
 * catalog.stripe.fixed_cents}, {@code catalog.margin_floor_*_pct}) stay in {@link AdminSettingKeys}; their hard minimums (80 and 20) are the
 * bounds there.
 *
 * <p>Every default is the safe one of the design: annual billing ON (decision S-01, answered 2026-10-15), the SIMPLE fee model (the model the
 * locked prices were set with), the catalog resolver in shadow, USD only. Keys no code reads yet say so in their description, the same
 * convention as the other registries; the story that starts reading a key removes the sentence.
 *
 * <p>Nothing here is a secret and no price lives here: prices are {@code product_price} rows.
 */
public final class BillingSettingKeys {

    public static final String FEES_MODEL = "billing.fees.model";
    public static final String FEES_SCHEDULE = "billing.fees.schedule";
    public static final String STRIPE_INVOICING_BP = "catalog.stripe.invoicing_bp";
    public static final String ORG_ABOVE_INDIVIDUAL_PCT = "catalog.org_above_individual_pct";
    public static final String INTERVALS_INDIVIDUAL = "billing.intervals.individual";
    public static final String INTERVALS_ORG = "billing.intervals.org";
    public static final String ANNUAL_ENABLED = "billing.annual.enabled";
    public static final String ANNUAL_DEFAULT_DISCOUNT_BP = "billing.annual.default_discount_bp";
    public static final String ANNUAL_ALLOWANCE_PERIOD = "billing.annual.allowance_period";
    public static final String ANNUAL_SWITCH_TO_MONTHLY = "billing.annual.switch_to_monthly";
    public static final String ANNUAL_SEAT_TRANSFER_FREE = "billing.annual.seat_transfer_free";
    public static final String QUOTE_TTL_MINUTES = "billing.quote.ttl_minutes";
    public static final String FUTURE_DATED_MAX_DAYS = "billing.future_dated_max_days";
    public static final String LICENSE_MAX_SEATS = "enterprise.license.max_seats";
    public static final String PRORATION_AUTHORITY = "billing.proration.authority";
    public static final String DEFAULT_CURRENCY = "billing.default_currency";
    public static final String CURRENCIES = "billing.currencies";
    public static final String CATALOG_SHADOW = "billing.catalog.shadow";
    public static final String PUBLIC_CATALOG_CACHE_SECONDS = "billing.public_catalog.cache_seconds";
    public static final String PLAN_MAX_OPTIONAL_ADDONS = "billing.plan.max_optional_addons";
    public static final String PLAN_SUNSET_NOTICE_DAYS = "billing.plan.sunset_notice_days";
    public static final String MIGRATION_NOTICE_DAYS = "billing.migration.notice_days";
    public static final String ADDON_MAX_TOTAL_QUANTITY = "billing.addon.max_total_quantity";
    public static final String QUOTE_RATE_PER_MIN = "billing.quote.rate_per_min";
    public static final String CHANGE_RETRY_MAX_ATTEMPTS = "billing.change.retry_max_attempts";
    public static final String CHECKOUT_CONSENT_TEXT = "billing.checkout.consent_text";

    /** Hard minimum of {@link #MIGRATION_NOTICE_DAYS} (the legal floor for a price change, B4.2): the registry refuses lower. */
    public static final int MIGRATION_NOTICE_HARD_MIN_DAYS = 30;

    public static final String DEFAULT_INTERVALS_INDIVIDUAL = "[\"MONTH\",\"QUARTER\",\"YEAR\"]";
    public static final String DEFAULT_INTERVALS_ORG = "[\"MONTH\",\"YEAR\"]";
    public static final String DEFAULT_CURRENCIES = "[\"USD\"]";
    public static final String DEFAULT_FEE_SCHEDULE = "{\"billing_pct_bp\":70,\"mor_enabled\":false,\"tax_enabled\":false,\"intl_share_bp\":2500}";

    private static final Pattern CURRENCY = Pattern.compile("[A-Z]{3}");
    private static final Pattern SCHEDULE_FIELD = Pattern.compile("[a-z][a-z0-9_]{0,39}");
    private static final String NOT_ENFORCED = " Not enforced yet: it takes effect once the feature that reads it ships.";

    private static final List<Key> ALL;
    private static final Map<String, Key> BY_KEY;

    static {
        List<Key> k = new ArrayList<>();

        // Fee model and margin guard inputs (read by MarginCalculator v2, K3.2). The Stripe percentage/fixed fee and the 80/20 floors stay in AdminSettingKeys.
        k.add(new Key(FEES_MODEL, Type.ENUM, "SIMPLE", null, null, List.of("SIMPLE", "SCHEDULE"),
            "Which fee model the margin guard uses: SIMPLE (Stripe percentage plus fixed fee, the model the locked prices were set with) or SCHEDULE (the itemised schedule below)." + NOT_ENFORCED,
            null, Risk.HIGH));
        k.add(new Key(FEES_SCHEDULE, Type.JSON, DEFAULT_FEE_SCHEDULE, null, null, null,
            "The itemised fee schedule used when the fee model is SCHEDULE, as a JSON object of basis-point numbers (0 to 10000) and on/off booleans." + NOT_ENFORCED,
            BillingSettingKeys::feeSchedule, Risk.HIGH));
        integer(k, STRIPE_INVOICING_BP, 40, 0, 200, Risk.LOW, "Stripe's invoicing surcharge in basis points on send-invoice billing, used by the margin guard." + NOT_ENFORCED);
        integer(k, ORG_ABOVE_INDIVIDUAL_PCT, 25, 0, 100, Risk.MEDIUM, "How many percent more than the individual price an organization preset must cost (the 'above individual' check of the catalog)." + NOT_ENFORCED);

        // Intervals and annual billing (decision S-01: annual is ON).
        k.add(new Key(INTERVALS_INDIVIDUAL, Type.JSON, DEFAULT_INTERVALS_INDIVIDUAL, null, null, null,
            "Billing intervals offered to individuals, a JSON list drawn from MONTH, QUARTER, YEAR. A price row of an interval not listed here cannot be published.",
            n -> intervals(n, true), Risk.HIGH));
        k.add(new Key(INTERVALS_ORG, Type.JSON, DEFAULT_INTERVALS_ORG, null, null, null,
            "Billing intervals offered to organizations, a JSON list drawn from MONTH and YEAR. QUARTER is never offered to an organization (E17).",
            n -> intervals(n, false), Risk.HIGH));
        k.add(new Key(ANNUAL_ENABLED, Type.BOOL, "true", null, null, null,
            "Yearly billing. On (the default, decision S-01): YEAR prices can be published. Off: new YEAR prices are refused; subscriptions already on a yearly term run to the end of the term.",
            null, Risk.HIGH));
        integer(k, ANNUAL_DEFAULT_DISCOUNT_BP, 1000, 0, 3000, Risk.HIGH, "Default yearly discount in basis points (1000 = 10 %) used to derive a YEAR price from its monthly price. A plan or a component may override it; the margin guard still has the last word." + NOT_ENFORCED);
        k.add(new Key(ANNUAL_ALLOWANCE_PERIOD, Type.ENUM, "MONTH", null, null, List.of("MONTH", "PERIOD"),
            "How allowances and the AI budget are spent on a yearly term: MONTH (twelve monthly windows) or PERIOD (one pool for the year)." + NOT_ENFORCED, null, Risk.HIGH));
        k.add(new Key(ANNUAL_SWITCH_TO_MONTHLY, Type.ENUM, "AT_TERM_END", null, null, List.of("AT_TERM_END"),
            "When a yearly subscriber who switches to monthly is moved: at the end of the paid term (the only value today)." + NOT_ENFORCED, null, Risk.HIGH));
        k.add(new Key(ANNUAL_SEAT_TRANSFER_FREE, Type.BOOL, "true", null, null, null,
            "Moving a seat from one consultant to another costs nothing and changes nothing in Stripe." + NOT_ENFORCED, null, Risk.MEDIUM));

        // Quotes, dated changes, seats, add-on limits.
        integer(k, QUOTE_TTL_MINUTES, 15, 1, 240, Risk.LOW, "Minutes a personal quote stays valid before it must be recomputed.");
        integer(k, QUOTE_RATE_PER_MIN, 30, 1, 600, Risk.LOW, "Most quote requests one IP address may make per minute (the pricing page asks anonymously, so this is the only brake).");
        integer(k, CHANGE_RETRY_MAX_ATTEMPTS, 5, 1, 20, Risk.LOW, "How many times a confirmed subscription change that Stripe refused is retried before it is left FAILED for an administrator.");
        k.add(new Key(CHECKOUT_CONSENT_TEXT, Type.STRING,
            "Subscriptions renew automatically until cancelled. No refunds for partial periods: cancel anytime and keep access to the end of the period you paid for.",
            null, null, null, "The consent line shown above the pay button of the hosted Stripe checkout.", null, Risk.MEDIUM));
        integer(k, FUTURE_DATED_MAX_DAYS, 30, 0, 60, Risk.LOW, "Furthest ahead (days) a change to a subscription may be dated." + NOT_ENFORCED);
        integer(k, LICENSE_MAX_SEATS, 500, 1, 5000, Risk.MEDIUM, "Most consultant seats one organization plan may hold." + NOT_ENFORCED);
        integer(k, PLAN_MAX_OPTIONAL_ADDONS, 8, 1, 50, Risk.LOW, "Most optional add-ons one plan version may offer." + NOT_ENFORCED);
        integer(k, ADDON_MAX_TOTAL_QUANTITY, 10, 1, 100, Risk.LOW, "Most add-on units (all add-ons together) one subscription may hold.");

        // Proration and currency.
        k.add(new Key(PRORATION_AUTHORITY, Type.ENUM, "KIWIPLY", null, null, List.of("KIWIPLY"),
            "Who computes proration: Kiwiply (the only value; Stripe is always told not to prorate)." + NOT_ENFORCED, null, Risk.HIGH));
        k.add(new Key(DEFAULT_CURRENCY, Type.ENUM, "USD", null, null, List.of("USD", "EUR", "GBP", "CAD", "AUD", "INR"),
            "Currency of a price row when none is named (USD only today; it must be one of the offered currencies)." + NOT_ENFORCED, null, Risk.HIGH));
        k.add(new Key(CURRENCIES, Type.JSON, DEFAULT_CURRENCIES, null, null, null,
            "Currencies a price row may be published in, as a JSON list of upper-case ISO codes. A price in a currency not listed is refused.",
            BillingSettingKeys::currencies, Risk.HIGH));

        // Rollout, caching and notices.
        k.add(new Key(CATALOG_SHADOW, Type.BOOL, "true", null, null, null,
            "Shadow mode of the catalog-based entitlement resolver: on = the current gates decide and the resolver is only compared; off = the resolver decides." + NOT_ENFORCED, null, Risk.HIGH));
        integer(k, PUBLIC_CATALOG_CACHE_SECONDS, 300, 0, 3600, Risk.LOW, "Seconds the public catalog (the pricing page) is cached. 0 = no cache." + NOT_ENFORCED);
        integer(k, PLAN_SUNSET_NOTICE_DAYS, 30, 1, 365, Risk.MEDIUM, "Days of notice before a plan version is sunset." + NOT_ENFORCED);
        integer(k, MIGRATION_NOTICE_DAYS, MIGRATION_NOTICE_HARD_MIN_DAYS, MIGRATION_NOTICE_HARD_MIN_DAYS, 365, Risk.HIGH,
            "Days of notice a subscriber gets before a price or plan change reaches them. Cannot go below 30 (the legal minimum for a price change)." + NOT_ENFORCED);

        Map<String, Key> by = new LinkedHashMap<>();
        for (Key key : k) {
            if (by.put(key.key(), key) != null) throw new IllegalStateException("duplicate billing setting key " + key.key());
        }
        ALL = Collections.unmodifiableList(k);
        BY_KEY = Collections.unmodifiableMap(by);
    }

    private BillingSettingKeys() {}

    /** Every key declared here, in declaration order. */
    public static List<Key> all() {
        return ALL;
    }

    /** The declaration for {@code key}; null when it is not one of these. */
    public static Key find(String key) {
        return key == null ? null : BY_KEY.get(key);
    }

    // ---- value shapes ---------------------------------------------------------

    /** A non-empty JSON list of distinct intervals; an organization list never holds QUARTER. */
    static boolean intervals(JsonNode n, boolean individual) {
        if (n == null || !n.isArray() || n.isEmpty() || n.size() > 3) return false;
        Set<String> seen = new HashSet<>();
        for (JsonNode e : n) {
            if (!e.isTextual()) return false;
            String v = e.textValue();
            boolean ok = v.equals("MONTH") || v.equals("YEAR") || (individual && v.equals("QUARTER"));
            if (!ok || !seen.add(v)) return false;
        }
        return true;
    }

    /** A JSON list of 1 to 20 distinct three-letter upper-case currency codes. */
    static boolean currencies(JsonNode n) {
        if (n == null || !n.isArray() || n.isEmpty() || n.size() > 20) return false;
        Set<String> seen = new HashSet<>();
        for (JsonNode e : n) {
            if (!e.isTextual() || !CURRENCY.matcher(e.textValue()).matches() || !seen.add(e.textValue())) return false;
        }
        return true;
    }

    /** A JSON object of at most 20 members, each a basis-point number 0..10000 or a boolean. */
    static boolean feeSchedule(JsonNode n) {
        if (n == null || !n.isObject() || n.isEmpty() || n.size() > 20) return false;
        for (Iterator<Map.Entry<String, JsonNode>> it = n.fields(); it.hasNext();) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode v = e.getValue();
            boolean ok = v.isBoolean() || (v.isInt() && v.intValue() >= 0 && v.intValue() <= 10000);
            if (!ok || !SCHEDULE_FIELD.matcher(e.getKey()).matches()) return false;
        }
        return true;
    }

    private static void integer(List<Key> k, String key, int def, int min, int max, Risk risk, String description) {
        k.add(new Key(key, Type.INT, String.valueOf(def), (double) min, (double) max, null, description, null, risk));
    }
}
