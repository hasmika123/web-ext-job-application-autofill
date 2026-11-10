package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.PriceSpec;
import com.dossier.api.service.billing.StripeGateway.ProductSpec;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** K1.5: Stripe Product and Price creation at publish, deactivation at retire, the idempotency keys, and silence when billing is off. */
class CatalogStripePublisherTest {

    private StripeGateway gateway;
    private ProductRepository products;
    private CatalogStripePublisher publisher;
    private Product product;

    @BeforeEach
    void setUp() {
        gateway = mock(StripeGateway.class);
        products = mock(ProductRepository.class);
        when(gateway.isEnabled()).thenReturn(true);
        product = new Product();
        product.setId(5L);
        product.setCode("PRO");
        product.setName("Pro");
        product.setKind("SUBSCRIPTION");
        when(products.findById(5L)).thenReturn(Optional.of(product));
        when(products.save(any(Product.class))).thenAnswer(i -> i.getArgument(0));
        publisher = new CatalogStripePublisher(gateway, products);
    }

    private static ProductPrice row(long id, String interval, long amount) {
        ProductPrice p = new ProductPrice();
        p.setId(id);
        p.setProductId(5L);
        p.setAudience("INDIVIDUAL");
        p.setBillingInterval(interval);
        p.setAmountMinor(amount);
        p.setCurrency("USD");
        p.setCatalogVersion(7);
        return p;
    }

    @Test
    void publishCreatesTheProductOnceAndThePriceWithTheDocumentedKeysAndMetadata() {
        when(gateway.createProduct(any(ProductSpec.class), any(IdempotencyKey.class))).thenReturn("prod_1");
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenReturn("price_a", "price_b");
        ProductPrice month = row(11, "MONTH", 1999);
        ProductPrice year = row(12, "YEAR", 21589);

        publisher.onPublish(month);
        publisher.onPublish(year);

        assertThat(month.getStripePriceId()).isEqualTo("price_a");
        assertThat(year.getStripePriceId()).isEqualTo("price_b");
        assertThat(product.getStripeProductId()).isEqualTo("prod_1");
        ArgumentCaptor<IdempotencyKey> productKey = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway, times(1)).createProduct(any(ProductSpec.class), productKey.capture());
        assertThat(productKey.getValue().value()).isEqualTo("prod-PRO");

        ArgumentCaptor<PriceSpec> spec = ArgumentCaptor.forClass(PriceSpec.class);
        ArgumentCaptor<IdempotencyKey> priceKey = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway, times(2)).createPrice(spec.capture(), priceKey.capture());
        assertThat(priceKey.getAllValues()).extracting(IdempotencyKey::value).containsExactly("price-11", "price-12");
        assertThat(spec.getAllValues().get(0).interval()).isEqualTo(PriceInterval.MONTH);
        assertThat(spec.getAllValues().get(1).interval()).isEqualTo(PriceInterval.YEAR);
        assertThat(spec.getAllValues().get(1).unitAmountMinor()).isEqualTo(21589);
        assertThat(spec.getAllValues().get(0).productId()).isEqualTo("prod_1");
        assertThat(spec.getAllValues().get(0).metadata()).containsEntry("price_row_id", "11").containsEntry("audience", "INDIVIDUAL").containsEntry("catalog_version", "7").containsEntry("product_code", "PRO");
    }

    @Test
    void everyIntervalMapsToItsStripeRecurrence() {
        assertThat(CatalogStripePublisher.interval("MONTH").intervalCount()).isEqualTo(1);
        assertThat(CatalogStripePublisher.interval("QUARTER").intervalCount()).isEqualTo(3);
        assertThat(CatalogStripePublisher.interval("YEAR").intervalCount()).isEqualTo(12);
        assertThat(CatalogStripePublisher.interval("ONE_TIME").isRecurring()).isFalse();
    }

    @Test
    void aRetryOfTheSamePublishUsesTheSameKeyEvenWhenTheFirstIdWasLostWithTheRollback() {
        product.setStripeProductId("prod_1");
        when(gateway.createPrice(any(PriceSpec.class), any(IdempotencyKey.class))).thenReturn("price_same");
        publisher.onPublish(row(11, "MONTH", 1999)); // first attempt: the commit later failed, the id was not stored
        publisher.onPublish(row(11, "MONTH", 1999)); // the retry builds a fresh entity without the id
        ArgumentCaptor<IdempotencyKey> key = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway, times(2)).createPrice(any(PriceSpec.class), key.capture());
        assertThat(key.getAllValues()).extracting(IdempotencyKey::value).containsOnly("price-11");
    }

    @Test
    void aRowThatAlreadyHasItsStripePriceIsNeverCreatedTwice() {
        ProductPrice p = row(11, "MONTH", 1999);
        p.setStripePriceId("price_have");
        publisher.onPublish(p);
        verify(gateway, never()).createPrice(any(PriceSpec.class), any(IdempotencyKey.class));
        assertThat(p.getStripePriceId()).isEqualTo("price_have");
    }

    @Test
    void retireDeactivatesNeverDeletesAndSkipsRowsWithoutAStripePrice() {
        ProductPrice p = row(11, "MONTH", 1999);
        publisher.onRetire(p);
        verify(gateway, never()).deactivatePrice(any(), any());
        p.setStripePriceId("price_a");
        publisher.onRetire(p);
        ArgumentCaptor<IdempotencyKey> key = ArgumentCaptor.forClass(IdempotencyKey.class);
        verify(gateway).deactivatePrice(eq("price_a"), key.capture());
        assertThat(key.getValue().value()).isEqualTo("price-off-11");
    }

    @Test
    void withBillingDisabledNothingIsSentAndTheIdStaysNull() {
        when(gateway.isEnabled()).thenReturn(false);
        ProductPrice p = row(11, "MONTH", 1999);
        publisher.onPublish(p);
        p.setStripePriceId("price_a");
        publisher.onRetire(p);
        assertThat(product.getStripeProductId()).isNull();
        verify(gateway, times(2)).isEnabled();
        verifyNoInteractionsBeyondEnabled();
    }

    private void verifyNoInteractionsBeyondEnabled() {
        verify(gateway, never()).createProduct(any(), any());
        verify(gateway, never()).createPrice(any(), any());
        verify(gateway, never()).deactivatePrice(any(), any());
        verifyNoInteractions(products);
    }
}
