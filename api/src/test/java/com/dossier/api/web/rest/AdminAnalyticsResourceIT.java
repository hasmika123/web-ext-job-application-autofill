package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admin analytics overview (Phase 9.A3, revenue added in 12.5): ADMIN-gated, and the aggregate
 * queries (counts, distinct-user funnel, per-status, time-window) execute on a real MySQL
 * container.
 *
 * <p>The revenue tests pin the two things that are easy to get quietly wrong: that a 3-month
 * subscription is normalised to a third of its price, and that a lapsed row is not counted as
 * revenue just because it still says {@code PRO} in the plan column.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.stripe.price-monthly=price_m", "dossier.stripe.price3mo=price_q" })
class AdminAnalyticsResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    void clearSubscriptions() {
        subscriptionRepository.deleteAll();
    }

    /** One subscription row for `login`, saved. */
    private void seed(String login, String status, String priceId, Instant periodEnd) {
        User user = userRepository.findOneByLogin(login).orElseThrow();
        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setPlan(Subscription.PLAN_PRO);
        sub.setStatus(status);
        sub.setPriceId(priceId);
        sub.setCurrentPeriodEnd(periodEnd);
        subscriptionRepository.save(sub);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/analytics")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminGetsOverviewShape() throws Exception {
        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalUsers").isNumber())
            .andExpect(jsonPath("$.activatedUsers").isNumber())
            .andExpect(jsonPath("$.activationRatePct").isNumber())
            .andExpect(jsonPath("$.signups7d").isNumber())
            .andExpect(jsonPath("$.activeUsers7d").isNumber())
            .andExpect(jsonPath("$.totalResumes").isNumber())
            .andExpect(jsonPath("$.totalApplications").isNumber())
            .andExpect(jsonPath("$.funnel.signedUp").isNumber())
            .andExpect(jsonPath("$.funnel.applied").isNumber())
            .andExpect(jsonPath("$.applicationsByStatus.DRAFT").isNumber())
            .andExpect(jsonPath("$.applicationsByStatus.APPLIED").isNumber())
            .andExpect(jsonPath("$.billing.mrr").isNumber())
            .andExpect(jsonPath("$.billing.activePro").isNumber());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void noSubscriptionsIsZeroRevenueRatherThanAnError() throws Exception {
        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.billing.activePro").value(0))
            .andExpect(jsonPath("$.billing.mrr").value(0.00));
    }

    /** One of each plan: 19.99 + 44.99/3 = 19.99 + 14.9966… → 34.99 at 2dp. */
    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void mrrNormalisesTheThreeMonthPlan() throws Exception {
        Instant future = Instant.now().plus(20, ChronoUnit.DAYS);
        seed("user", "active", "price_m", future);
        seed("admin", "active", "price_q", future);

        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.billing.activePro").value(2))
            .andExpect(jsonPath("$.billing.monthlyCount").value(1))
            .andExpect(jsonPath("$.billing.threeMonthCount").value(1))
            .andExpect(jsonPath("$.billing.mrr").value(34.99))
            // Both rows were created by this test, so both are new this month.
            .andExpect(jsonPath("$.billing.newThisMonth").value(2))
            .andExpect(jsonPath("$.billing.churnedThisMonth").value(0));
    }

    /**
     * A row can say {@code PLAN_PRO} long after it stopped being Pro — the plan column is a label,
     * {@code EntitlementService} is the rule. Revenue must follow the rule, or the dashboard bills
     * us for users who are being served Free.
     */
    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void aLapsedSubscriptionIsNotRevenueAndCountsAsChurn() throws Exception {
        // Ended earlier today: past, but inside the current calendar month.
        seed("user", "canceled", "price_m", Instant.now().minus(1, ChronoUnit.HOURS));

        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.billing.activePro").value(0))
            .andExpect(jsonPath("$.billing.mrr").value(0.00))
            .andExpect(jsonPath("$.billing.churnedThisMonth").value(1));
    }

    /** past_due keeps Pro while Stripe retries, and is flagged so an admin can see the risk. */
    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void pastDueStillCountsAsRevenueAndIsFlagged() throws Exception {
        seed("user", "past_due", "price_m", Instant.now().plus(5, ChronoUnit.DAYS));

        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.billing.activePro").value(1))
            .andExpect(jsonPath("$.billing.mrr").value(19.99))
            .andExpect(jsonPath("$.billing.pastDue").value(1));
    }

    /** An unrecognised price still counts as a Pro user, but cannot be turned into revenue. */
    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void anUnknownPriceContributesNoRevenue() throws Exception {
        seed("user", "active", "price_from_a_previous_life", Instant.now().plus(20, ChronoUnit.DAYS));

        mockMvc
            .perform(get("/api/admin/analytics"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.billing.activePro").value(1))
            .andExpect(jsonPath("$.billing.monthlyCount").value(0))
            .andExpect(jsonPath("$.billing.threeMonthCount").value(0))
            .andExpect(jsonPath("$.billing.mrr").value(0.00));
    }
}
