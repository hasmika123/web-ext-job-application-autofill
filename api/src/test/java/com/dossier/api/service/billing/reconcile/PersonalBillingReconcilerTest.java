package com.dossier.api.service.billing.reconcile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.catalog.ProductPrice;
import com.dossier.api.domain.ent.billing.Product;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.catalog.ProductRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import com.dossier.api.repository.sub.PersonalSubscriptionChangeRepository;
import com.dossier.api.repository.sub.PriceLookupRepository;
import com.dossier.api.repository.sub.ReconcileSubscriptionRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.InvoiceSummary;
import com.dossier.api.service.billing.StripeGateway.SubscriptionSnapshot;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

/**
 * K8.5: the personal reconciler. A fixture with Stripe quantity 2 against a mirror of 1 gives exactly one QUANTITY drift row; the job calls only the
 * gateway's read methods (the mock is checked with {@code verifyNoMoreInteractions}) and writes only drift rows (no repository other than the drift one is
 * ever saved to); a difference that stops being true resolves its own row.
 */
class PersonalBillingReconcilerTest {

    static class Drifts implements BillingDriftRepository {
        final List<BillingDrift> rows = new ArrayList<>();
        long ids = 0;

        @Override
        public <S extends BillingDrift> S save(S d) {
            if (d.getId() == null) d.setId(++ids);
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
    private ReconcileSubscriptionRepository due;
    private PriceLookupRepository prices;
    private ProductRepository products;
    private SubscriptionAddonRepository addons;
    private PersonalSubscriptionChangeRepository changes;
    private InvoiceRepository invoices;
    private Drifts drifts;
    private PersonalBillingReconciler reconciler;
    private Subscription sub;
    private final Instant end = Instant.parse("2026-11-20T10:00:00Z");

    @BeforeEach
    void setUp() {
        gateway = mock(StripeGateway.class);
        due = mock(ReconcileSubscriptionRepository.class);
        prices = mock(PriceLookupRepository.class);
        products = mock(ProductRepository.class);
        addons = mock(SubscriptionAddonRepository.class);
        changes = mock(PersonalSubscriptionChangeRepository.class);
        invoices = mock(InvoiceRepository.class);
        drifts = new Drifts();
        reconciler = new PersonalBillingReconciler(gateway, due, prices, products, addons, changes, invoices, drifts, new ObjectMapper(), 0, 1000);
        when(gateway.isEnabled()).thenReturn(true);

        sub = new Subscription();
        sub.setId(7L);
        sub.setStripeCustomerId("cus_x");
        sub.setStripeSubscriptionId("sub_1");
        sub.setStatus("active");
        sub.setPriceId("price_base");
        sub.setCurrentPeriodEnd(end);
        sub.setCurrentPeriodStart(end.minus(30, ChronoUnit.DAYS));
        when(due.findDue(any(), anyInt(), any())).thenReturn(List.of(sub)).thenReturn(List.of());

        ProductPrice base = price(1L, 10L, "price_base");
        ProductPrice ai = price(2L, 20L, "price_ai");
        when(prices.findByStripePriceIdIn(anyCollection())).thenAnswer(i -> {
            java.util.Collection<String> ids = i.getArgument(0);
            return List.of(base, ai).stream().filter(p -> ids.contains(p.getStripePriceId())).toList();
        });
        when(products.findById(10L)).thenReturn(Optional.of(product(10L, "SUBSCRIPTION", null)));
        when(products.findById(20L)).thenReturn(Optional.of(product(20L, "FEATURE", "ai.credits_extra")));
        when(addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(7L)).thenReturn(List.of(addon("ai.credits_extra", 1)));
        when(changes.findBySubscriptionIdAndStatusInOrderByIdAsc(anyLong(), any())).thenReturn(List.of());
        when(gateway.listInvoices(anyString(), anyInt(), any())).thenReturn(List.of());
    }

    private static ProductPrice price(long id, long productId, String stripeId) {
        ProductPrice p = new ProductPrice();
        p.setId(id);
        p.setProductId(productId);
        p.setStripePriceId(stripeId);
        return p;
    }

    private static Product product(long id, String kind, String feature) {
        Product p = new Product();
        p.setId(id);
        p.setKind(kind);
        p.setFeatureKey(feature);
        return p;
    }

    private static SubscriptionAddon addon(String feature, int qty) {
        SubscriptionAddon a = new SubscriptionAddon();
        a.setFeatureKey(feature);
        a.setQuantity(qty);
        a.setLive(true);
        return a;
    }

    private SubscriptionSnapshot stripe(String status, boolean cancel, Instant periodEnd, String schedule, long aiQty) {
        List<StripeWebhookEvent.Item> items = new ArrayList<>();
        items.add(new StripeWebhookEvent.Item("si_base", "price_base", 1));
        if (aiQty > 0) items.add(new StripeWebhookEvent.Item("si_ai", "price_ai", aiQty));
        return new SubscriptionSnapshot("sub_1", "cus_x", status, cancel, periodEnd.minus(30, ChronoUnit.DAYS), periodEnd, schedule, items);
    }

    private void stripeIs(SubscriptionSnapshot s) {
        when(gateway.retrieveSubscription("sub_1")).thenReturn(s);
    }

    @Test
    void stripeHasTwoCreditsAndWeHaveOneGivesExactlyOneQuantityDriftRowAndNoWrite() {
        stripeIs(stripe("active", false, end, null, 2));

        PersonalBillingReconciler.Result r = reconciler.run();

        assertThat(r.ran()).isTrue();
        assertThat(r.checked()).isEqualTo(1);
        assertThat(r.opened()).isEqualTo(1);
        assertThat(drifts.rows).hasSize(1);
        BillingDrift d = drifts.rows.get(0);
        assertThat(d.getKind()).isEqualTo("PERSONAL");
        assertThat(d.getCode()).isEqualTo("QUANTITY");
        assertThat(d.getSubject()).isEqualTo("sub_1/ai.credits_extra");
        assertThat(d.getExpectedJson()).contains("\"quantity\":1");
        assertThat(d.getActualJson()).contains("\"quantity\":2");
        assertThat(d.getResolvedAt()).isNull();

        // Read-only: only these gateway calls, nothing else on the gateway, and no repository but the drift one was written to.
        verify(gateway).isEnabled();
        verify(gateway).retrieveSubscription("sub_1");
        verify(gateway).listInvoices(eq("cus_x"), anyInt(), any());
        verifyNoMoreInteractions(gateway);
        Mockito.verify(addons, Mockito.never()).save(any());
        Mockito.verify(addons, Mockito.never()).saveAndFlush(any());
        Mockito.verify(invoices, Mockito.never()).save(any());
    }

    @Test
    void aSecondRunDoesNotDuplicateAndOnceTheMirrorCatchesUpTheRowResolvesItself() {
        stripeIs(stripe("active", false, end, null, 2));
        when(due.findDue(any(), anyInt(), any())).thenReturn(List.of(sub));
        reconciler.run();
        PersonalBillingReconciler.Result again = reconciler.run();
        assertThat(again.opened()).isZero();
        assertThat(drifts.rows).hasSize(1);
        assertThat(again.open()).isEqualTo(1);

        when(addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(7L)).thenReturn(List.of(addon("ai.credits_extra", 2)));
        PersonalBillingReconciler.Result fixed = reconciler.run();
        assertThat(fixed.resolved()).isEqualTo(1);
        assertThat(fixed.open()).isZero();
        assertThat(drifts.rows.get(0).getResolvedAt()).isNotNull();
        assertThat(drifts.rows.get(0).getResolvedBy()).isEqualTo("system");
    }

    @Test
    void aSubscriptionThatMatchesLeavesNoDriftAndAFeatureWithAChangeInFlightIsLeftAlone() {
        stripeIs(stripe("active", false, end, null, 1));
        assertThat(reconciler.run().opened()).isZero();

        stripeIs(stripe("active", false, end, null, 5));
        var change = new com.dossier.api.domain.sub.PersonalSubscriptionChange();
        change.setFeatureKey("ai.credits_extra");
        when(changes.findBySubscriptionIdAndStatusInOrderByIdAsc(anyLong(), any())).thenReturn(List.of(change));
        when(due.findDue(any(), anyInt(), any())).thenReturn(List.of(sub));
        assertThat(reconciler.run().opened()).as("Kiwiply owns the quantity until the change settles").isZero();
        assertThat(drifts.rows).isEmpty();
    }

    @Test
    void anAddonScheduledForRemovalIsNotCountedAgainstAStripeThatNoLongerHasIt() {
        SubscriptionAddon leaving = addon("ai.credits_extra", 1);
        leaving.setEndsAt(end);
        when(addons.findBySubscriptionIdAndLiveTrueOrderByIdAsc(7L)).thenReturn(List.of(leaving));
        stripeIs(stripe("active", false, end, null, 0));
        assertThat(reconciler.run().opened()).isZero();
    }

    @Test
    void statusCancelFlagPeriodPriceAndScheduleEachGetTheirOwnRow() {
        SubscriptionSnapshot s = new SubscriptionSnapshot(
            "sub_1",
            "cus_x",
            "past_due",
            true,
            end.plus(1, ChronoUnit.DAYS),
            end.plus(31, ChronoUnit.DAYS),
            "sub_sched_9",
            List.of(new StripeWebhookEvent.Item("si_base", "price_other", 1), new StripeWebhookEvent.Item("si_ai", "price_ai", 1))
        );
        stripeIs(s);
        reconciler.run();
        assertThat(drifts.rows).extracting(BillingDrift::getCode).containsExactlyInAnyOrder("STATUS", "STATUS", "PERIOD", "PRICE", "SCHEDULE");
        assertThat(drifts.rows).extracting(BillingDrift::getSubject).contains("sub_1", "sub_1/cancel");
    }

    @Test
    void aTwoMinuteClockSkewOnThePeriodIsNotDrift() {
        stripeIs(stripe("active", false, end.plus(90, ChronoUnit.SECONDS), null, 1));
        assertThat(reconciler.run().opened()).isZero();
    }

    @Test
    void aSubscriptionStripeDoesNotKnowIsFlaggedMissing() {
        stripeIs(null);
        reconciler.run();
        assertThat(drifts.rows).singleElement().satisfies(d -> {
            assertThat(d.getCode()).isEqualTo("STATUS");
            assertThat(d.getSubject()).isEqualTo("sub_1/missing");
        });
    }

    @Test
    void invoicesStripeListsThatTheMirrorLacksOrHasWrongAreFlagged() {
        stripeIs(stripe("active", false, end, null, 1));
        InvoiceSummary missing = invoice("in_1", "paid", 1999);
        InvoiceSummary wrong = invoice("in_2", "paid", 2499);
        InvoiceSummary draft = invoice("in_3", "draft", 0);
        InvoiceSummary fine = invoice("in_4", "paid", 1999);
        when(gateway.listInvoices(anyString(), anyInt(), any())).thenReturn(List.of(missing, wrong, draft, fine));
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.empty());
        when(invoices.findByStripeInvoiceId("in_2")).thenReturn(Optional.of(mirrored("paid", 1999)));
        when(invoices.findByStripeInvoiceId("in_4")).thenReturn(Optional.of(mirrored("paid", 1999)));

        reconciler.run();

        assertThat(drifts.rows).extracting(BillingDrift::getCode, BillingDrift::getSubject).containsExactlyInAnyOrder(
            org.assertj.core.groups.Tuple.tuple("INVOICE_MISSING", "sub_1/in_1"),
            org.assertj.core.groups.Tuple.tuple("INVOICE_STATUS", "sub_1/in_2")
        );
    }

    @Test
    void oneUnreadableSubscriptionDoesNotStopTheNightAndBillingOffDoesNothing() {
        Subscription other = new Subscription();
        other.setId(8L);
        other.setStripeSubscriptionId("sub_2");
        other.setStripeCustomerId("cus_y");
        other.setStatus("active");
        when(due.findDue(any(), anyInt(), any())).thenReturn(List.of(other, sub)).thenReturn(List.of());
        when(gateway.retrieveSubscription("sub_2")).thenThrow(new StripeGatewayException("down", StripeGatewayException.Kind.CONNECTION, null, null));
        stripeIs(stripe("active", false, end, null, 1));
        PersonalBillingReconciler.Result r = reconciler.run();
        assertThat(r.failed()).isEqualTo(1);
        assertThat(r.checked()).isEqualTo(1);

        when(gateway.isEnabled()).thenReturn(false);
        PersonalBillingReconciler.Result off = reconciler.run();
        assertThat(off.ran()).isFalse();
    }

    private static InvoiceSummary invoice(String id, String status, long paid) {
        return new InvoiceSummary(id, "N-" + id, status, "usd", paid, paid, null, null, null, null, null, null, "sub_1", List.of());
    }

    private static Invoice mirrored(String status, long paid) {
        Invoice i = new Invoice();
        i.setStatus(status);
        i.setAmountPaidMinor(paid);
        return i;
    }
}
