package com.dossier.api.service.billing.sim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGateway.CheckoutSpec;
import com.dossier.api.service.billing.StripeGateway.InvoiceSummary;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** K8.6: the simulated Stripe behaves like Stripe where the module depends on it (no Spring, no database). */
class StatefulFakeStripeGatewayTest {

    private static final String BASE = "price_base_m";
    private static final String BASE_Q = "price_base_q";
    private static final String AI = "price_ai_m";

    private StatefulFakeStripeGateway stripe;
    private String customer;

    @BeforeEach
    void world() {
        stripe = new StatefulFakeStripeGateway();
        stripe.definePrice(BASE, 1999, PriceInterval.MONTH);
        stripe.definePrice(BASE_Q, 4999, PriceInterval.QUARTER);
        stripe.definePrice(AI, 499, PriceInterval.MONTH);
        customer = stripe.createCustomer("a@b.test", "user", 7L);
    }

    private String subscribe(ItemQuantity... lines) {
        CheckoutSpec spec = new CheckoutSpec(customer, 7L, List.of(lines), Map.of("quote_id", "11", "plan_version_id", "3", "app", "kiwiply"), "https://ok", "https://no", false, "terms");
        stripe.createCheckoutSession(spec, IdempotencyKey.of("co-11"));
        return stripe.completeCheckout("co-11");
    }

    private static List<String> types(List<StripeWebhookEvent> events) {
        return events.stream().map(StripeWebhookEvent::type).toList();
    }

    @Test
    void aCheckoutCreatesTheSubscriptionPaysItsFirstInvoiceAndEmitsEventsInStripesOrder() {
        String sub = subscribe(new ItemQuantity(BASE, 1), new ItemQuantity(AI, 2));
        List<StripeWebhookEvent> events = stripe.drainEvents();
        assertThat(types(events)).containsExactly("checkout.session.completed", "customer.subscription.created", "invoice.created", "invoice.paid", "customer.subscription.updated");
        assertThat(events).extracting(StripeWebhookEvent::id).doesNotHaveDuplicates().allMatch(id -> id.startsWith("evt_sim_"));
        assertThat(events.get(0).clientReferenceId()).isEqualTo("7");
        assertThat(events.get(0).quoteId()).isEqualTo("11");
        assertThat(events.get(1).items()).extracting(StripeWebhookEvent.Item::priceId, StripeWebhookEvent.Item::quantity).containsExactly(org.assertj.core.groups.Tuple.tuple(BASE, 1L), org.assertj.core.groups.Tuple.tuple(AI, 2L));
        assertThat(events.get(3).invoice().amountPaid()).isEqualTo(1999 + 998);
        assertThat(events).allMatch(e -> e.created().equals(stripe.now()));
        assertThat(stripe.subscription(sub).status).isEqualTo("active");
        assertThat(stripe.hasLiveSubscription(customer)).isTrue();
        assertThat(stripe.drainEvents()).as("draining clears the outbox").isEmpty();
        assertThat(stripe.eventHistory()).hasSize(5);
        assertThat(stripe.retrieveEvent(events.get(2).id())).isSameAs(events.get(2));
        assertThatThrownBy(() -> stripe.retrieveEvent("evt_nope")).isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getStripeCode()).isEqualTo("resource_missing"));
    }

    @Test
    void settingItemsIsOneUpdateWithNoProrationAndAReplayedKeyHasNoSecondEffect() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        stripe.setSubscriptionItems(sub, List.of(new ItemQuantity(BASE, 1), new ItemQuantity(AI, 3)), IdempotencyKey.of("sc-1-items"));
        assertThat(stripe.subscription(sub).quantities()).containsEntry(BASE, 1L).containsEntry(AI, 3L);
        assertThat(types(stripe.drainEvents())).containsExactly("customer.subscription.updated");

        stripe.setSubscriptionItems(sub, List.of(new ItemQuantity(BASE, 1), new ItemQuantity(AI, 9)), IdempotencyKey.of("sc-1-items"));
        assertThat(stripe.subscription(sub).quantities()).as("the same key again changes nothing").containsEntry(AI, 3L);
        assertThat(stripe.drainEvents()).isEmpty();

        stripe.setSubscriptionItems(sub, List.of(new ItemQuantity(BASE, 1), new ItemQuantity(AI, 0)), IdempotencyKey.of("sc-2-items"));
        assertThat(stripe.subscription(sub).quantities()).as("quantity 0 removes the item").containsOnlyKeys(BASE);
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.allInvoices()).as("no proration invoice by Stripe itself").hasSize(1);
    }

    @Test
    void aRenewalStartsTheNextPeriodInvoicesItAndPutsPendingProrationLinesOnIt() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        Instant end = stripe.subscription(sub).periodEnd;
        stripe.createInvoiceItem(customer, 331, "usd", "Prorated: AI credits", null, Map.of(), IdempotencyKey.of("sc-9-proration"));
        stripe.createInvoiceItem(customer, 331, "usd", "Prorated: AI credits", null, Map.of(), IdempotencyKey.of("sc-9-proration"));

        stripe.advance(end.plus(Duration.ofHours(1)));

        assertThat(types(stripe.drainEvents())).containsExactly("invoice.created", "invoice.paid", "customer.subscription.updated");
        InvoiceSummary last = stripe.allInvoices().get(1);
        assertThat(last.status()).isEqualTo("paid");
        assertThat(last.amountPaidMinor()).as("the plan plus the pending item, once").isEqualTo(1999 + 331);
        assertThat(last.lines()).anyMatch(l -> l.proration() && l.amountMinor() == 331);
        assertThat(stripe.subscription(sub).periodStart).isEqualTo(end);
        assertThat(stripe.subscription(sub).periodEnd).isAfter(end);
    }

    @Test
    void aDeclinedRenewalGoesPastDueThenLapsesAfterTheRetryWindowAndFixingTheCardRecovers() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        Instant end = stripe.subscription(sub).periodEnd;
        stripe.setCard(StatefulFakeStripeGateway.Card.DECLINED);
        stripe.advance(end.plusSeconds(60));
        assertThat(types(stripe.drainEvents())).containsExactly("invoice.created", "invoice.payment_failed", "customer.subscription.updated");
        assertThat(stripe.subscription(sub).status).isEqualTo("past_due");
        assertThat(stripe.hasLiveSubscription(customer)).isTrue();

        stripe.payOpenInvoice(sub);
        assertThat(types(stripe.drainEvents())).containsExactly("invoice.paid", "customer.subscription.updated");
        assertThat(stripe.subscription(sub).status).isEqualTo("active");

        // Decline again and let the window pass.
        Instant end2 = stripe.subscription(sub).periodEnd;
        stripe.advance(end2.plusSeconds(60));
        stripe.drainEvents();
        assertThat(stripe.subscription(sub).status).isEqualTo("past_due");
        stripe.advance(stripe.now().plus(Duration.ofDays(StatefulFakeStripeGateway.DUNNING_DAYS + 1)));
        assertThat(types(stripe.drainEvents())).containsExactly("invoice.voided", "customer.subscription.deleted");
        assertThat(stripe.subscription(sub).status).isEqualTo("canceled");
        assertThat(stripe.hasLiveSubscription(customer)).isFalse();
    }

    @Test
    void cancelAtPeriodEndEndsTheSubscriptionAtTheBoundaryAndUndoingItKeepsBilling() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        stripe.portalCancel(sub);
        assertThat(stripe.subscription(sub).cancelAtPeriodEnd).isTrue();
        stripe.portalUndoCancel(sub);
        stripe.drainEvents();
        Instant end = stripe.subscription(sub).periodEnd;
        stripe.advance(end.plusSeconds(1));
        assertThat(stripe.subscription(sub).status).isEqualTo("active");

        stripe.portalCancel(sub);
        stripe.drainEvents();
        stripe.advance(stripe.subscription(sub).periodEnd.plusSeconds(1));
        assertThat(types(stripe.drainEvents())).containsExactly("customer.subscription.deleted");
        assertThat(stripe.subscription(sub).status).isEqualTo("canceled");
    }

    @Test
    void aScheduleAppliesItsPhaseAtTheBoundaryAndTheNewPeriodFollowsTheNewInterval() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        Instant end = stripe.subscription(sub).periodEnd;
        String schedule = stripe.createSchedule(sub, List.of(new ItemQuantity(BASE_Q, 1)), end, IdempotencyKey.of("sc-5"));
        assertThat(stripe.createSchedule(sub, List.of(new ItemQuantity(BASE_Q, 1)), end, IdempotencyKey.of("sc-5"))).as("same key, same schedule").isEqualTo(schedule);
        assertThat(types(stripe.drainEvents())).containsExactly("subscription_schedule.created", "customer.subscription.updated");
        assertThat(stripe.retrieveSubscription(sub).scheduleId()).isEqualTo(schedule);

        stripe.advance(end.plusSeconds(1));

        assertThat(types(stripe.drainEvents())).containsExactly("subscription_schedule.completed", "invoice.created", "invoice.paid", "customer.subscription.updated");
        assertThat(stripe.subscription(sub).quantities()).containsOnlyKeys(BASE_Q);
        assertThat(stripe.subscription(sub).scheduleId).isNull();
        assertThat(Duration.between(stripe.subscription(sub).periodStart, stripe.subscription(sub).periodEnd).toDays()).isBetween(89L, 92L);
        assertThat(stripe.allInvoices().get(1).amountPaidMinor()).isEqualTo(4999);

        String released = stripe.createSchedule(sub, List.of(new ItemQuantity(BASE, 1)), stripe.subscription(sub).periodEnd, IdempotencyKey.of("sc-6"));
        stripe.releaseSchedule(released, IdempotencyKey.of("rel-6"));
        assertThat(stripe.subscription(sub).scheduleId).isNull();
        stripe.advance(stripe.subscription(sub).periodEnd.plusSeconds(1));
        assertThat(stripe.subscription(sub).quantities()).as("a released schedule never applies").containsOnlyKeys(BASE_Q);
    }

    @Test
    void aSecondSubscriptionStartsBillingAtTheGivenInstantAndIsNotAFreeTrial() {
        String old = subscribe(new ItemQuantity(BASE, 1));
        stripe.drainEvents();
        Instant end = stripe.subscription(old).periodEnd;
        stripe.setCancelAtPeriodEnd(old, true, IdempotencyKey.of("cx"));
        String next = stripe.createSubscription(customer, List.of(new ItemQuantity(BASE_Q, 1)), end, Map.of("app", "kiwiply"), IdempotencyKey.of("sw"));
        assertThat(stripe.createSubscription(customer, List.of(new ItemQuantity(BASE_Q, 1)), end, Map.of(), IdempotencyKey.of("sw"))).isEqualTo(next);
        assertThat(stripe.subscription(next).status).isEqualTo("trialing");
        assertThat(stripe.allInvoices()).as("nothing is charged before the instant").hasSize(1);
        stripe.drainEvents();

        stripe.advance(end.plusSeconds(1));

        assertThat(stripe.subscription(old).status).isEqualTo("canceled");
        assertThat(stripe.subscription(next).status).isEqualTo("active");
        assertThat(stripe.allInvoices()).hasSize(2);
        assertThat(stripe.allInvoices().get(1).amountPaidMinor()).isEqualTo(4999);
    }

    @Test
    void theTestClockOnlyMovesForwardAndAPriceTheAccountDoesNotKnowCannotBeBilled() {
        String id = stripe.createTestClock(stripe.now().plus(Duration.ofDays(2)), IdempotencyKey.of("clk"));
        Instant frozen = stripe.now();
        stripe.advanceTestClock(id, frozen.plus(Duration.ofDays(1)), IdempotencyKey.of("clk-1"));
        assertThat(stripe.now()).isEqualTo(frozen.plus(Duration.ofDays(1)));
        assertThatThrownBy(() -> stripe.advanceTestClock(id, frozen, IdempotencyKey.of("clk-2"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> subscribe(new ItemQuantity("price_unknown", 1))).isInstanceOf(IllegalStateException.class).hasMessageContaining("definePrice");
    }

    @Test
    void invoicesListNewestFirstAndPageAndThePreviewMatchesTheNextInvoice() {
        String sub = subscribe(new ItemQuantity(BASE, 1), new ItemQuantity(AI, 1));
        stripe.drainEvents();
        stripe.createInvoiceItem(customer, 100, "usd", "Prorated", null, Map.of(), IdempotencyKey.of("p-1"));
        var preview = stripe.previewUpcomingInvoice(customer, sub, null, null);
        assertThat(preview.totalMinor()).isEqualTo(1999 + 499 + 100);

        stripe.advance(stripe.subscription(sub).periodEnd.plusSeconds(1));
        stripe.advance(stripe.subscription(sub).periodEnd.plusSeconds(1));
        List<InvoiceSummary> all = stripe.listInvoices(customer, 10, null);
        assertThat(all).hasSize(3);
        assertThat(all.get(0).periodStart()).isAfter(all.get(2).periodStart());
        assertThat(all.get(1).amountPaidMinor()).isEqualTo(preview.totalMinor());
        assertThat(stripe.listInvoices(customer, 1, all.get(0).id())).extracting(InvoiceSummary::id).containsExactly(all.get(1).id());
        assertThat(stripe.retrieveInvoice(all.get(2).id()).id()).isEqualTo(all.get(2).id());
    }

    @Test
    void theReconcilersReadsAnswerFromTheSameWorldAndABilledOffGatewayRefuses() {
        String sub = subscribe(new ItemQuantity(BASE, 1));
        var snap = stripe.retrieveSubscription(sub);
        assertThat(snap.status()).isEqualTo("active");
        assertThat(snap.items()).extracting(StripeWebhookEvent.Item::priceId).containsExactly(BASE);
        assertThat(stripe.retrieveSubscription("sub_unknown")).isNull();
        stripe.enabled = false;
        assertThatThrownBy(() -> stripe.retrieveSubscription(sub)).isInstanceOfSatisfying(StripeGatewayException.class, e -> assertThat(e.getKind()).isEqualTo(StripeGatewayException.Kind.NOT_ENABLED));
    }
}
