package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import com.dossier.api.service.catalog.dto.CatalogPriceDTOs.PriceDTO;
import com.dossier.api.service.catalog.dto.PlanDTOs.NewVersionRequest;
import com.dossier.api.service.catalog.dto.PlanDTOs.PlanVersionDTO;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K1.5 + K2.2 with Stripe switched on (a mocked gateway, test mode semantics): publishing a plan creates the Stripe Product once and a Stripe Price per
 * published row with the documented idempotency keys, the derived yearly row gets its own Price, a row published while Stripe was off gets its Price when a
 * plan version needs it, and a replaced row is deactivated only after every new Price exists. (CatalogStripePublisherTest, PlanPublishIT with the gateway.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class PlanPublishStripeIT extends PlanItSupport {

    @MockBean private StripeGateway gateway;

    private final AtomicInteger seq = new AtomicInteger();

    @BeforeEach
    void stripeOn() {
        when(gateway.isEnabled()).thenReturn(true);
        when(gateway.createProduct(any(ProductSpec.class), any(IdempotencyKey.class))).thenAnswer(i -> "prod_" + ((ProductSpec) i.getArgument(0)).code());
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenAnswer(i -> "price_it_" + seq.incrementAndGet());
    }

    private void priceProV1() {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        patch("PRO", 1, "{\"intervals\":[\"MONTH\",\"QUARTER\",\"YEAR\"]}");
    }

    @Test
    void publishCreatesOneProductAndOnePricePerRowIncludingTheDerivedYear() {
        priceProV1();
        PlanVersionDTO v = publish("PRO", 1);

        verify(gateway, times(1)).createProduct(any(ProductSpec.class), eq(IdempotencyKey.of("prod", "PRO")));
        ArgumentCaptor<PriceSpec> spec = ArgumentCaptor.forClass(PriceSpec.class);
        ArgumentCaptor<IdempotencyKey> key = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway, times(3)).createPrice(spec.capture(), key.capture());
        assertThat(spec.getAllValues()).extracting(PriceSpec::interval).containsExactlyInAnyOrder(PriceInterval.MONTH, PriceInterval.QUARTER, PriceInterval.YEAR);
        assertThat(spec.getAllValues()).filteredOn(s -> s.interval() == PriceInterval.YEAR).singleElement().satisfies(s -> {
            assertThat(s.unitAmountMinor()).isEqualTo(21589);
            assertThat(s.productId()).isEqualTo("prod_PRO");
            assertThat(s.metadata()).containsEntry("product_code", "PRO");
        });
        assertThat(key.getAllValues()).allSatisfy(k -> assertThat(k.value()).matches("price-\\d+"));
        assertThat(key.getAllValues()).extracting(IdempotencyKey::value).doesNotHaveDuplicates();
        assertThat(jdbc.queryForObject("select count(*) from product_price pp join product p on p.id = pp.product_id where p.code = 'PRO' and pp.stripe_price_id like 'price_it_%'", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select stripe_product_id from product where code = 'PRO'", String.class)).isEqualTo("prod_PRO");
        assertThat(v.baseProduct().prices()).hasSize(3);
    }

    @Test
    void aRowPublishedWhileStripeWasOffGetsItsPriceWhenAPlanVersionNeedsIt() {
        when(gateway.isEnabled()).thenReturn(false);
        PriceDTO month = live("PRO", "INDIVIDUAL", "MONTH", 1999);
        assertThat(month.stripePriceId()).isNull();
        verify(gateway, never()).createPrice(any(), any());

        when(gateway.isEnabled()).thenReturn(true);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        withoutOptionals("PRO", 1);
        publish("PRO", 1);
        ArgumentCaptor<IdempotencyKey> key = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway, times(2)).createPrice(any(PriceSpec.class), key.capture());
        assertThat(key.getAllValues()).extracting(IdempotencyKey::value).contains("price-" + month.id());
        assertThat(row(month.id()).getStripePriceId()).startsWith("price_it_");
    }

    @Test
    void aReplacedRowIsDeactivatedOnlyAfterEveryNewPriceExists() {
        priceProV1();
        publish("PRO", 1);
        Long oldMonth = jdbc.queryForObject("select pp.id from product_price pp join product p on p.id = pp.product_id where p.code = 'PRO' and pp.billing_interval = 'MONTH' and pp.active = 1", Long.class);
        String oldStripe = row(oldMonth).getStripePriceId();
        PlanVersionDTO v2 = plans.newVersion("PRO", new NewVersionRequest(null, REASON));
        draft("PRO", "INDIVIDUAL", "MONTH", 2499);
        org.mockito.Mockito.clearInvocations(gateway);
        publish("PRO", v2.version());

        InOrder order = inOrder(gateway);
        // the new monthly row and the yearly row derived from it, then the deactivation of the monthly row they replace
        order.verify(gateway, times(2)).createPrice(any(PriceSpec.class), any(IdempotencyKey.class));
        order.verify(gateway).deactivatePrice(eq(oldStripe), eq(IdempotencyKey.of("price-off", oldMonth)));
        assertThat(row(oldMonth).getRetiredAt()).isNotNull();
    }

    @Test
    void whenStripeRefusesNothingStaysPublishedInThatCall() {
        priceProV1();
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenThrow(new com.dossier.api.service.billing.StripeGatewayException("boom", com.dossier.api.service.billing.StripeGatewayException.Kind.SERVER, null, null));
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> publish("PRO", 1)).isInstanceOf(com.dossier.api.service.billing.StripeGatewayException.class);
        List<String> ids = jdbc.queryForList("select stripe_price_id from product_price where stripe_price_id is not null", String.class);
        assertThat(ids).as("no Stripe id was stored for a failed publish").isEmpty();
    }
}
