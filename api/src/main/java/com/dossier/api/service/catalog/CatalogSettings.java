package com.dossier.api.service.catalog;

import com.dossier.api.service.settings.AdminSettingKeys;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * The catalog's reads of the admin settings ({@link BillingSettingKeys}): which intervals and currencies may carry a published price, whether yearly
 * prices are allowed, and the margin floors. One place, so the rules read the settings the same way everywhere and a test can replace it.
 */
@Component
public class CatalogSettings {

    private final SettingsService settings;

    public CatalogSettings(SettingsService settings) {
        this.settings = settings;
    }

    /** {@code billing.annual.enabled}: with it off, a YEAR price cannot be created or published (subscriptions already yearly run to term end). */
    public boolean annualEnabled() {
        return settings.getBool(BillingSettingKeys.ANNUAL_ENABLED);
    }

    /** The intervals offered to an audience (INDIVIDUAL or ORG), from {@code billing.intervals.*}. */
    public List<String> intervals(String audience) {
        String key = "ORG".equals(audience) ? BillingSettingKeys.INTERVALS_ORG : BillingSettingKeys.INTERVALS_INDIVIDUAL;
        return list(key);
    }

    /** {@code billing.currencies}. */
    public List<String> currencies() {
        return list(BillingSettingKeys.CURRENCIES);
    }

    public String defaultCurrency() {
        return settings.getString(BillingSettingKeys.DEFAULT_CURRENCY);
    }

    /** {@code billing.annual.default_discount_bp}: the global yearly discount a derived YEAR price uses when neither the component nor the plan names one. */
    public int annualDefaultDiscountBp() {
        return settings.getInt(BillingSettingKeys.ANNUAL_DEFAULT_DISCOUNT_BP);
    }

    public String feeModel() {
        return settings.getString(BillingSettingKeys.FEES_MODEL);
    }

    public int subscriptionFloorPct() {
        return settings.getInt(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SUBSCRIPTION_PCT);
    }

    public int serviceFloorPct() {
        return settings.getInt(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SERVICE_PCT);
    }

    private List<String> list(String key) {
        JsonNode n = settings.getJson(key, JsonNode.class);
        List<String> out = new ArrayList<>();
        if (n != null && n.isArray()) n.forEach(e -> out.add(e.asText()));
        return out;
    }
}
