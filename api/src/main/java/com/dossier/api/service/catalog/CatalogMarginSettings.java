package com.dossier.api.service.catalog;

import com.dossier.api.service.billing.margin.FeeModelKind;
import com.dossier.api.service.billing.margin.FeeSchedule;
import com.dossier.api.service.billing.margin.MarginSettings;
import com.dossier.api.service.billing.margin.MarginSettingsPort;
import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * The real {@link MarginSettingsPort} (story K3.2 wiring): a fresh {@link MarginSettings} snapshot per call from the settings registry, so an admin change
 * takes effect on the very next check. Keys: {@code billing.fees.model}, {@code billing.fees.schedule}, {@code catalog.stripe.pct_bp},
 * {@code catalog.stripe.fixed_cents}, {@code catalog.stripe.invoicing_bp}, {@code catalog.margin_floor_subscription_pct},
 * {@code catalog.margin_floor_service_pct}, {@code catalog.org_above_individual_pct}. The fee schedule is a JSON object of snake_case numbers laid over
 * {@link FeeSchedule#DEFAULTS}; a field the object does not name keeps its default.
 */
@Component
public class CatalogMarginSettings implements MarginSettingsPort {

    private static final String PCT_BP = "catalog.stripe.pct_bp";
    private static final String FIXED_CENTS = "catalog.stripe.fixed_cents";

    private final SettingsService settings;

    public CatalogMarginSettings(SettingsService settings) {
        this.settings = settings;
    }

    @Override
    public MarginSettings current() {
        FeeModelKind kind = FeeModelKind.valueOf(settings.getString(BillingSettingKeys.FEES_MODEL));
        return snapshot(kind, settings.getJson(BillingSettingKeys.FEES_SCHEDULE, JsonNode.class));
    }

    /** The settings as they would be with {@code kind} and {@code schedule} (null: the stored schedule), every other number as stored. */
    public MarginSettings with(FeeModelKind kind, JsonNode schedule) {
        JsonNode s = schedule != null ? schedule : settings.getJson(BillingSettingKeys.FEES_SCHEDULE, JsonNode.class);
        return snapshot(kind, s);
    }

    private MarginSettings snapshot(FeeModelKind kind, JsonNode schedule) {
        return new MarginSettings(
            kind,
            settings.getInt(PCT_BP),
            settings.getInt(FIXED_CENTS),
            settings.getInt(BillingSettingKeys.STRIPE_INVOICING_BP),
            schedule(schedule),
            settings.getInt(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SUBSCRIPTION_PCT),
            settings.getInt(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SERVICE_PCT),
            settings.getInt(BillingSettingKeys.ORG_ABOVE_INDIVIDUAL_PCT)
        );
    }

    /** The JSON field names (snake_case of {@link FeeSchedule}'s components). */
    static final java.util.List<String> SCHEDULE_FIELDS = java.util.List.of(
        "card_pct_bp", "card_fixed_cents", "billing_pct_bp", "mor_enabled", "mor_pct_bp", "tax_enabled", "tax_pct_bp", "tax_share_bp",
        "intl_pct_bp", "fx_pct_bp", "intl_share_bp", "dispute_rate_bp", "dispute_cents", "email_cents"
    );

    /** Lay a (partial) schedule object over the defaults. Unknown names are ignored here; {@link #unknownField} reports them for the write path. */
    public static FeeSchedule schedule(JsonNode n) {
        FeeSchedule d = FeeSchedule.DEFAULTS;
        if (n == null || !n.isObject()) return d;
        return new FeeSchedule(
            i(n, "card_pct_bp", d.cardPctBp()),
            l(n, "card_fixed_cents", d.cardFixedCents()),
            i(n, "billing_pct_bp", d.billingPctBp()),
            b(n, "mor_enabled", d.morEnabled()),
            i(n, "mor_pct_bp", d.morPctBp()),
            b(n, "tax_enabled", d.taxEnabled()),
            i(n, "tax_pct_bp", d.taxPctBp()),
            i(n, "tax_share_bp", d.taxShareBp()),
            i(n, "intl_pct_bp", d.intlPctBp()),
            i(n, "fx_pct_bp", d.fxPctBp()),
            i(n, "intl_share_bp", d.intlShareBp()),
            i(n, "dispute_rate_bp", d.disputeRateBp()),
            l(n, "dispute_cents", d.disputeCents()),
            l(n, "email_cents", d.emailCents())
        );
    }

    /** The first field name of {@code n} that is not a fee-schedule field, or null. */
    public static String unknownField(JsonNode n) {
        if (n == null || !n.isObject()) return null;
        for (java.util.Iterator<String> it = n.fieldNames(); it.hasNext();) {
            String f = it.next();
            if (!SCHEDULE_FIELDS.contains(f)) return f;
        }
        return null;
    }

    /** The full schedule as the GET returns it (every field, the stored overlay on the defaults). */
    public static Map<String, Object> scheduleMap(FeeSchedule s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("card_pct_bp", s.cardPctBp());
        m.put("card_fixed_cents", s.cardFixedCents());
        m.put("billing_pct_bp", s.billingPctBp());
        m.put("mor_enabled", s.morEnabled());
        m.put("mor_pct_bp", s.morPctBp());
        m.put("tax_enabled", s.taxEnabled());
        m.put("tax_pct_bp", s.taxPctBp());
        m.put("tax_share_bp", s.taxShareBp());
        m.put("intl_pct_bp", s.intlPctBp());
        m.put("fx_pct_bp", s.fxPctBp());
        m.put("intl_share_bp", s.intlShareBp());
        m.put("dispute_rate_bp", s.disputeRateBp());
        m.put("dispute_cents", s.disputeCents());
        m.put("email_cents", s.emailCents());
        return m;
    }

    private static int i(JsonNode n, String f, int d) {
        return n.has(f) && n.get(f).canConvertToInt() ? n.get(f).intValue() : d;
    }

    private static long l(JsonNode n, String f, long d) {
        return n.has(f) && n.get(f).canConvertToLong() ? n.get(f).longValue() : d;
    }

    private static boolean b(JsonNode n, String f, boolean d) {
        return n.has(f) && n.get(f).isBoolean() ? n.get(f).booleanValue() : d;
    }
}
