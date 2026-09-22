package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeGateway;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Integration tests for {@code GET /api/billing/me} (Phase 12.1).
 *
 * <p>The contract that matters: a user who has never paid gets a clean Free answer rather than a
 * 404 or an error, and the tests run on a server with <b>no Stripe key</b> — which is the state
 * CI and every fresh clone are in, so `billingEnabled` is false here by design.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@TestPropertySource(
    properties = { "dossier.stripe.price-monthly=price_test_monthly", "dossier.stripe.price3mo=price_test_3mo" }
)
class BillingResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserRepository userRepository;

    /**
     * Stubbed rather than real: these tests are about OUR decisions — already-Pro, no customer,
     * billing off, customer reuse — not about Stripe's API. A stub also means the suite needs no
     * key and no network, which is how CI runs.
     */
    @MockitoBean
    private StripeGateway stripeGateway;

    @BeforeEach
    void stubStripe() {
        subscriptionRepository.deleteAll();
        when(stripeGateway.isEnabled()).thenReturn(true);
        when(stripeGateway.createCustomer(any(), any(), anyLong())).thenReturn("cus_stub_1");
        when(stripeGateway.createCheckoutSession(any(), any(), anyLong(), any(), any())).thenReturn("https://checkout.stripe.test/session");
        when(stripeGateway.createPortalSession(any(), any())).thenReturn("https://portal.stripe.test/session");
        // Default: Stripe agrees with our mirror. Individual tests override it.
        when(stripeGateway.hasLiveSubscription(any())).thenReturn(false);
    }

    private Subscription rowFor(String login) {
        User user = userRepository.findOneByLogin(login).orElseThrow();
        Subscription sub = new Subscription();
        sub.setUser(user);
        return sub;
    }

    @Test
    @Transactional
    void noSubscriptionRowIsFreeAndNeverA404() throws Exception {
        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("FREE"))
            .andExpect(jsonPath("$.status").value("none"))
            .andExpect(jsonPath("$.cancelAtPeriodEnd").value(false))
            .andExpect(jsonPath("$.hasCustomer").value(false))
            // Billing is configured here (the gateway stub says so); the keyless case has its
            // own test below, which is also what CI and a fresh clone actually run.
            .andExpect(jsonPath("$.billingEnabled").value(true));
    }

    @Test
    @Transactional
    void anActiveSubscriptionReadsAsPro() throws Exception {
        Subscription sub = rowFor("user");
        sub.setStatus("active");
        sub.setStripeCustomerId("cus_active_1");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);

        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("PRO"))
            .andExpect(jsonPath("$.status").value("active"))
            // A customer exists, so the client may offer "Manage billing".
            .andExpect(jsonPath("$.hasCustomer").value(true));
    }

    @Test
    @Transactional
    void aFailedChargeStillReadsAsProInsideThePaidPeriod() throws Exception {
        // The case worth protecting: an expired card must not cut someone off mid-period while
        // Stripe is still retrying.
        Subscription sub = rowFor("user");
        sub.setStatus("past_due");
        sub.setStripeCustomerId("cus_pastdue_1");
        sub.setCurrentPeriodEnd(Instant.now().plus(3, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);

        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("PRO"))
            // Surfaced verbatim so the UI can say "update your card".
            .andExpect(jsonPath("$.status").value("past_due"));
    }

    @Test
    @Transactional
    void aCancelledSubscriptionReadsAsProUntilItsPeriodEnds() throws Exception {
        Subscription sub = rowFor("user");
        sub.setStatus("active");
        sub.setCancelAtPeriodEnd(true);
        sub.setStripeCustomerId("cus_cancelling_1");
        sub.setCurrentPeriodEnd(Instant.now().plus(5, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);

        mockMvc
            .perform(get("/api/billing/me"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.plan").value("PRO"))
            // The client shows "cancels on <date>" rather than a renewal date.
            .andExpect(jsonPath("$.cancelAtPeriodEnd").value(true));
    }

    @Test
    @Transactional
    void anExpiredCancellationReadsAsFree() throws Exception {
        Subscription sub = rowFor("user");
        sub.setStatus("canceled");
        sub.setStripeCustomerId("cus_expired_1");
        sub.setCurrentPeriodEnd(Instant.now().minus(1, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);

        mockMvc.perform(get("/api/billing/me")).andExpect(status().isOk()).andExpect(jsonPath("$.plan").value("FREE"));
    }

    // ---- checkout + portal (12.3) ----------------------------------------------------------

    private String checkout(String plan) throws Exception {
        return mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"" + plan + "\"}"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    }

    @Test
    @Transactional
    @DisplayName("Checkout creates the Stripe customer once and reuses it forever after")
    void checkoutCreatesCustomerOnceThenReusesIt() throws Exception {
        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.url").value("https://checkout.stripe.test/session"));

        // The customer id is persisted, so their invoices and payment history stay on one customer.
        assertThat(subscriptionRepository.findOneByUserLogin("user").orElseThrow().getStripeCustomerId()).isEqualTo("cus_stub_1");
        // Crucially, checkout did NOT make them Pro — only the webhook can do that.
        assertThat(subscriptionRepository.findOneByUserLogin("user").orElseThrow().getPlan()).isEqualTo(Subscription.PLAN_FREE);

        checkout("3mo");
        verify(stripeGateway, times(1)).createCustomer(any(), any(), anyLong());
    }

    @Test
    @Transactional
    @DisplayName("An unknown plan is refused rather than guessed at")
    void unknownPlanIsRejected() throws Exception {
        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"lifetime\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("UNKNOWN_PRICE"));
        verify(stripeGateway, never()).createCheckoutSession(any(), any(), anyLong(), any(), any());
    }

    @Test
    @Transactional
    @DisplayName("An existing subscriber is sent to the portal, not charged a second time")
    void alreadyProCannotCheckOutAgain() throws Exception {
        Subscription sub = rowFor("user");
        sub.setStatus("active");
        sub.setStripeCustomerId("cus_existing_1");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        subscriptionRepository.saveAndFlush(sub);

        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_SUBSCRIBED"));
        verify(stripeGateway, never()).createCheckoutSession(any(), any(), anyLong(), any(), any());
    }

    @Test
    @Transactional
    @DisplayName("The portal opens for a customer, and 404s for someone who never checked out")
    void portalRequiresACustomer() throws Exception {
        mockMvc.perform(post("/api/billing/portal")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NO_CUSTOMER"));

        Subscription sub = rowFor("user");
        sub.setStripeCustomerId("cus_portal_1");
        subscriptionRepository.saveAndFlush(sub);

        mockMvc
            .perform(post("/api/billing/portal"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.url").value("https://portal.stripe.test/session"));
    }

    @Test
    @Transactional
    @DisplayName("With no Stripe key, billing says so instead of failing — develop and CI run this way")
    void billingDisabledIsAServiceUnavailableNotACrash() throws Exception {
        when(stripeGateway.isEnabled()).thenReturn(false);

        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        mockMvc
            .perform(post("/api/billing/portal"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(jsonPath("$.code").value("BILLING_DISABLED"));
        // ...and /me still answers, so the UI can render "coming soon" rather than an error.
        mockMvc.perform(get("/api/billing/me")).andExpect(status().isOk()).andExpect(jsonPath("$.plan").value("FREE"));
    }

    // ---- the double-checkout guard (found during the 12.7 run) --------------------------

    /**
     * Our mirror says Free, Stripe says otherwise, and Stripe wins.
     *
     * <p>This is the real failure it prevents: the mirror is only as current as the last
     * webhook, so between paying and the webhook landing — or whenever a delivery is lost —
     * {@code isPro()} answers false and a second checkout sails through. That happened for real
     * during the 12.7 sandbox run: one customer, two active subscriptions, two invoices, two
     * charges. With a no-refunds policy, a double charge is a chargeback.
     */
    @Test
    @Transactional
    void aSecondCheckoutIsRefusedWhenStripeSaysTheyAreAlreadySubscribed() throws Exception {
        Subscription sub = rowFor("user");
        sub.setStripeCustomerId("cus_known_1");
        subscriptionRepository.saveAndFlush(sub); // plan FREE, status none — the stale mirror
        when(stripeGateway.hasLiveSubscription("cus_known_1")).thenReturn(true);

        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("ALREADY_SUBSCRIBED"));

        verify(stripeGateway, never()).createCheckoutSession(any(), any(), anyLong(), any(), any());
    }

    /** A first-time subscriber has no customer id, so the guard costs them nothing. */
    @Test
    @Transactional
    void aFirstCheckoutDoesNotAskStripeAnything() throws Exception {
        mockMvc
            .perform(post("/api/billing/checkout").contentType(MediaType.APPLICATION_JSON).content("{\"plan\":\"monthly\"}"))
            .andExpect(status().isOk());

        verify(stripeGateway, never()).hasLiveSubscription(any());
    }
}
