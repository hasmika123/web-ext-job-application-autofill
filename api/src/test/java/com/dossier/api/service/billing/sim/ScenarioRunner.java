package com.dossier.api.service.billing.sim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.catalog.BillingDrift;
import com.dossier.api.domain.sub.SubscriptionAddon;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.BillingDriftRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import com.dossier.api.repository.sub.SubscriptionAddonRepository;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.MailService;
import com.dossier.api.service.billing.IdempotencyKey;
import com.dossier.api.service.billing.BillingWebhookService;
import com.dossier.api.service.billing.StripeGateway.ItemQuantity;
import com.dossier.api.service.billing.StripeWebhookEvent;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.billing.reconcile.PersonalBillingReconciler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.mockito.Mockito;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * The golden scenario runner (story K8.6, docs/subscriptions/07 section 7). A scenario is a JSON script in {@code src/test/resources/billing-scenarios/}: a list
 * of steps that drive Kiwiply's real HTTP routes (quotes, checkout, confirm), the {@link StatefulFakeStripeGateway} (the customer paying, cancelling in the
 * portal, the card failing, the clock moving) and the real {@link BillingWebhookService} (every event the simulated Stripe emits is delivered through it,
 * recorded, deduplicated and applied), and assert on the mirror after each interesting step. It is deterministic: the only clock is the simulated one.
 *
 * <pre>
 * { "name": "...", "description": "...", "steps": [
 *   { "do": "quote", "as": "q1", "kind": "CHECKOUT", "interval": "MONTH", "addons": [ { "featureKey": "ai.credits_extra", "quantity": 2 } ] },
 *   { "do": "checkout", "quote": "q1" },                 // POST /api/billing/quotes/{id}/checkout
 *   { "do": "stripe.completeCheckout" },                 // the customer pays on the hosted page; events are delivered
 *   { "do": "expect", "subscription": { "status": "active", "interval": "MONTH" }, "addons": { "ai.credits_extra": 2 }, "pro": true }
 * ] }
 * </pre>
 *
 * Steps: {@code quote} (kind CHECKOUT or CHANGE, planKey TQ, interval, addons; stores the answer under {@code as}), {@code checkout}, {@code confirm} (CHANGE
 * quote; optional {@code key} to reuse an Idempotency-Key, {@code expectStatus}), {@code stripe.completeCheckout}, {@code stripe.card} (OK or DECLINED),
 * {@code stripe.payOpenInvoice}, {@code stripe.portalCancel}, {@code stripe.portalUndoCancel}, {@code stripe.scheduleIntervalSwitch} (toInterval; the schedule
 * applies at the period end), {@code stripe.switchBySecondSubscription} (K8-Q1: cancel at period end plus a new subscription billing from then),
 * {@code advance} ({@code days}, or {@code toPeriodEnd} with {@code plusHours}), {@code deliver}, {@code expect}. Every step that makes Stripe emit events delivers
 * them straight away, in order, unless {@code "hold": true}; {@code "duplicates": true} delivers each twice (Stripe is at-least-once).
 *
 * <p>{@code expect} keys: {@code subscription} {status, interval, cancelAtPeriodEnd}, {@code pro} (the entitlement rule at the simulated time), {@code addons}
 * (live add-ons without a scheduled end: feature to quantity, exact), {@code addonsEnding} (features scheduled to end), {@code stripeItems} (price id to quantity
 * in the simulated Stripe, exact), {@code invoices} (rows in the mirror), {@code lastInvoice} {status, amountPaidMinor, hasProration}, {@code reconcileDrift}
 * (open PERSONAL drift rows for the subscription after running the K8.5 reconciler against the simulated Stripe), {@code paymentFailedEmails},
 * {@code duplicatesIgnored}, {@code subscriptionIdChanged}.
 */
public class ScenarioRunner {

    /** What the runner needs from the Spring test. */
    public record Env(
        MockMvc mvc,
        StatefulFakeStripeGateway stripe,
        BillingWebhookService webhook,
        SubscriptionRepository subscriptions,
        SubscriptionAddonRepository addons,
        InvoiceRepository invoices,
        UserRepository users,
        BillingDriftRepository drifts,
        PersonalBillingReconciler reconciler,
        MailService mail,
        Runnable syncPersistence,
        String login
    ) {}

    private static final String PAYMENT_FAILED_SUBJECT = "Your Kiwiply Pro payment didn't go through";
    private static final Map<String, String> QUARTER_OF = Map.of(SubFixtures.BASE_MONTH, SubFixtures.BASE_QUARTER, SubFixtures.AI_MONTH, SubFixtures.AI_QUARTER);

    private final Env env;
    private final ObjectMapper json = new ObjectMapper();
    private final Map<String, JsonNode> quotes = new HashMap<>();
    private final Map<String, Long> quoteIds = new HashMap<>();
    private String lastSessionKey;
    private String firstSubscriptionId;
    private int duplicatesIgnored = 0;
    private String scenario = "?";
    private int stepNo = 0;

    public ScenarioRunner(Env env) {
        this.env = env;
    }

    /** Run every step; an assertion failure names the scenario, the step number and its {@code do}. */
    public void run(JsonNode script) throws Exception {
        scenario = script.path("name").asText("?");
        stepNo = 0;
        for (JsonNode step : script.path("steps")) {
            stepNo++;
            try {
                execute(step);
            } catch (AssertionError | RuntimeException e) {
                throw new AssertionError("scenario '" + scenario + "' step " + stepNo + " (" + step.path("do").asText() + "): " + e.getMessage(), e);
            }
        }
    }

    private void execute(JsonNode step) throws Exception {
        String action = step.path("do").asText();
        boolean emits = true;
        switch (action) {
            case "quote" -> {
                quote(step);
                emits = false;
            }
            case "checkout" -> {
                checkout(step);
                emits = false;
            }
            case "confirm" -> confirm(step);
            case "stripe.completeCheckout" -> {
                String id = env.stripe().completeCheckout(lastSessionKey);
                if (firstSubscriptionId == null) firstSubscriptionId = id;
            }
            case "stripe.card" -> env.stripe().setCard(StatefulFakeStripeGateway.Card.valueOf(step.path("state").asText("OK")));
            case "stripe.payOpenInvoice" -> env.stripe().payOpenInvoice(currentStripeSubscription());
            case "stripe.portalCancel" -> env.stripe().portalCancel(currentStripeSubscription());
            case "stripe.portalUndoCancel" -> env.stripe().portalUndoCancel(currentStripeSubscription());
            case "stripe.scheduleIntervalSwitch" -> scheduleIntervalSwitch(step);
            case "stripe.switchBySecondSubscription" -> switchBySecondSubscription(step);
            case "advance" -> advance(step);
            case "deliver" -> {}
            case "expect" -> {
                expect(step);
                emits = false;
            }
            default -> throw new IllegalArgumentException("unknown step '" + action + "'");
        }
        if (emits && !step.path("hold").asBoolean(false)) deliver(step.path("duplicates").asBoolean(false));
    }

    // ------------------------------------------------------------------------------------------------------------------ Kiwiply's routes

    private void quote(JsonNode step) throws Exception {
        String kind = step.path("kind").asText("CHECKOUT");
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("kind", kind);
        if ("CHECKOUT".equals(kind)) {
            body.put("planKey", step.path("planKey").asText(SubFixtures.PLAN_KEY));
            body.put("interval", step.path("interval").asText("MONTH"));
        }
        body.put("addons", json.convertValue(step.path("addons").isMissingNode() ? json.createArrayNode() : step.path("addons"), List.class));
        MvcResult r = env.mvc().perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body))).andReturn();
        assertThat(r.getResponse().getStatus()).as("quote status: " + r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode answer = json.readTree(r.getResponse().getContentAsString());
        String as = step.path("as").asText("q");
        quotes.put(as, answer);
        quoteIds.put(as, answer.path("quoteId").asLong());
    }

    private void checkout(JsonNode step) throws Exception {
        long id = quoteIds.get(step.path("quote").asText("q"));
        MvcResult r = env.mvc().perform(post("/api/billing/quotes/" + id + "/checkout").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn();
        assertThat(r.getResponse().getStatus()).as("checkout status: " + r.getResponse().getContentAsString()).isEqualTo(200);
        lastSessionKey = "co-" + id;
        assertThat(env.stripe().session(lastSessionKey)).as("the simulated Stripe holds the session").isNotNull();
    }

    private void confirm(JsonNode step) throws Exception {
        long id = quoteIds.get(step.path("quote").asText("q"));
        String key = step.has("key") ? step.get("key").asText() : UUID.randomUUID().toString();
        MvcResult r = env.mvc().perform(post("/api/billing/quotes/" + id + "/confirm").header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn();
        assertThat(r.getResponse().getStatus()).as("confirm status: " + r.getResponse().getContentAsString()).isEqualTo(step.path("expectStatus").asInt(200));
        env.syncPersistence().run();
    }

    // ------------------------------------------------------------------------------------------------------------------ Stripe and the clock

    private String currentStripeSubscription() {
        env.syncPersistence().run();
        return row().getStripeSubscriptionId();
    }

    private void scheduleIntervalSwitch(JsonNode step) {
        String sub = currentStripeSubscription();
        var s = env.stripe().subscription(sub);
        assertThat(step.path("toInterval").asText("QUARTER")).isEqualTo("QUARTER");
        List<ItemQuantity> items = new ArrayList<>();
        s.items.forEach((price, item) -> {
            String q = QUARTER_OF.get(price);
            if (q != null) items.add(new ItemQuantity(q, item.quantity)); // an add-on with no quarterly price is simply not carried over
        });
        env.stripe().createSchedule(sub, items, s.periodEnd, IdempotencyKey.of("sc-" + sub + "-" + stepNo));
    }

    private void switchBySecondSubscription(JsonNode step) {
        String sub = currentStripeSubscription();
        var s = env.stripe().subscription(sub);
        env.stripe().setCancelAtPeriodEnd(sub, true, IdempotencyKey.of("cx-" + sub + "-" + stepNo));
        env.stripe().createSubscription(s.customerId, List.of(new ItemQuantity(SubFixtures.BASE_QUARTER, 1)), s.periodEnd, Map.of("app", "kiwiply"), IdempotencyKey.of("sw-" + sub + "-" + stepNo));
    }

    private void advance(JsonNode step) {
        Instant to;
        if (step.has("days")) to = env.stripe().now().plus(step.get("days").asLong(), ChronoUnit.DAYS);
        else if (step.path("toPeriodEnd").asBoolean(false)) {
            env.syncPersistence().run();
            to = env.stripe().subscription(row().getStripeSubscriptionId()).periodEnd.plus(step.path("plusHours").asLong(0), ChronoUnit.HOURS);
        } else throw new IllegalArgumentException("advance needs days or toPeriodEnd");
        env.stripe().advance(to);
    }

    private void deliver(boolean duplicates) {
        for (StripeWebhookEvent e : env.stripe().drainEvents()) {
            BillingWebhookService.Outcome o = env.webhook().handle(e);
            assertThat(o).as("first delivery of " + e.type()).isEqualTo(BillingWebhookService.Outcome.PROCESSED);
            if (duplicates && env.webhook().handle(e) == BillingWebhookService.Outcome.DUPLICATE) duplicatesIgnored++;
        }
        env.syncPersistence().run();
    }

    // ------------------------------------------------------------------------------------------------------------------ assertions

    private Subscription row() {
        User user = env.users().findOneByLogin(env.login()).orElseThrow();
        return env.subscriptions().findOneByUserId(user.getId()).orElseThrow(() -> new AssertionError("no subscription row for the user"));
    }

    private void expect(JsonNode e) {
        env.syncPersistence().run();
        Subscription s = row();
        if (e.has("subscription")) {
            JsonNode x = e.get("subscription");
            if (x.has("status")) assertThat(s.getStatus()).as("subscription.status").isEqualTo(x.get("status").asText());
            if (x.has("interval")) assertThat(s.getBillingInterval()).as("subscription.interval").isEqualTo(x.get("interval").asText());
            if (x.has("cancelAtPeriodEnd")) assertThat(s.isCancelAtPeriodEnd()).as("subscription.cancelAtPeriodEnd").isEqualTo(x.get("cancelAtPeriodEnd").asBoolean());
        }
        if (e.has("subscriptionIdChanged")) {
            assertThat(!s.getStripeSubscriptionId().equals(firstSubscriptionId)).as("a second subscription replaced the first on the row").isEqualTo(e.get("subscriptionIdChanged").asBoolean());
        }
        if (e.has("pro")) {
            boolean pro = EntitlementService.isProFor(s.getStatus(), s.getCurrentPeriodEnd(), env.stripe().now());
            assertThat(pro).as("pro at the simulated time " + env.stripe().now() + " (status " + s.getStatus() + ", period end " + s.getCurrentPeriodEnd() + ")").isEqualTo(e.get("pro").asBoolean());
        }
        if (e.has("addons")) {
            Map<String, Long> live = new LinkedHashMap<>();
            for (SubscriptionAddon a : env.addons().findBySubscriptionIdAndLiveTrueOrderByIdAsc(s.getId())) {
                if (a.getEndsAt() == null) live.merge(a.getFeatureKey(), (long) a.getQuantity(), Long::sum);
            }
            assertThat(live).as("live add-ons without a scheduled end").isEqualTo(longMap(e.get("addons")));
        }
        if (e.has("addonsEnding")) {
            List<String> ending = new ArrayList<>();
            for (SubscriptionAddon a : env.addons().findBySubscriptionIdAndLiveTrueOrderByIdAsc(s.getId())) if (a.getEndsAt() != null) ending.add(a.getFeatureKey());
            List<String> want = new ArrayList<>();
            e.get("addonsEnding").forEach(n -> want.add(n.asText()));
            assertThat(ending).as("add-ons scheduled to end").containsExactlyInAnyOrderElementsOf(want);
        }
        if (e.has("stripeItems")) {
            assertThat(env.stripe().subscription(s.getStripeSubscriptionId()).quantities()).as("items in the simulated Stripe").isEqualTo(longMap(e.get("stripeItems")));
        }
        List<Invoice> mirror = env.invoices().findByUserIdOrderByCreatedAtDesc(s.getUser().getId(), PageRequest.of(0, 100));
        if (e.has("invoices")) assertThat(mirror).as("invoices in the mirror").hasSize(e.get("invoices").asInt());
        if (e.has("paidTotalMinor")) assertThat(mirror.stream().mapToLong(Invoice::getAmountPaidMinor).sum()).as("total paid across all mirrored invoices (no double charge)").isEqualTo(e.get("paidTotalMinor").asLong());
        if (e.has("lastInvoice")) {
            JsonNode x = e.get("lastInvoice");
            Invoice last = mirror.stream().max(java.util.Comparator.comparing(Invoice::getCreatedAt).thenComparing(Invoice::getId)).orElseThrow(() -> new AssertionError("no invoice in the mirror"));
            if (x.has("status")) assertThat(last.getStatus()).as("last invoice status").isEqualTo(x.get("status").asText());
            if (x.has("amountPaidMinor")) assertThat(last.getAmountPaidMinor()).as("last invoice paid").isEqualTo(x.get("amountPaidMinor").asLong());
            if (x.has("amountDueMinor")) assertThat(last.getAmountDueMinor()).as("last invoice due").isEqualTo(x.get("amountDueMinor").asLong());
            if (x.has("recurringMinor")) {
                long proration = x.has("prorationOfQuote") ? quotes.get(x.get("prorationOfQuote").asText()).path("prorationEstimateMinor").asLong() : 0;
                assertThat(last.getAmountPaidMinor()).as("recurring plus the quoted proration").isEqualTo(x.get("recurringMinor").asLong() + proration);
            }
            if (x.has("hasProration")) {
                boolean has = env.stripe().allInvoices().stream().filter(i -> i.id().equals(last.getStripeInvoiceId())).findFirst().orElseThrow().lines().stream().anyMatch(l -> l.proration());
                assertThat(has).as("last invoice has a proration line").isEqualTo(x.get("hasProration").asBoolean());
            }
        }
        if (e.has("reconcileDrift")) {
            env.reconciler().reconcile(s);
            String sub = s.getStripeSubscriptionId();
            List<BillingDrift> open = env.drifts().findOpen(PersonalBillingReconciler.KIND).stream().filter(d -> d.getSubject() != null && (d.getSubject().equals(sub) || d.getSubject().startsWith(sub + "/"))).toList();
            assertThat(open).as("open drift after reconciling against the simulated Stripe: " + open.stream().map(d -> d.getCode() + " " + d.getSubject()).toList()).hasSize(e.get("reconcileDrift").asInt());
        }
        if (e.has("paymentFailedEmails")) {
            long sent = Mockito.mockingDetails(env.mail()).getInvocations().stream().filter(i -> i.getMethod().getName().equals("sendEmail") && PAYMENT_FAILED_SUBJECT.equals(i.getArguments()[1])).count();
            assertThat(sent).as("payment-failed emails").isEqualTo(e.get("paymentFailedEmails").asLong());
        }
        if (e.has("duplicatesIgnored")) assertThat(duplicatesIgnored).as("duplicate deliveries ignored").isEqualTo(e.get("duplicatesIgnored").asInt());
    }

    private static Map<String, Long> longMap(JsonNode n) {
        Map<String, Long> m = new LinkedHashMap<>();
        Iterator<Map.Entry<String, JsonNode>> it = n.fields();
        while (it.hasNext()) {
            Map.Entry<String, JsonNode> f = it.next();
            m.put(f.getKey(), f.getValue().asLong());
        }
        return m;
    }
}
