package com.dossier.api.service.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

/** K3.4: the subscription module's settings are registered with safe defaults, bounds and risks; nothing is a constant. */
class BillingSettingKeysTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private Key key(String name) {
        Key k = SettingDefinitions.find(name);
        assertThat(k).as("key %s", name).isNotNull();
        return k;
    }

    private boolean valid(String name, String raw) {
        return ResumeBuilderSettings.isValid(key(name), raw, mapper);
    }

    @Test
    void annualIsOnByDefaultAndHighRisk() {
        Key k = key(BillingSettingKeys.ANNUAL_ENABLED);
        assertThat(k.defaultValue()).isEqualTo("true");
        assertThat(k.risk()).isEqualTo(Risk.HIGH);
        assertThat(key(BillingSettingKeys.ANNUAL_DEFAULT_DISCOUNT_BP).defaultValue()).isEqualTo("1000");
        assertThat(key(BillingSettingKeys.FEES_MODEL).defaultValue()).isEqualTo("SIMPLE");
        assertThat(key(BillingSettingKeys.FEES_MODEL).risk()).isEqualTo(Risk.HIGH);
        assertThat(key(BillingSettingKeys.QUOTE_TTL_MINUTES).defaultValue()).isEqualTo("15");
        assertThat(key(BillingSettingKeys.CATALOG_SHADOW).defaultValue()).isEqualTo("true");
    }

    @Test
    void theIntervalListsAreValidatedAndOrganizationsNeverGetQuarter() {
        assertThat(key(BillingSettingKeys.INTERVALS_INDIVIDUAL).defaultValue()).isEqualTo("[\"MONTH\",\"QUARTER\",\"YEAR\"]");
        assertThat(key(BillingSettingKeys.INTERVALS_ORG).defaultValue()).isEqualTo("[\"MONTH\",\"YEAR\"]");
        assertThat(valid(BillingSettingKeys.INTERVALS_INDIVIDUAL, "[\"MONTH\"]")).isTrue();
        assertThat(valid(BillingSettingKeys.INTERVALS_INDIVIDUAL, "[\"MONTH\",\"MONTH\"]")).as("duplicates").isFalse();
        assertThat(valid(BillingSettingKeys.INTERVALS_INDIVIDUAL, "[]")).as("empty").isFalse();
        assertThat(valid(BillingSettingKeys.INTERVALS_INDIVIDUAL, "[\"WEEK\"]")).isFalse();
        assertThat(valid(BillingSettingKeys.INTERVALS_ORG, "[\"MONTH\",\"QUARTER\"]")).as("ORG + QUARTER is refused (E17)").isFalse();
        assertThat(valid(BillingSettingKeys.INTERVALS_ORG, "[\"YEAR\"]")).isTrue();
    }

    @Test
    void theMigrationNoticeCannotGoBelowThirty() {
        Key k = key(BillingSettingKeys.MIGRATION_NOTICE_DAYS);
        assertThat(k.min()).isEqualTo(30d);
        assertThat(k.defaultValue()).isEqualTo("30");
        assertThat(valid(BillingSettingKeys.MIGRATION_NOTICE_DAYS, "10")).isFalse();
        assertThat(valid(BillingSettingKeys.MIGRATION_NOTICE_DAYS, "30")).isTrue();
        assertThat(valid(BillingSettingKeys.MIGRATION_NOTICE_DAYS, "90")).isTrue();
    }

    @Test
    void theMarginFloorsStillCannotGoBelowTheHardMinimums() {
        assertThat(key(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SUBSCRIPTION_PCT).min()).isEqualTo(80d);
        assertThat(key(AdminSettingKeys.CATALOG_MARGIN_FLOOR_SERVICE_PCT).min()).isEqualTo(20d);
    }

    @Test
    void currenciesAndTheFeeScheduleAreShapeChecked() {
        assertThat(valid(BillingSettingKeys.CURRENCIES, "[\"USD\",\"EUR\"]")).isTrue();
        assertThat(valid(BillingSettingKeys.CURRENCIES, "[\"usd\"]")).isFalse();
        assertThat(valid(BillingSettingKeys.CURRENCIES, "[]")).isFalse();
        assertThat(valid(BillingSettingKeys.FEES_SCHEDULE, BillingSettingKeys.DEFAULT_FEE_SCHEDULE)).isTrue();
        assertThat(valid(BillingSettingKeys.FEES_SCHEDULE, "{\"billing_pct_bp\":20000}")).isFalse();
        assertThat(valid(BillingSettingKeys.FEES_SCHEDULE, "[1]")).isFalse();
    }

    @Test
    void boundsAndRegistryReachability() {
        assertThat(key(BillingSettingKeys.QUOTE_TTL_MINUTES).min()).isEqualTo(1d);
        assertThat(key(BillingSettingKeys.QUOTE_TTL_MINUTES).max()).isEqualTo(240d);
        assertThat(key(BillingSettingKeys.ANNUAL_DEFAULT_DISCOUNT_BP).max()).isEqualTo(3000d);
        assertThat(key(BillingSettingKeys.LICENSE_MAX_SEATS).defaultValue()).isEqualTo("500");
        for (Key k : BillingSettingKeys.all()) {
            // reachable both through the registry the Settings page lists and through the reader every service uses
            assertThat(SettingDefinitions.all()).contains(k);
            assertThat(ResumeBuilderSettingKeys.find(k.key())).isSameAs(k);
        }
    }

    /** Parity with the design (the K3.4 acceptance test): every key 03 section 2 and 08 section 7 name is registered. */
    @Test
    void everyKeyNamedByTheDesignIsRegistered() throws Exception {
        Path pricing = Path.of("..", "docs", "subscriptions", "03-pricing-model.md");
        Path data = Path.of("..", "docs", "subscriptions", "08-data-model.md");
        if (!Files.exists(pricing) || !Files.exists(data)) return; // the docs are not on the test classpath of a packaged build
        Pattern token = Pattern.compile("`((?:billing|catalog|enterprise)\\.[a-z_.]+)`");
        Set<String> named = new LinkedHashSet<>();
        boolean inSettings = false;
        for (String line : Files.readAllLines(pricing, StandardCharsets.UTF_8)) {
            if (line.startsWith("## ")) inSettings = line.startsWith("## 2. Settings");
            if (!inSettings || !line.startsWith("|")) continue;
            String[] cells = line.split("\\|");
            if (cells.length < 2) continue;
            Matcher m = token.matcher(cells[1]);
            while (m.find()) named.add(m.group(1));
        }
        boolean inSeven = false;
        for (String line : Files.readAllLines(data, StandardCharsets.UTF_8)) {
            if (line.startsWith("## ")) inSeven = line.startsWith("## 7. Settings registry additions");
            if (!inSeven) continue;
            Matcher m = token.matcher(line);
            while (m.find()) named.add(m.group(1));
        }
        assertThat(named).as("the design names the module's keys").hasSizeGreaterThan(20);
        for (String name : named) {
            assertThat(SettingDefinitions.find(name)).as("registered: %s", name).isNotNull();
        }
    }
}
