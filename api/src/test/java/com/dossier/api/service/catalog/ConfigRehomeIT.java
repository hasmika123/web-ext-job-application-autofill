package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/** K1.6: the numbers that were properties and constants come from the published catalog, and an unpublished catalog changes nothing. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class ConfigRehomeIT extends PlanItSupport {

    @MockBean private StripeGateway gateway;
    @Autowired private CatalogDefaults defaults;
    private final AtomicInteger seq = new AtomicInteger();

    @Test
    void freeCapComesFromTheFreeComponentAndUnpublishedPlansAnswerNothing() {
        assertThat(defaults.resumeCap("FREE")).hasValue(3);
        assertThat(defaults.resumeCap("PRO")).as("PRO is a draft until prices are published").isEmpty();
        assertThat(defaults.aiBudgetCents("PRO", "MONTH")).isEmpty();
        assertThat(defaults.basePriceId("PRO", "MONTH")).isEmpty();
    }

    @Test
    void publishedProAnswersPriceIdBudgetAndCap() {
        when(gateway.isEnabled()).thenReturn(true);
        when(gateway.createProduct(any(ProductSpec.class), any(IdempotencyKey.class))).thenAnswer(i -> "prod_" + ((ProductSpec) i.getArgument(0)).code());
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenAnswer(i -> "price_rh_" + seq.incrementAndGet());
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        patch("PRO", 1, "{\"intervals\":[\"MONTH\",\"QUARTER\"]}");
        publish("PRO", 1);

        assertThat(defaults.basePriceId("PRO", "MONTH")).hasValueSatisfying(id -> assertThat(id).startsWith("price_rh_"));
        assertThat(defaults.basePriceId("PRO", "QUARTER")).isPresent();
        assertThat(defaults.aiBudgetCents("PRO", "MONTH")).hasValue(300);
        assertThat(defaults.aiBudgetCents("PRO", "QUARTER")).as("the quarterly budget is 800, not 3 x 300 (E-2)").hasValue(800);
        assertThat(defaults.resumeCap("PRO")).hasValue(25);
        assertThat(defaults.intervalOfStripePrice(defaults.basePriceId("PRO", "QUARTER").orElseThrow())).hasValue("QUARTER");
    }
}
