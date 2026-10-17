package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

/** P-15 / W-6 / P-02: Stripe off and a live key outside production refuse a publish; the QA switch lifts only the first. */
class PublishGateTest {

    private final StripeGateway gateway = mock(StripeGateway.class);
    private final SettingsService settings = mock(SettingsService.class);
    private final StripeProperties props = new StripeProperties();

    private PublishGate gate(String profile) {
        MockEnvironment env = new MockEnvironment();
        if (profile != null) env.setActiveProfiles(profile);
        return new PublishGate(gateway, props, settings, env);
    }

    @Test
    void stripeOffIsRefusedWith503ByDefault() {
        when(gateway.isEnabled()).thenReturn(false);
        when(settings.getBool(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE)).thenReturn(false);
        assertThatThrownBy(() -> gate(null).requirePublishable()).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(503);
            assertThat(e.getCode()).isEqualTo("BILLING_DISABLED");
        });
    }

    @Test
    void theQaSwitchLetsAPublishGoWithStripeOff() {
        when(gateway.isEnabled()).thenReturn(false);
        when(settings.getBool(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE)).thenReturn(true);
        assertThatCode(() -> gate(null).requirePublishable()).doesNotThrowAnyException();
    }

    @Test
    void aLiveKeyOutsideProdIsRefusedAndTheQaSwitchDoesNotLiftIt() {
        when(gateway.isEnabled()).thenReturn(true);
        when(settings.getBool(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE)).thenReturn(true);
        props.setSecretKey("sk_live_notarealkey");
        assertThatThrownBy(() -> gate("dev").requirePublishable()).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("LIVE_KEY_NOT_ALLOWED");
            assertThat(e.getMessage()).doesNotContain("notarealkey");
        });
        assertThatThrownBy(() -> gate(null).requirePublishable()).isInstanceOf(CatalogException.class);
    }

    @Test
    void aLiveKeyInTheProdProfileAndATestKeyAnywhereAreFine() {
        when(gateway.isEnabled()).thenReturn(true);
        props.setSecretKey("sk_live_notarealkey");
        assertThatCode(() -> gate("prod").requirePublishable()).doesNotThrowAnyException();
        props.setSecretKey("sk_test_notarealkey");
        assertThatCode(() -> gate("dev").requirePublishable()).doesNotThrowAnyException();
    }
}
