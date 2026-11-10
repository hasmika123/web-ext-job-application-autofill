package com.dossier.api.service.settings;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import org.junit.jupiter.api.Test;

/** The personal quote, change and checkout code reads these keys; they are registered with safe defaults and bounds, nothing is a constant (stories K3.3, K5.3, K5.4). */
class PersonalBillingSettingKeysTest {

    private Key key(String name) {
        Key k = SettingDefinitions.find(name);
        assertThat(k).as("key %s", name).isNotNull();
        assertThat(ResumeBuilderSettingKeys.find(name)).isSameAs(k);
        return k;
    }

    @Test
    void theQuoteRateLimitDefaultsToThirtyAMinuteWithinBounds() {
        Key k = key(BillingSettingKeys.QUOTE_RATE_PER_MIN);
        assertThat(k.defaultValue()).isEqualTo("30");
        assertThat(k.min()).isEqualTo(1d);
        assertThat(k.max()).isEqualTo(600d);
    }

    @Test
    void theRetryBudgetAndTheConsentLineAreRegistered() {
        assertThat(key(BillingSettingKeys.CHANGE_RETRY_MAX_ATTEMPTS).defaultValue()).isEqualTo("5");
        String consent = key(BillingSettingKeys.CHECKOUT_CONSENT_TEXT).defaultValue();
        assertThat(consent).contains("No refunds").contains("cancel anytime");
    }

    @Test
    void theKeysThePersonalCodeReadsNoLongerSayTheyAreNotEnforced() {
        assertThat(key(BillingSettingKeys.QUOTE_TTL_MINUTES).description()).doesNotContain("Not enforced");
        assertThat(key(BillingSettingKeys.ADDON_MAX_TOTAL_QUANTITY).description()).doesNotContain("Not enforced");
    }
}
