package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
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
class BillingResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserRepository userRepository;

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
            // No STRIPE_SECRET_KEY in the test config — clients render "coming soon", not an error.
            .andExpect(jsonPath("$.billingEnabled").value(false));
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
}
