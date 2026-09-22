package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.MailService;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Integration tests for the Stripe webhook (Phase 12.2) — the only writer of subscription state.
 *
 * <p>These drive the <b>real</b> signature verification: each payload is signed here exactly as
 * Stripe signs it (HMAC-SHA256 over {@code <timestamp>.<payload>}, header
 * {@code t=…,v1=…}), against a webhook secret set for this test class. Stubbing the gateway would
 * have skipped the one check that stands between this endpoint and the open internet.
 *
 * <p>No Stripe account or network is involved.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.stripe.webhook-secret=whsec_test_secret_for_integration_tests" })
class BillingWebhookIT {

    private static final String SECRET = "whsec_test_secret_for_integration_tests";
    private static final String CUSTOMER = "cus_test_webhook_1";
    private static final String SUBSCRIPTION = "sub_test_webhook_1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private StripeEventRepository stripeEventRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private EntitlementService entitlementService;

    /** Mocked so a payment-failure email is observable without sending anything. */
    @MockitoBean
    private MailService mailService;

    /**
     * A spy, not a mock: every method stays real, so only the one call a race would get wrong
     * can be made to lie. See {@link #aLostInsertRaceIsATwoHundredNotAFiveHundred}.
     */
    @MockitoSpyBean
    private StripeEventRepository stripeEventSpy;

    /** Spy so one save can be made to fail, which is what a transient database error looks like. */
    @MockitoSpyBean
    private SubscriptionRepository subscriptionSpy;

    private User user;

    @BeforeEach
    void seed() {
        subscriptionRepository.deleteAll();
        stripeEventRepository.deleteAll();
        user = userRepository.findOneByLogin("user").orElseThrow();
    }

    // ---- Stripe's own signing scheme -------------------------------------------------------

    private static String sign(String payload, String secret, Instant at) {
        long t = at.getEpochSecond();
        String signed = t + "." + payload;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] raw = mac.doFinal(signed.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : raw) hex.append(String.format("%02x", b));
            return "t=" + t + ",v1=" + hex;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private int deliver(String payload, String secret) throws Exception {
        return mockMvc
            .perform(
                post("/api/billing/webhook")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Stripe-Signature", sign(payload, secret, Instant.now()))
                    .content(payload)
            )
            .andReturn()
            .getResponse()
            .getStatus();
    }

    // ---- payload builders ------------------------------------------------------------------

    private String subscriptionEvent(String eventId, String type, String status, Instant created, Instant periodEnd, boolean cancelAtEnd) {
        return (
            "{\"id\":\"" +
            eventId +
            "\",\"object\":\"event\",\"api_version\":\"2025-03-31.basil\",\"created\":" +
            created.getEpochSecond() +
            ",\"type\":\"" +
            type +
            "\",\"data\":{\"object\":{\"id\":\"" +
            SUBSCRIPTION +
            "\",\"object\":\"subscription\",\"customer\":\"" +
            CUSTOMER +
            "\",\"status\":\"" +
            status +
            "\",\"cancel_at_period_end\":" +
            cancelAtEnd +
            ",\"items\":{\"object\":\"list\",\"data\":[{\"id\":\"si_1\",\"object\":\"subscription_item\"," +
            "\"current_period_end\":" +
            periodEnd.getEpochSecond() +
            ",\"price\":{\"id\":\"price_monthly_test\",\"object\":\"price\"}}]}}}}"
        );
    }

    private String checkoutCompleted(String eventId, Long userId, Instant created) {
        return (
            "{\"id\":\"" +
            eventId +
            "\",\"object\":\"event\",\"api_version\":\"2025-03-31.basil\",\"created\":" +
            created.getEpochSecond() +
            ",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_test_1\"," +
            "\"object\":\"checkout.session\",\"customer\":\"" +
            CUSTOMER +
            "\",\"subscription\":\"" +
            SUBSCRIPTION +
            "\",\"client_reference_id\":\"" +
            userId +
            "\"}}}"
        );
    }

    private String invoiceEvent(String eventId, String type, Instant created) {
        return (
            "{\"id\":\"" +
            eventId +
            "\",\"object\":\"event\",\"api_version\":\"2025-03-31.basil\",\"created\":" +
            created.getEpochSecond() +
            ",\"type\":\"" +
            type +
            "\",\"data\":{\"object\":{\"id\":\"in_test_1\",\"object\":\"invoice\",\"customer\":\"" +
            CUSTOMER +
            "\"}}}"
        );
    }

    private Subscription reload() {
        return subscriptionRepository.findOneByStripeCustomerId(CUSTOMER).orElseThrow();
    }

    // ---- the tests -------------------------------------------------------------------------

    @Test
    @DisplayName("A forged delivery is rejected and leaves no trace")
    void wrongSecretIsRejectedAndRecordsNothing() throws Exception {
        String payload = checkoutCompleted("evt_forged_1", user.getId(), Instant.now());
        assertThat(deliver(payload, "whsec_the_wrong_secret")).isEqualTo(400);
        // Nothing recorded: an unverified payload must not be able to fill our tables either.
        assertThat(stripeEventRepository.count()).isZero();
        assertThat(subscriptionRepository.count()).isZero();
    }

    @Test
    @DisplayName("checkout.session.completed binds the Stripe customer to our user")
    void checkoutBindsCustomerToUser() throws Exception {
        assertThat(deliver(checkoutCompleted("evt_checkout_1", user.getId(), Instant.now()), SECRET)).isEqualTo(200);

        // Asserted through the login lookup rather than sub.getUser(): outside a transaction the
        // User is an uninitialised proxy, and this is the query the rest of the app actually uses.
        assertThat(subscriptionRepository.findOneByUserLogin("user")).isPresent();
        Subscription sub = reload();
        assertThat(sub.getStripeSubscriptionId()).isEqualTo(SUBSCRIPTION);
        assertThat(stripeEventRepository.findById("evt_checkout_1").orElseThrow().getStatus()).isEqualTo(StripeEvent.STATUS_OK);
    }

    @Test
    @DisplayName("A subscription event mirrors status, price and period, and makes the user Pro")
    void subscriptionEventUpsertsStateAndGrantsPro() throws Exception {
        deliver(checkoutCompleted("evt_checkout_2", user.getId(), Instant.now()), SECRET);
        Instant periodEnd = Instant.now().plus(30, ChronoUnit.DAYS);
        assertThat(
            deliver(subscriptionEvent("evt_sub_1", "customer.subscription.created", "active", Instant.now(), periodEnd, false), SECRET)
        ).isEqualTo(200);

        Subscription sub = reload();
        assertThat(sub.getStatus()).isEqualTo("active");
        assertThat(sub.getPriceId()).isEqualTo("price_monthly_test");
        assertThat(sub.getCurrentPeriodEnd()).isCloseTo(periodEnd, org.assertj.core.api.Assertions.within(2, ChronoUnit.SECONDS));
        assertThat(sub.getPlan()).isEqualTo(Subscription.PLAN_PRO);
        assertThat(entitlementService.isPro("user")).isTrue();
    }

    @Test
    @DisplayName("A replayed event is a 200 that changes nothing — Stripe retries must be safe")
    void replayIsRecognisedAndChangesNothing() throws Exception {
        deliver(checkoutCompleted("evt_checkout_3", user.getId(), Instant.now()), SECRET);
        String payload = subscriptionEvent(
            "evt_replay_1",
            "customer.subscription.updated",
            "active",
            Instant.now(),
            Instant.now().plus(30, ChronoUnit.DAYS),
            false
        );
        assertThat(deliver(payload, SECRET)).isEqualTo(200);
        Instant firstUpdate = reload().getUpdatedAt();

        // The exact same event again — as Stripe would resend after a timeout.
        assertThat(deliver(payload, SECRET)).isEqualTo(200);
        assertThat(stripeEventRepository.count()).isEqualTo(2); // checkout + one subscription event
        assertThat(reload().getUpdatedAt()).isEqualTo(firstUpdate); // untouched
    }

    @Test
    @DisplayName("An out-of-order delivery cannot resurrect an older status")
    void staleEventIsIgnored() throws Exception {
        deliver(checkoutCompleted("evt_checkout_4", user.getId(), Instant.now()), SECRET);
        Instant newer = Instant.now();
        Instant older = newer.minus(1, ChronoUnit.HOURS);

        deliver(subscriptionEvent("evt_new", "customer.subscription.updated", "canceled", newer, newer.plus(5, ChronoUnit.DAYS), true), SECRET);
        assertThat(reload().getStatus()).isEqualTo("canceled");

        // A stale "active" arriving late must NOT undo the cancellation.
        assertThat(
            deliver(
                subscriptionEvent("evt_old", "customer.subscription.updated", "active", older, older.plus(30, ChronoUnit.DAYS), false),
                SECRET
            )
        ).isEqualTo(200);
        assertThat(reload().getStatus()).isEqualTo("canceled");
    }

    @Test
    @DisplayName("A cancellation keeps Pro until the period ends, then lapses")
    void cancellationIsProUntilPeriodEnd() throws Exception {
        deliver(checkoutCompleted("evt_checkout_5", user.getId(), Instant.now()), SECRET);

        // Cancelled, but the paid-for period still has days left.
        deliver(
            subscriptionEvent(
                "evt_cancel_future",
                "customer.subscription.deleted",
                "canceled",
                Instant.now(),
                Instant.now().plus(5, ChronoUnit.DAYS),
                true
            ),
            SECRET
        );
        assertThat(entitlementService.isPro("user")).isTrue();

        // Once the period has passed, the same status means Free.
        deliver(
            subscriptionEvent(
                "evt_cancel_past",
                "customer.subscription.updated",
                "canceled",
                Instant.now(),
                Instant.now().minus(1, ChronoUnit.DAYS),
                true
            ),
            SECRET
        );
        assertThat(entitlementService.isPro("user")).isFalse();
        assertThat(reload().getPlan()).isEqualTo(Subscription.PLAN_FREE);
    }

    @Test
    @DisplayName("A failed charge marks past_due, emails the user, and does NOT cut them off")
    void paymentFailedEmailsAndKeepsPro() throws Exception {
        deliver(checkoutCompleted("evt_checkout_6", user.getId(), Instant.now()), SECRET);
        deliver(
            subscriptionEvent(
                "evt_sub_active",
                "customer.subscription.created",
                "active",
                Instant.now(),
                Instant.now().plus(20, ChronoUnit.DAYS),
                false
            ),
            SECRET
        );

        assertThat(deliver(invoiceEvent("evt_failed_1", "invoice.payment_failed", Instant.now()), SECRET)).isEqualTo(200);

        assertThat(reload().getStatus()).isEqualTo("past_due");
        // The point of the whole grace rule: they are still Pro while Stripe retries.
        assertThat(entitlementService.isPro("user")).isTrue();
        verify(mailService, times(1)).sendEmail(eq(user.getEmail()), any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("invoice.paid restores good standing without an email")
    void invoicePaidSetsActive() throws Exception {
        deliver(checkoutCompleted("evt_checkout_7", user.getId(), Instant.now()), SECRET);
        deliver(
            subscriptionEvent(
                "evt_sub_pd",
                "customer.subscription.updated",
                "past_due",
                Instant.now(),
                Instant.now().plus(10, ChronoUnit.DAYS),
                false
            ),
            SECRET
        );

        assertThat(deliver(invoiceEvent("evt_paid_1", "invoice.paid", Instant.now()), SECRET)).isEqualTo(200);
        assertThat(reload().getStatus()).isEqualTo("active");
        verify(mailService, never()).sendEmail(any(), any(), any(), anyBoolean(), anyBoolean());
    }

    @Test
    @DisplayName("An event for a customer we've never seen is accepted and ignored, not an error")
    void unknownCustomerIsAQuietNoOp() throws Exception {
        // Stripe can deliver subscription.created before checkout.session.completed. Answering
        // anything but 200 would make Stripe retry an event we genuinely cannot place yet.
        assertThat(
            deliver(
                subscriptionEvent(
                    "evt_orphan",
                    "customer.subscription.created",
                    "active",
                    Instant.now(),
                    Instant.now().plus(30, ChronoUnit.DAYS),
                    false
                ),
                SECRET
            )
        ).isEqualTo(200);
        assertThat(subscriptionRepository.count()).isZero();
        assertThat(stripeEventRepository.findById("evt_orphan").orElseThrow().getStatus()).isEqualTo(StripeEvent.STATUS_OK);
    }

    /**
     * Two deliveries of one event arriving together: the loser must answer <b>200</b>, quietly.
     *
     * <p>Stripe delivers at-least-once, so this is not an edge case, it is Tuesday. The primary
     * key is the idempotency key and the database settles the race — but the losing insert marks
     * its transaction rollback-only, so the violation has to be handled outside the transaction.
     * Handling it inside used to produce an {@code UnexpectedRollbackException} at commit, a 500,
     * and a Stripe retry of an event we had already stored (seen live 2026-09-21).
     *
     * <p>The race is simulated rather than threaded: the row is committed first, then
     * {@code existsById} is made to answer false exactly once, which is precisely what the losing
     * delivery sees when it checks before the winner commits.
     */
    @Test
    @DisplayName("Two deliveries racing: the one that loses the insert still answers 200")
    void aLostInsertRaceIsATwoHundredNotAFiveHundred() throws Exception {
        StripeEvent alreadyThere = new StripeEvent();
        alreadyThere.setId("evt_raced");
        alreadyThere.setType("customer.subscription.created");
        alreadyThere.setReceivedAt(Instant.now());
        alreadyThere.setStatus(StripeEvent.STATUS_OK);
        stripeEventRepository.saveAndFlush(alreadyThere);

        // The winner has inserted but, as far as this delivery could tell, had not yet committed.
        doReturn(false).when(stripeEventSpy).existsById("evt_raced");

        int status = deliver(
            subscriptionEvent("evt_raced", "customer.subscription.created", "active", Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS), false),
            SECRET
        );

        assertThat(status).isEqualTo(200);
        // And the winner's row is untouched — the loser recorded nothing and overwrote nothing.
        assertThat(stripeEventRepository.count()).isEqualTo(1);
    }

    /**
     * A cancellation for a <b>different</b> subscription on the same customer must not downgrade
     * the one we mirror.
     *
     * <p>Before this, {@code findSubscription} fell back to the customer whenever the subscription
     * id did not match, so a stray subscription's fate was written onto the row of the one the
     * user is actually paying for. A customer can end up with two subscriptions whenever a
     * webhook is missed (seen for real, 12.7), and cancelling the stray one revoked Pro from a
     * paying customer.
     */
    @Test
    @DisplayName("Cancelling another subscription on the same customer does not revoke Pro")
    void aForeignSubscriptionCancellationIsIgnored() throws Exception {
        // The subscription we mirror: bound to our user, alive, paid up.
        deliver(checkoutCompleted("evt_bind_foreign", user.getId(), Instant.now()), SECRET);
        assertThat(
            deliver(
                subscriptionEvent("evt_mine", "customer.subscription.created", "active", Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS), false),
                SECRET
            )
        ).isEqualTo(200);
        assertThat(entitlementService.isPro("user")).isTrue();

        // A DIFFERENT subscription on the same customer is cancelled outright.
        String foreign = subscriptionEvent(
            "evt_foreign",
            "customer.subscription.deleted",
            "canceled",
            Instant.now().plusSeconds(60),
            Instant.now().minus(1, ChronoUnit.DAYS),
            false
        ).replace(SUBSCRIPTION, "sub_someone_elses");

        assertThat(deliver(foreign, SECRET)).isEqualTo(200);

        // Still Pro, still mirroring our own subscription.
        assertThat(entitlementService.isPro("user")).isTrue();
        Subscription row = subscriptionRepository.findOneByUserLogin("user").orElseThrow();
        assertThat(row.getStripeSubscriptionId()).isEqualTo(SUBSCRIPTION);
        assertThat(row.getStatus()).isEqualTo("active");
    }

    // ---- pre-launch review, 2026-09-22 ---------------------------------------------------------

    /**
     * When applying an event fails, Stripe's retry must actually re-apply it.
     *
     * <p>We answer 500 precisely so that Stripe retries — and then the retry hit the
     * already-recorded row and was waved through as a duplicate. One transient database error
     * and the event that would have made someone Pro was lost for good. The record has to know
     * the difference between "handled" and "tried and failed".
     */
    @Test
    @DisplayName("An event whose apply failed is re-applied when Stripe retries it")
    void aFailedApplyIsRetriedNotTreatedAsADuplicate() throws Exception {
        deliver(checkoutCompleted("evt_checkout_retry", user.getId(), Instant.now()), SECRET);
        String payload = subscriptionEvent(
            "evt_flaky",
            "customer.subscription.created",
            "active",
            Instant.now(),
            Instant.now().plus(30, ChronoUnit.DAYS),
            false
        );

        // First delivery: the write blows up (a transient database error).
        doThrow(new org.springframework.dao.QueryTimeoutException("simulated")).when(subscriptionSpy).save(any(Subscription.class));
        assertThat(deliver(payload, SECRET)).isEqualTo(500);
        assertThat(stripeEventRepository.findById("evt_flaky").orElseThrow().getStatus()).isEqualTo(StripeEvent.STATUS_FAILED);
        assertThat(entitlementService.isPro("user")).isFalse();

        // Stripe retries. Same event id, same payload. (reset(), not doCallRealMethod(): save()
        // is an interface method on a Spring Data proxy, and a spy can't "call real" on an
        // abstract method — resetting simply removes the stub so the proxy answers again.)
        org.mockito.Mockito.reset(subscriptionSpy);
        assertThat(deliver(payload, SECRET)).isEqualTo(200);

        assertThat(stripeEventRepository.findById("evt_flaky").orElseThrow().getStatus()).isEqualTo(StripeEvent.STATUS_OK);
        assertThat(entitlementService.isPro("user")).isTrue();
    }

    /**
     * The payment-failed email survives out-of-order delivery.
     *
     * <p>Stripe emits {@code invoice.payment_failed} and the matching
     * {@code customer.subscription.updated} (past_due) moments apart. When the updated event
     * lands first, the payment_failed is older and is (correctly) not allowed to write state —
     * but the user still has to be told. Before this, the email was dropped along with the write.
     */
    @Test
    @DisplayName("A stale invoice.payment_failed still emails the user")
    void aStalePaymentFailedStillEmails() throws Exception {
        Instant t = Instant.now().minusSeconds(120);
        deliver(checkoutCompleted("evt_checkout_stale", user.getId(), t), SECRET);
        deliver(subscriptionEvent("evt_sub_ok", "customer.subscription.created", "active", t, t.plus(20, ChronoUnit.DAYS), false), SECRET);

        // The newer event arrives first and already says past_due.
        assertThat(
            deliver(subscriptionEvent("evt_sub_pd", "customer.subscription.updated", "past_due", t.plusSeconds(60), t.plus(20, ChronoUnit.DAYS), false), SECRET)
        ).isEqualTo(200);
        verify(mailService, never()).sendEmail(any(), any(), any(), anyBoolean(), anyBoolean());

        // Then the older payment_failed. Stale for state; not stale for the user.
        assertThat(deliver(invoiceEvent("evt_pf_late", "invoice.payment_failed", t.plusSeconds(30)), SECRET)).isEqualTo(200);

        assertThat(reload().getStatus()).isEqualTo("past_due");
        assertThat(entitlementService.isPro("user")).isTrue();
        verify(mailService, times(1)).sendEmail(eq(user.getEmail()), any(), any(), anyBoolean(), anyBoolean());
    }
}
