package com.dossier.api.service.billing.sim;

import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.StripeGatewayException;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.personal.FakeStripeGateway;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Stripe in a box (story K8.6, docs/subscriptions/07 section 7): a deterministic, in-memory model of the parts of Stripe the subscription module touches, that
 * <b>behaves</b> instead of merely recording. It is a {@link FakeStripeGateway}, so every existing test that autowires that type, and every recording field it
 * has ({@code itemCalls}, {@code invoiceItemCalls}, {@code checkoutSpecs}, {@code failNextWrites}, {@code enabled}, ...), keeps working.
 *
 * <p>What it models, and where it follows Stripe on purpose:
 * <ul>
 *   <li><b>Customers, prices, products.</b> {@link #definePrice} registers a price id with its amount and interval (fixtures call it for the ids they already
 *       store); {@code createPrice} registers the ones a publish creates. A price the simulator does not know cannot be billed: that is a test-setup mistake
 *       and throws.</li>
 *   <li><b>Checkout.</b> {@code createCheckoutSession(spec, key)} stores the session under its idempotency key; {@link #completeCheckout} is the customer paying on
 *       the hosted page: it creates the subscription, pays its first invoice and emits {@code checkout.session.completed}, {@code customer.subscription.created},
 *       {@code invoice.created}, {@code invoice.paid}.</li>
 *   <li><b>Subscriptions and items.</b> {@code setSubscriptionItems} makes the items equal the list in one update, with no proration (Kiwiply prorates). A
 *       repeated idempotency key has no second effect. Every change emits {@code customer.subscription.updated}.</li>
 *   <li><b>Pending invoice items</b> (Kiwiply's prorations) wait on the customer and land on the next invoice as {@code proration} lines.</li>
 *   <li><b>Schedules.</b> {@code createSchedule} applies its phase items at the given instant (the interval switch), {@code releaseSchedule} cancels it.</li>
 *   <li><b>Time.</b> The test clock ({@code createTestClock}, {@code advanceTestClock}, or {@link #advance} directly) moves {@link #now()}; crossing a period end
 *       renews the subscription (a new period, an invoice, a charge), applies a due schedule, or ends a subscription set to cancel at period end. As in Stripe the
 *       period advances when the renewal invoice is created, whether or not the card then pays.</li>
 *   <li><b>Cards.</b> {@link #setCard} makes renewals decline. A declined renewal leaves the invoice open, the subscription {@code past_due}
 *       ({@code invoice.payment_failed}) and starts a retry window of {@value #DUNNING_DAYS} days; when it passes unpaid the subscription is cancelled
 *       ({@code customer.subscription.deleted}). {@link #payOpenInvoice} is the customer fixing the card.</li>
 *   <li><b>Events.</b> Everything above appends to an outbox in the order Stripe would deliver it, with ids {@code evt_sim_{run}_{n}} and Stripe's own timestamp
 *       (the simulated clock). {@link #drainEvents} hands them to the test, which feeds them to the webhook service; {@code retrieveEvent} and
 *       {@code retrieveSubscription} read the same world, so the replay and the reconciler can be tested against it.</li>
 * </ul>
 * Not modelled: tax, coupons, payment-method details, 3-D Secure, retries inside the window (one failure, then lapse), proration by Stripe (the module sends
 * {@code proration_behavior=none}), multi-currency (USD).
 */
public class StatefulFakeStripeGateway extends FakeStripeGateway {

    /**
     * Replaces the Stripe gateway bean with the simulator in a Spring test: {@code @Import(StatefulFakeStripeGateway.Config.class)} and autowire
     * {@code StatefulFakeStripeGateway} (or {@code FakeStripeGateway}, which it extends). Do not import {@code SubFixtures.FakeGatewayConfig} as well.
     */
    @org.springframework.boot.test.context.TestConfiguration
    public static class Config {

        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        StatefulFakeStripeGateway statefulFakeStripeGateway() {
            return new StatefulFakeStripeGateway();
        }

        /** The gates that decide "is this person still on a paid plan" read the simulated time, not the wall clock, so a lapse replayed in milliseconds is a lapse to them too. */
        @org.springframework.context.annotation.Bean
        @org.springframework.context.annotation.Primary
        com.dossier.api.service.billing.BillingClock simulatedBillingClock(StatefulFakeStripeGateway stripe) {
            return new com.dossier.api.service.billing.BillingClock() {
                @Override
                public java.time.Instant now() {
                    return stripe.now();
                }
            };
        }
    }

    /** Days a declined renewal stays {@code past_due} before Stripe gives up and cancels (Stripe's default dunning is longer; the number is only a fixture). */
    public static final int DUNNING_DAYS = 14;

    public enum Card {
        OK,
        DECLINED,
    }

    /** A price in the simulated account. */
    public record SimPrice(String id, String productId, long amountMinor, String currency, PriceInterval interval, boolean active, Map<String, String> metadata) {}

    /** One subscription item. */
    public static final class SimItem {

        public final String id;
        public long quantity;

        SimItem(String id, long quantity) {
            this.id = id;
            this.quantity = quantity;
        }
    }

    /** A subscription as the simulated Stripe holds it. */
    public static final class SimSub {

        public String id;
        public String customerId;
        public String status;
        public boolean cancelAtPeriodEnd;
        public Instant periodStart;
        public Instant periodEnd;
        public String scheduleId;
        public Instant dunningDeadline;
        public String openInvoiceId;
        public final Map<String, SimItem> items = new LinkedHashMap<>();
        public Map<String, String> metadata = new HashMap<>();

        /** price id to quantity, in item order. */
        public Map<String, Long> quantities() {
            Map<String, Long> m = new LinkedHashMap<>();
            items.forEach((p, i) -> m.put(p, i.quantity));
            return m;
        }
    }

    /** A subscription schedule: at {@code at} the items become {@code phaseItems}. */
    public static final class SimSchedule {

        public String id;
        public String subscriptionId;
        public Instant at;
        public List<ItemQuantity> phaseItems;
        public String status = "active";
    }

    /** A Checkout Session waiting for the customer. */
    public record SimSession(String id, CheckoutSpec spec, String key) {}

    private record Pending(String id, String customerId, long amountMinor, String description, Period period) {}

    private final String run = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    private int seq = 0;
    private Instant clock = Instant.now().truncatedTo(ChronoUnit.SECONDS);
    private Card card = Card.OK;

    private final Map<String, SimPrice> prices = new LinkedHashMap<>();
    private final Map<String, SimSub> subs = new LinkedHashMap<>();
    private final Map<String, SimSchedule> schedules = new LinkedHashMap<>();
    private final Map<String, SimSession> sessions = new LinkedHashMap<>();
    private final Map<String, String> sessionByKey = new HashMap<>();
    private final Map<String, InvoiceSummary> invoiceStore = new LinkedHashMap<>();
    private final List<Pending> pending = new ArrayList<>();
    private final Set<String> appliedKeys = new HashSet<>();
    private final Map<String, String> keyResults = new HashMap<>();
    private final List<StripeWebhookEvent> outbox = new ArrayList<>();
    private final List<StripeWebhookEvent> history = new ArrayList<>();

    // ------------------------------------------------------------------------------------------------------------------ setup and inspection

    @Override
    public void reset() {
        super.reset();
        clock = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        card = Card.OK;
        prices.clear();
        subs.clear();
        schedules.clear();
        sessions.clear();
        sessionByKey.clear();
        invoiceStore.clear();
        pending.clear();
        appliedKeys.clear();
        keyResults.clear();
        outbox.clear();
        history.clear();
        seq = 0;
    }

    /** The simulated time. */
    public Instant now() {
        return clock;
    }

    public void setCard(Card card) {
        this.card = card;
    }

    /** Register a price the fixtures already store (USD). */
    public SimPrice definePrice(String id, long amountMinor, PriceInterval interval) {
        SimPrice p = new SimPrice(id, "prod_sim_" + id, amountMinor, "usd", interval, true, Map.of("app", "kiwiply"));
        prices.put(id, p);
        return p;
    }

    public SimSub subscription(String id) {
        SimSub s = subs.get(id);
        if (s == null) throw missing("subscription");
        return s;
    }

    /** The newest subscription of a customer, or null. */
    public SimSub latestSubscription(String customerId) {
        SimSub out = null;
        for (SimSub s : subs.values()) if (s.customerId.equals(customerId)) out = s;
        return out;
    }

    public List<SimSub> subscriptions() {
        return List.copyOf(subs.values());
    }

    public SimSession session(String key) {
        String id = sessionByKey.get(key);
        return id == null ? null : sessions.get(id);
    }

    public SimSchedule schedule(String id) {
        return schedules.get(id);
    }

    public List<InvoiceSummary> allInvoices() {
        return List.copyOf(invoiceStore.values());
    }

    /** Every event emitted so far, delivered or not. */
    public List<StripeWebhookEvent> eventHistory() {
        return List.copyOf(history);
    }

    /** The events not yet handed to the test, in delivery order; clears the outbox. */
    public List<StripeWebhookEvent> drainEvents() {
        List<StripeWebhookEvent> out = List.copyOf(outbox);
        outbox.clear();
        return out;
    }

    // ------------------------------------------------------------------------------------------------------------------ what the customer and the clock do

    /** The customer pays on the hosted page: the subscription exists, its first invoice is paid, the events are queued. Returns the subscription id. */
    public String completeCheckout(String sessionKey) {
        SimSession session = session(sessionKey);
        if (session == null) throw missing("checkout session");
        CheckoutSpec spec = session.spec();
        SimSub s = new SimSub();
        s.id = "sub_sim_" + run + "_" + (++seq);
        s.customerId = spec.customerId();
        s.status = "active";
        s.metadata = new HashMap<>(spec.metadata());
        s.metadata.putIfAbsent("app", "kiwiply");
        for (ItemQuantity l : spec.lines()) s.items.put(l.priceId(), new SimItem("si_sim_" + run + "_" + (++seq), l.quantity()));
        s.periodStart = clock;
        s.periodEnd = plusMonths(clock, baseMonths(s));
        subs.put(s.id, s);

        emit(sessionEvent(s, spec));
        emit(subscriptionEvent("customer.subscription.created", s));
        InvoiceSummary inv = invoiceFor(s, "subscription_create");
        emit(invoiceEvent("invoice.created", s, inv));
        InvoiceSummary paid = payInvoice(s, inv);
        emit(invoiceEvent("invoice.paid", s, paid));
        emit(subscriptionEvent("customer.subscription.updated", s));
        return s.id;
    }

    /** The customer cancels in the billing portal: cancel at period end. */
    public void portalCancel(String subscriptionId) {
        SimSub s = subscription(subscriptionId);
        s.cancelAtPeriodEnd = true;
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    /** The customer undoes it in the portal. */
    public void portalUndoCancel(String subscriptionId) {
        SimSub s = subscription(subscriptionId);
        s.cancelAtPeriodEnd = false;
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    /** The customer fixes the card: the open invoice of a {@code past_due} subscription is paid. */
    public void payOpenInvoice(String subscriptionId) {
        SimSub s = subscription(subscriptionId);
        if (s.openInvoiceId == null) return;
        InvoiceSummary open = invoiceStore.get(s.openInvoiceId);
        InvoiceSummary paid = payInvoice(s, open);
        s.openInvoiceId = null;
        s.dunningDeadline = null;
        s.status = "active";
        emit(invoiceEvent("invoice.paid", s, paid));
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    /** Move the simulated clock to {@code to}, processing every renewal, schedule, cancellation and retry window on the way, in time order. */
    public void advance(Instant to) {
        if (to.isBefore(clock)) throw new IllegalArgumentException("the test clock only moves forward");
        while (true) {
            SimSub next = null;
            Instant at = null;
            boolean dunning = false;
            for (SimSub s : subs.values()) {
                Instant due = null;
                boolean isDunning = false;
                if ("past_due".equals(s.status) && s.dunningDeadline != null) {
                    due = s.dunningDeadline;
                    isDunning = true;
                } else if ("active".equals(s.status) || "trialing".equals(s.status)) {
                    due = s.periodEnd;
                }
                if (due != null && !due.isAfter(to) && (at == null || due.isBefore(at))) {
                    next = s;
                    at = due;
                    dunning = isDunning;
                }
            }
            if (next == null) break;
            clock = at;
            if (dunning) lapse(next);
            else renew(next);
        }
        clock = to;
    }

    // ------------------------------------------------------------------------------------------------------------------ the gateway

    @Override
    public boolean hasLiveSubscription(String customerId) {
        if (liveSubscription) return true;
        return subs.values().stream().anyMatch(s -> s.customerId.equals(customerId) && Set.of("active", "trialing", "past_due", "unpaid").contains(s.status));
    }

    @Override
    public String createCustomer(String email, String login, Long userId) {
        return "cus_sim_" + run + "_" + (++seq);
    }

    @Override
    public String createCheckoutSession(CheckoutSpec spec, IdempotencyKey key) {
        String url = super.createCheckoutSession(spec, key);
        if (!sessionByKey.containsKey(key.value())) {
            String id = "cs_sim_" + run + "_" + (++seq);
            sessions.put(id, new SimSession(id, spec, key.value()));
            sessionByKey.put(key.value(), id);
        }
        return url;
    }

    @Override
    public void cancelSubscription(String subscriptionId) {
        SimSub s = subs.get(subscriptionId);
        if (s == null || "canceled".equals(s.status)) return; // tolerant: gone already is as good as cancelled
        end(s);
    }

    @Override
    public void setSubscriptionItems(String subscriptionId, List<ItemQuantity> items, IdempotencyKey key) {
        super.setSubscriptionItems(subscriptionId, items, key);
        if (!appliedKeys.add("items:" + key.value())) return; // an idempotent replay: no new effect
        SimSub s = subscription(subscriptionId);
        Map<String, Long> target = new LinkedHashMap<>();
        for (ItemQuantity i : items) if (i.quantity() > 0) target.merge(i.priceId(), i.quantity(), Long::sum);
        s.items.keySet().removeIf(p -> !target.containsKey(p));
        target.forEach((p, q) -> {
            requirePrice(p);
            SimItem existing = s.items.get(p);
            if (existing == null) s.items.put(p, new SimItem("si_sim_" + run + "_" + (++seq), q));
            else existing.quantity = q;
        });
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    @Override
    public void setCancelAtPeriodEnd(String subscriptionId, boolean cancel, IdempotencyKey key) {
        if (!appliedKeys.add("cancel:" + key.value())) return;
        SimSub s = subscription(subscriptionId);
        s.cancelAtPeriodEnd = cancel;
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    @Override
    public String createInvoiceItem(String customerId, long amountMinor, String currency, String description, Period period, Map<String, String> metadata, IdempotencyKey key) {
        String id = super.createInvoiceItem(customerId, amountMinor, currency, description, period, metadata, key);
        if (appliedKeys.add("ii:" + key.value())) pending.add(new Pending(id, customerId, amountMinor, description, period));
        return id;
    }

    @Override
    public String createSchedule(String subscriptionId, List<ItemQuantity> phaseItems, Instant at, IdempotencyKey key) {
        String known = keyResults.get("sched:" + key.value());
        if (known != null) return known;
        SimSub s = subscription(subscriptionId);
        for (ItemQuantity i : phaseItems) requirePrice(i.priceId());
        SimSchedule sc = new SimSchedule();
        sc.id = "sub_sched_sim_" + run + "_" + (++seq);
        sc.subscriptionId = subscriptionId;
        sc.at = at;
        sc.phaseItems = List.copyOf(phaseItems);
        schedules.put(sc.id, sc);
        s.scheduleId = sc.id;
        keyResults.put("sched:" + key.value(), sc.id);
        emit(scheduleEvent("subscription_schedule.created", s, sc));
        emit(subscriptionEvent("customer.subscription.updated", s));
        return sc.id;
    }

    @Override
    public void releaseSchedule(String scheduleId, IdempotencyKey key) {
        if (!appliedKeys.add("release:" + key.value())) return;
        SimSchedule sc = schedules.get(scheduleId);
        if (sc == null || !"active".equals(sc.status)) return;
        sc.status = "released";
        SimSub s = subscription(sc.subscriptionId);
        s.scheduleId = null;
        emit(scheduleEvent("subscription_schedule.released", s, sc));
        emit(subscriptionEvent("customer.subscription.updated", s));
    }

    @Override
    public String createSubscription(String customerId, List<ItemQuantity> items, Instant startBillingAt, Map<String, String> metadata, IdempotencyKey key) {
        String known = keyResults.get("sub:" + key.value());
        if (known != null) return known;
        SimSub s = new SimSub();
        s.id = "sub_sim_" + run + "_" + (++seq);
        s.customerId = customerId;
        s.status = startBillingAt.isAfter(clock) ? "trialing" : "active";
        s.metadata = new HashMap<>(metadata == null ? Map.of() : metadata);
        s.metadata.putIfAbsent("app", "kiwiply");
        for (ItemQuantity i : items) {
            requirePrice(i.priceId());
            s.items.put(i.priceId(), new SimItem("si_sim_" + run + "_" + (++seq), i.quantity()));
        }
        s.periodStart = clock;
        s.periodEnd = startBillingAt.isAfter(clock) ? startBillingAt : plusMonths(clock, baseMonths(s));
        subs.put(s.id, s);
        keyResults.put("sub:" + key.value(), s.id);
        emit(subscriptionEvent("customer.subscription.created", s));
        return s.id;
    }

    @Override
    public UpcomingInvoicePreview previewUpcomingInvoice(String customerId, String subscriptionId, List<ItemQuantity> proposed, String couponId) {
        SimSub s = subscription(subscriptionId);
        List<InvoiceLine> lines = new ArrayList<>();
        Instant end = plusMonths(s.periodEnd, baseMonths(s));
        List<ItemQuantity> basis = proposed != null ? proposed : s.items.entrySet().stream().map(e -> new ItemQuantity(e.getKey(), e.getValue().quantity)).toList();
        for (ItemQuantity i : basis) {
            SimPrice p = requirePrice(i.priceId());
            lines.add(new InvoiceLine(p.id(), i.quantity(), p.amountMinor() * i.quantity(), i.quantity() + " x " + p.id(), s.periodEnd, end, false));
        }
        for (Pending p : pending) {
            if (p.customerId().equals(customerId)) lines.add(new InvoiceLine(null, 1, p.amountMinor(), p.description(), s.periodEnd, end, true));
        }
        long total = lines.stream().mapToLong(InvoiceLine::amountMinor).sum();
        return new UpcomingInvoicePreview(total, 0, total, "usd", lines);
    }

    @Override
    public List<InvoiceSummary> listInvoices(String customerId, int limit, String startingAfter) {
        List<InvoiceSummary> mine = new ArrayList<>();
        for (InvoiceSummary i : invoiceStore.values()) {
            SimSub s = subs.get(i.subscriptionId());
            if (s != null && s.customerId.equals(customerId)) mine.add(0, i);
        }
        int from = 0;
        if (startingAfter != null) {
            for (int k = 0; k < mine.size(); k++) if (mine.get(k).id().equals(startingAfter)) from = k + 1;
        }
        return mine.subList(Math.min(from, mine.size()), Math.min(from + Math.max(1, limit), mine.size()));
    }

    @Override
    public InvoiceSummary retrieveInvoice(String invoiceId) {
        InvoiceSummary i = invoiceStore.get(invoiceId);
        if (i == null) throw missing("invoice");
        return i;
    }

    @Override
    public String createProduct(ProductSpec spec, IdempotencyKey key) {
        String known = keyResults.get("prod:" + key.value());
        if (known != null) return known;
        String id = "prod_sim_" + run + "_" + (++seq);
        keyResults.put("prod:" + key.value(), id);
        return id;
    }

    @Override
    public String createPrice(PriceSpec spec, IdempotencyKey key) {
        String known = keyResults.get("price:" + key.value());
        if (known != null) return known;
        String id = "price_sim_" + run + "_" + (++seq);
        prices.put(id, new SimPrice(id, spec.productId(), spec.unitAmountMinor(), spec.currency() == null ? "usd" : spec.currency().toLowerCase(), spec.interval(), true, spec.metadata()));
        keyResults.put("price:" + key.value(), id);
        return id;
    }

    @Override
    public void deactivatePrice(String priceId, IdempotencyKey key) {
        SimPrice p = prices.get(priceId);
        if (p != null) prices.put(priceId, new SimPrice(p.id(), p.productId(), p.amountMinor(), p.currency(), p.interval(), false, p.metadata()));
    }

    @Override
    public List<StripePriceInfo> listPrices(int max) {
        List<StripePriceInfo> out = new ArrayList<>();
        for (SimPrice p : prices.values()) {
            if (!"kiwiply".equals(p.metadata().get("app"))) continue;
            out.add(new StripePriceInfo(p.id(), p.productId(), p.currency(), p.amountMinor(), p.active(), p.interval(), p.metadata()));
        }
        return out.subList(0, Math.min(max, out.size()));
    }

    /** One simulated test clock: its id is fixed, creating it freezes the world's time at {@code frozenAt} (never backwards). */
    @Override
    public String createTestClock(Instant frozenAt, IdempotencyKey key) {
        if (frozenAt.isAfter(clock)) advance(frozenAt);
        return "clock_sim_" + run;
    }

    @Override
    public void advanceTestClock(String clockId, Instant to, IdempotencyKey key) {
        advance(to);
    }

    @Override
    public SubscriptionSnapshot retrieveSubscription(String subscriptionId) {
        if (!enabled) throw new StripeGatewayException("off", StripeGatewayException.Kind.NOT_ENABLED, null, null);
        SimSub s = subs.get(subscriptionId);
        return s == null ? null : snapshot(s);
    }

    // ------------------------------------------------------------------------------------------------------------------ the engine

    private void renew(SimSub s) {
        if ("trialing".equals(s.status)) s.status = "active"; // billing starts now (K8-Q1: trial_end only marks when billing begins)
        SimSchedule sc = s.scheduleId == null ? null : schedules.get(s.scheduleId);
        if (s.cancelAtPeriodEnd) {
            end(s);
            return;
        }
        if (sc != null && "active".equals(sc.status) && !sc.at.isAfter(clock)) {
            s.items.keySet().removeIf(p -> sc.phaseItems.stream().noneMatch(i -> i.priceId().equals(p) && i.quantity() > 0));
            for (ItemQuantity i : sc.phaseItems) {
                if (i.quantity() <= 0) continue;
                SimItem existing = s.items.get(i.priceId());
                if (existing == null) s.items.put(i.priceId(), new SimItem("si_sim_" + run + "_" + (++seq), i.quantity()));
                else existing.quantity = i.quantity();
            }
            sc.status = "completed";
            s.scheduleId = null;
            emit(scheduleEvent("subscription_schedule.completed", s, sc));
        }
        s.periodStart = clock;
        s.periodEnd = plusMonths(clock, baseMonths(s));
        InvoiceSummary inv = invoiceFor(s, "subscription_cycle");
        emit(invoiceEvent("invoice.created", s, inv));
        if (card == Card.OK) {
            InvoiceSummary paid = payInvoice(s, inv);
            emit(invoiceEvent("invoice.paid", s, paid));
            s.status = "active";
            emit(subscriptionEvent("customer.subscription.updated", s));
        } else {
            s.status = "past_due";
            s.openInvoiceId = inv.id();
            s.dunningDeadline = clock.plus(DUNNING_DAYS, ChronoUnit.DAYS);
            emit(invoiceEvent("invoice.payment_failed", s, inv));
            emit(subscriptionEvent("customer.subscription.updated", s));
        }
    }

    private void lapse(SimSub s) {
        if (s.openInvoiceId != null) {
            InvoiceSummary open = invoiceStore.get(s.openInvoiceId);
            InvoiceSummary voided = copy(open, "void", open.amountPaidMinor(), null);
            invoiceStore.put(voided.id(), voided);
            emit(invoiceEvent("invoice.voided", s, voided));
        }
        end(s);
    }

    private void end(SimSub s) {
        s.status = "canceled";
        s.cancelAtPeriodEnd = false;
        s.dunningDeadline = null;
        s.openInvoiceId = null;
        if (s.scheduleId != null) {
            SimSchedule sc = schedules.get(s.scheduleId);
            if (sc != null) sc.status = "canceled";
            s.scheduleId = null;
        }
        emit(subscriptionEvent("customer.subscription.deleted", s));
    }

    private InvoiceSummary invoiceFor(SimSub s, String reason) {
        List<InvoiceLine> lines = new ArrayList<>();
        for (Map.Entry<String, SimItem> e : s.items.entrySet()) {
            SimPrice p = requirePrice(e.getKey());
            long q = e.getValue().quantity;
            lines.add(new InvoiceLine(p.id(), q, p.amountMinor() * q, q + " x " + p.id(), s.periodStart, s.periodEnd, false));
        }
        List<Pending> mine = pending.stream().filter(p -> p.customerId().equals(s.customerId)).toList();
        for (Pending p : mine) lines.add(new InvoiceLine(null, 1, p.amountMinor(), p.description(), s.periodStart, s.periodEnd, true));
        pending.removeAll(mine);
        long total = lines.stream().mapToLong(InvoiceLine::amountMinor).sum();
        String id = "in_sim_" + run + "_" + (++seq);
        InvoiceSummary inv = new InvoiceSummary(id, "SIM-" + String.format("%04d", invoiceStore.size() + 1), "open", "usd", total, 0, s.periodStart, s.periodEnd, null, null, "https://invoice.test/" + id, "https://invoice.test/" + id + ".pdf", s.id, lines);
        invoiceStore.put(id, inv);
        return inv;
    }

    private InvoiceSummary payInvoice(SimSub s, InvoiceSummary inv) {
        InvoiceSummary paid = copy(inv, "paid", inv.amountDueMinor(), clock);
        invoiceStore.put(paid.id(), paid);
        return paid;
    }

    private static InvoiceSummary copy(InvoiceSummary i, String status, long paid, Instant paidAt) {
        return new InvoiceSummary(i.id(), i.number(), status, i.currency(), i.amountDueMinor(), paid, i.periodStart(), i.periodEnd(), i.dueAt(), paidAt, i.hostedUrl(), i.pdfUrl(), i.subscriptionId(), i.lines());
    }

    private int baseMonths(SimSub s) {
        for (String priceId : s.items.keySet()) {
            SimPrice p = requirePrice(priceId);
            if (p.interval().isRecurring()) return p.interval().intervalCount();
        }
        return 1;
    }

    private static Instant plusMonths(Instant from, int months) {
        return from.atZone(ZoneOffset.UTC).plusMonths(months).toInstant();
    }

    private SimPrice requirePrice(String id) {
        SimPrice p = prices.get(id);
        if (p == null) throw new IllegalStateException("The simulated Stripe does not know price " + id + ": call definePrice(...) in the fixture");
        return p;
    }

    private StripeGatewayException missing(String what) {
        return new StripeGatewayException("No such " + what, StripeGatewayException.Kind.INVALID_REQUEST, "resource_missing", null);
    }

    private SubscriptionSnapshot snapshot(SimSub s) {
        List<StripeWebhookEvent.Item> items = new ArrayList<>();
        s.items.forEach((p, i) -> items.add(new StripeWebhookEvent.Item(i.id, p, i.quantity)));
        return new SubscriptionSnapshot(s.id, s.customerId, s.status, s.cancelAtPeriodEnd, s.periodStart, s.periodEnd, s.scheduleId, items);
    }

    // ------------------------------------------------------------------------------------------------------------------ events

    private void emit(StripeWebhookEvent e) {
        outbox.add(e);
        history.add(e);
        events.put(e.id(), e);
    }

    private String eventId() {
        return "evt_sim_" + run + "_" + (++seq);
    }

    private StripeWebhookEvent subscriptionEvent(String type, SimSub s) {
        List<StripeWebhookEvent.Item> items = new ArrayList<>();
        s.items.forEach((p, i) -> items.add(new StripeWebhookEvent.Item(i.id, p, i.quantity)));
        String first = s.items.isEmpty() ? null : s.items.keySet().iterator().next();
        return new StripeWebhookEvent(
            eventId(), type, clock, "subscription", s.customerId, s.id, s.status, first, s.periodEnd, s.cancelAtPeriodEnd, null, null, null, "kiwiply",
            s.periodStart, StripeWebhookEvent.SCOPE_PERSONAL, null, s.metadata.get("quote_id"), items, null, s.scheduleId, null, null
        );
    }

    private StripeWebhookEvent sessionEvent(SimSub s, CheckoutSpec spec) {
        return new StripeWebhookEvent(
            eventId(), "checkout.session.completed", clock, "checkout.session", s.customerId, s.id, null, null, null, null,
            spec.userId() == null ? null : String.valueOf(spec.userId()), null, null, "kiwiply", null, StripeWebhookEvent.SCOPE_PERSONAL, null,
            spec.metadata().get("quote_id"), List.of(), null, null, null, null
        );
    }

    private StripeWebhookEvent scheduleEvent(String type, SimSub s, SimSchedule sc) {
        return new StripeWebhookEvent(
            eventId(), type, clock, "subscription_schedule", s.customerId, s.id, sc.status, null, null, null, null, null, null, "kiwiply", null,
            StripeWebhookEvent.SCOPE_PERSONAL, null, null, List.of(), null, sc.id, null, null
        );
    }

    private StripeWebhookEvent invoiceEvent(String type, SimSub s, InvoiceSummary i) {
        List<StripeWebhookEvent.InvoiceLineInfo> lines = i.lines().stream()
            .map(l -> new StripeWebhookEvent.InvoiceLineInfo(l.priceId(), l.quantity(), l.amountMinor(), l.description(), l.periodStart(), l.periodEnd(), l.proration()))
            .toList();
        StripeWebhookEvent.InvoiceInfo info = new StripeWebhookEvent.InvoiceInfo(
            i.id(), i.number(), i.status(), i.currency(), i.amountDueMinor(), i.amountPaidMinor(), i.periodStart(), i.periodEnd(), i.dueAt(), i.paidAt(), i.hostedUrl(), i.pdfUrl(), lines
        );
        long amount = "invoice.paid".equals(type) ? i.amountPaidMinor() : i.amountDueMinor();
        return new StripeWebhookEvent(
            eventId(), type, clock, "invoice", s.customerId, s.id, null, null, null, null, null, amount, i.currency(), "kiwiply", null,
            StripeWebhookEvent.SCOPE_PERSONAL, null, null, List.of(), info, null, null, null
        );
    }
}
