package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PublishPriceRequest;
import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import com.fasterxml.jackson.databind.node.BooleanNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/** W-4, P-15, W-6, P-02 end to end: the gates on the real publish paths (plan and single price). */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class PublishGuardsIT extends PlanItSupport {

    @MockBean private StripeGateway gateway;
    @Autowired private SettingsService settings;
    @Autowired private StripeProperties props;

    @AfterEach
    void restoreKey() {
        props.setSecretKey("");
    }

    private static void assertCode(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    private void priceProV1() {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        patch("PRO", 1, "{\"intervals\":[\"MONTH\",\"QUARTER\"]}");
    }

    @Test
    void anOrgPlanWithoutASetupFeeIsRefused() {
        patch("ORG_STANDARD", 1, "{\"seatRules\":null}");
        when(gateway.isEnabled()).thenReturn(true);
        assertCode(() -> publish("ORG_STANDARD", 1), 422, "SETUP_FEE_REQUIRED");
    }

    @Test
    void stripeOffRefusesAPlanAndAPricePublishUntilTheQaSwitchIsOn() {
        settings.set(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE, BooleanNode.FALSE, "Test: refuse a publish while Stripe is off");
        when(gateway.isEnabled()).thenReturn(false);
        priceProV1();
        assertCode(() -> publish("PRO", 1), 503, "BILLING_DISABLED");
        PriceDTO d = draft("FEAT_AI_JOB_MATCHING", "INDIVIDUAL", "MONTH", 500);
        assertCode(() -> catalog.publish(d.id(), new PublishPriceRequest(null, REASON, null)), 503, "BILLING_DISABLED");

        settings.set(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE, BooleanNode.TRUE, "Test: QA stack publishes without Stripe");
        assertThat(publish("PRO", 1).status()).isEqualTo("PUBLISHED");
    }

    @Test
    void aLiveKeyOutsideProductionIsRefusedEvenWithTheQaSwitchOn() {
        settings.set(BillingSettingKeys.PUBLISH_ALLOW_WITHOUT_STRIPE, BooleanNode.TRUE, "Test: switch on, must not lift the live key rule");
        when(gateway.isEnabled()).thenReturn(true);
        when(gateway.createProduct(any(ProductSpec.class), any(IdempotencyKey.class))).thenReturn("prod_x");
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenReturn("price_x");
        props.setSecretKey("sk_live_notarealkey");
        priceProV1();
        assertCode(() -> publish("PRO", 1), 422, "LIVE_KEY_NOT_ALLOWED");
    }
}
