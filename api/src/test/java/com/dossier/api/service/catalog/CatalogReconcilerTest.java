package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.ProductPriceRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.StripePriceInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** K1.5: the nightly reconciler flags unknown, mismatched and missing Stripe prices as CATALOG drift, resolves what stops differing, and writes nothing else. */
class CatalogReconcilerTest {

    /** An in-memory drift table. */
    static class FakeDrifts implements BillingDriftRepository {
        final List<BillingDrift> rows = new ArrayList<>();

        @Override
        public <S extends BillingDrift> S save(S d) {
            if (!rows.contains(d)) rows.add(d);
            return d;
        }

        @Override
        public long count() {
            return rows.size();
        }

        @Override
        public Optional<BillingDrift> findById(Long id) {
            return rows.stream().filter(r -> id.equals(r.getId())).findFirst();
        }

        @Override
        public List<BillingDrift> findOpen(String kind) {
            return rows.stream().filter(r -> kind.equals(r.getKind()) && r.getResolvedAt() == null).toList();
        }

        @Override
        public Optional<BillingDrift> findOpenOne(String kind, String code, String subject) {
            return findOpen(kind).stream().filter(r -> code.equals(r.getCode()) && subject.equals(r.getSubject())).findFirst();
        }
    }

    private StripeGateway gateway;
    private ProductPriceRepository prices;
    private FakeDrifts drifts;
    private CatalogReconciler reconciler;
    private ProductPrice row;

    @BeforeEach
    void setUp() {
        gateway = mock(StripeGateway.class);
        prices = mock(ProductPriceRepository.class);
        drifts = new FakeDrifts();
        when(gateway.isEnabled()).thenReturn(true);
        row = new ProductPrice();
        row.setId(11L);
        row.setProductId(5L);
        row.setBillingInterval("MONTH");
        row.setAmountMinor(1999L);
        row.setCurrency("USD");
        row.setStripePriceId("price_a");
        row.setPublishedAt(Instant.now());
        when(prices.findAllPublished()).thenReturn(List.of(row));
        reconciler = new CatalogReconciler(gateway, prices, drifts, new ObjectMapper());
    }

    private static StripePriceInfo stripe(String id, long amount, boolean active, PriceInterval interval) {
        return new StripePriceInfo(id, "prod_1", "USD", amount, active, interval, Map.of("app", "kiwiply"));
    }

    @Test
    void aStripePriceThatMatchesItsRowIsNotDrift() {
        when(gateway.listPrices(5000)).thenReturn(List.of(stripe("price_a", 1999, true, PriceInterval.MONTH)));
        CatalogReconciler.Result r = reconciler.run();
        assertThat(r.ran()).isTrue();
        assertThat(r.checked()).isEqualTo(1);
        assertThat(drifts.rows).isEmpty();
    }

    @Test
    void anAmountEditedInTheDashboardIsDriftWithinOneRunAndTheRowIsNeverTouched() {
        when(gateway.listPrices(5000)).thenReturn(List.of(stripe("price_a", 2499, true, PriceInterval.MONTH)));
        CatalogReconciler.Result r = reconciler.run();
        assertThat(r.opened()).isEqualTo(1);
        BillingDrift d = drifts.rows.get(0);
        assertThat(d.getKind()).isEqualTo("CATALOG");
        assertThat(d.getCode()).isEqualTo("AMOUNT_MISMATCH");
        assertThat(d.getSubject()).isEqualTo("price_a");
        assertThat(d.getExpectedJson()).contains("1999");
        assertThat(d.getActualJson()).contains("2499");
        assertThat(row.getAmountMinor()).isEqualTo(1999L);
        verify(prices, never()).save(row);
        // a second run does not open a duplicate
        assertThat(reconciler.run().opened()).isZero();
        assertThat(drifts.rows).hasSize(1);
    }

    @Test
    void unknownMissingAndActiveMismatchesAreEachFlagged() {
        ProductPrice retired = new ProductPrice();
        retired.setId(12L);
        retired.setBillingInterval("QUARTER");
        retired.setAmountMinor(4999L);
        retired.setCurrency("USD");
        retired.setStripePriceId("price_old");
        retired.setRetiredAt(Instant.now());
        ProductPrice gone = new ProductPrice();
        gone.setId(13L);
        gone.setBillingInterval("YEAR");
        gone.setAmountMinor(21589L);
        gone.setCurrency("USD");
        gone.setStripePriceId("price_gone");
        when(prices.findAllPublished()).thenReturn(List.of(row, retired, gone));
        when(gateway.listPrices(5000))
            .thenReturn(List.of(stripe("price_a", 1999, true, PriceInterval.MONTH), stripe("price_old", 4999, true, PriceInterval.QUARTER), stripe("price_orphan", 100, true, PriceInterval.MONTH)));
        reconciler.run();
        assertThat(drifts.rows).extracting(BillingDrift::getCode, BillingDrift::getSubject)
            .containsExactlyInAnyOrder(
                org.assertj.core.groups.Tuple.tuple("ACTIVE_MISMATCH", "price_old"),
                org.assertj.core.groups.Tuple.tuple("UNKNOWN_PRICE", "price_orphan"),
                org.assertj.core.groups.Tuple.tuple("MISSING_IN_STRIPE", "price_gone")
            );
    }

    @Test
    void aDifferenceThatStopsBeingTrueResolvesItsOwnRow() {
        when(gateway.listPrices(5000)).thenReturn(List.of(stripe("price_a", 2499, true, PriceInterval.MONTH)));
        reconciler.run();
        assertThat(drifts.findOpen("CATALOG")).hasSize(1);
        when(gateway.listPrices(5000)).thenReturn(List.of(stripe("price_a", 1999, true, PriceInterval.MONTH)));
        CatalogReconciler.Result r = reconciler.run();
        assertThat(r.resolved()).isEqualTo(1);
        assertThat(drifts.findOpen("CATALOG")).isEmpty();
        assertThat(drifts.rows.get(0).getResolvedBy()).isEqualTo("system");
    }

    @Test
    void withBillingDisabledTheJobDoesNothing() {
        when(gateway.isEnabled()).thenReturn(false);
        CatalogReconciler.Result r = reconciler.run();
        assertThat(r.ran()).isFalse();
        verify(gateway, never()).listPrices(5000);
        assertThat(drifts.rows).isEmpty();
    }
}
