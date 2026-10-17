package com.dossier.api.service.billing.personal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.BillingException;
import com.dossier.api.web.filter.QuoteRateLimiter;
import com.jayway.jsonpath.JsonPath;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithAnonymousUser;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/** K3.3: the personal QuoteService over HTTP (docs/subscriptions/09-apis.md section 3.1). Prices come from the in-memory catalog double over real tables. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "user")
@Import({ SubFixtures.CatalogPortConfig.class, SubFixtures.FakeGatewayConfig.class })
class PersonalQuoteIT {

    @Autowired private MockMvc mockMvc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private PersonalQuoteService quoteService;
    @Autowired private QuoteRateLimiter rateLimiter;

    @BeforeEach
    void data() {
        rateLimiter.resetAll();
        SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    private ResultActions quote(String json) throws Exception {
        return mockMvc.perform(post("/api/billing/quotes").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private static String checkoutBody(String interval, String addons) {
        return "{\"kind\":\"CHECKOUT\",\"planKey\":\"TQ\",\"interval\":\"" + interval + "\",\"addons\":" + addons + "}";
    }

    @Test
    @WithAnonymousUser
    void anAnonymousQuotePricesTheBasketForThePricingPageAndIsNeverReadableLater() throws Exception {
        String body = quote("{\"anonymous\":true,\"planKey\":\"TQ\",\"interval\":\"MONTH\",\"addons\":[{\"featureKey\":\"ai.credits_extra\",\"quantity\":2}]}")
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kind").value("ANONYMOUS"))
            .andExpect(jsonPath("$.status").value("OPEN"))
            .andExpect(jsonPath("$.proposed.recurringMinor").value(1999 + 2 * 499))
            .andExpect(jsonPath("$.proposed.lines.length()").value(2))
            .andExpect(jsonPath("$.taxSource").value("NONE"))
            .andExpect(jsonPath("$.taxEstimateMinor").doesNotExist())
            .andReturn()
            .getResponse()
            .getContentAsString();
        Number id = JsonPath.read(body, "$.quoteId");
        em.flush();
        assertThat(jdbc.queryForObject("select user_id from subscription_quote where id = ?", Long.class, id.longValue())).isNull();
        assertThat(jdbc.queryForObject("select kind from subscription_quote where id = ?", String.class, id.longValue())).isEqualTo("ANONYMOUS");
    }

    @Test
    @WithAnonymousUser
    void everyOtherKindNeedsASignedInAccount() throws Exception {
        quote(checkoutBody("MONTH", "[]")).andExpect(status().isUnauthorized());
    }

    @Test
    void aCheckoutQuoteIsStoredAndReadableByItsOwnerWithTheServerSideNumbers() throws Exception {
        String body = quote(checkoutBody("QUARTER", "[]"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.kind").value("CHECKOUT"))
            .andExpect(jsonPath("$.plan.planKey").value("TQ"))
            .andExpect(jsonPath("$.interval").value("QUARTER"))
            .andExpect(jsonPath("$.proposed.recurringMinor").value(4999))
            .andExpect(jsonPath("$.proposed.monthlyEquivalentMinor").value(1666))
            .andExpect(jsonPath("$.proposed.savingsMinor").value(998)) // 3 x 1999 - 4999
            .andExpect(jsonPath("$.deltaMinor").value(4999))
            .andExpect(jsonPath("$.effectiveAt").value("now"))
            .andExpect(jsonPath("$.inputsHash").isNotEmpty())
            .andReturn()
            .getResponse()
            .getContentAsString();
        long id = ((Number) JsonPath.read(body, "$.quoteId")).longValue();
        String hash = JsonPath.read(body, "$.inputsHash");
        mockMvc.perform(get("/api/billing/quotes/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.inputsHash").value(hash)).andExpect(jsonPath("$.status").value("OPEN"));
    }

    @Test
    void theRefusalsCarryTheirCodeAndDetails() throws Exception {
        quote("{\"kind\":\"CHECKOUT\",\"planKey\":\"PRO\",\"interval\":\"MONTH\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PLAN_NOT_SELLABLE"));
        quote(checkoutBody("MONTH", "[{\"featureKey\":\"inbox.monitoring\",\"quantity\":1}]"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ADDON_NOT_IN_PLAN"))
            .andExpect(jsonPath("$.featureKey").value("inbox.monitoring"));
        quote(checkoutBody("MONTH", "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":5}]"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("QUANTITY_LIMIT"))
            .andExpect(jsonPath("$.max").value(4));
        quote(checkoutBody("YEAR", "[]")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INTERVAL_NOT_AVAILABLE"));
        quote("{\"kind\":\"CHECKOUT\",\"planKey\":\"TQ\",\"interval\":\"MONTH\",\"promoCode\":\"SAVE10\"}").andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PROMO_INVALID"));
        quote("{\"kind\":\"REFUND\"}").andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_KIND"));
    }

    @Test
    void aPriceThatIsMissingForTheIntervalIsRefusedNotGuessed() throws Exception {
        jdbc.update("update product_price set active = false where stripe_price_id = ?", SubFixtures.PACK_MONTH);
        quote(checkoutBody("MONTH", "[{\"featureKey\":\"resume.extra_pack\",\"quantity\":1}]")).andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("PRICE_MISSING"));
    }

    @Test
    void aLiveSubscriberCannotCheckOutAgain() throws Exception {
        User user = users.findOneByLogin("user").orElseThrow();
        Subscription sub = subscriptions.findOneByUserId(user.getId()).orElseGet(Subscription::new);
        sub.setUser(user);
        sub.setStatus("active");
        sub.setCurrentPeriodEnd(Instant.now().plus(20, ChronoUnit.DAYS));
        subscriptions.saveAndFlush(sub);
        quote(checkoutBody("MONTH", "[]")).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ALREADY_SUBSCRIBED"));
    }

    @Test
    void aQuotePastItsTimeIsGoneAndAnotherPersonsQuoteIsNotFound() throws Exception {
        String body = quote(checkoutBody("MONTH", "[]")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(body, "$.quoteId")).longValue();
        em.flush();
        jdbc.update("update subscription_quote set user_id = (select min(id) from jhi_user where login <> 'user') where id = ?", id);
        em.clear();
        mockMvc.perform(get("/api/billing/quotes/" + id)).andExpect(status().isNotFound());
        jdbc.update("update subscription_quote set user_id = (select id from jhi_user where login = 'user'), expires_at = ? where id = ?", java.sql.Timestamp.from(Instant.now().minusSeconds(60)), id);
        em.clear();
        mockMvc.perform(get("/api/billing/quotes/" + id)).andExpect(status().isGone()).andExpect(jsonPath("$.code").value("QUOTE_EXPIRED"));
    }

    @Test
    void aQuoteWhosePricesMovedIsStaleAndTheReasonSaysWhy() throws Exception {
        String body = quote(checkoutBody("MONTH", "[{\"featureKey\":\"ai.credits_extra\",\"quantity\":1}]")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(body, "$.quoteId")).longValue();
        quoteService.requireFresh(quoteService.owned(id, "user")); // unchanged: fresh
        jdbc.update("update product_price set amount_minor = 599 where stripe_price_id = ?", SubFixtures.AI_MONTH);
        assertThatThrownBy(() -> quoteService.requireFresh(quoteService.owned(id, "user")))
            .isInstanceOfSatisfying(BillingException.class, e -> {
                assertThat(e.getCode()).isEqualTo("QUOTE_STALE");
                assertThat(e.getStatus()).isEqualTo(409);
                assertThat(e.getExtra()).containsEntry("reason", "PRICE_CHANGED");
            });
    }

    @Test
    @WithAnonymousUser
    void thirtyQuotesAMinutePerAddressThenTooManyRequests() throws Exception {
        String body = "{\"anonymous\":true,\"planKey\":\"TQ\",\"interval\":\"MONTH\"}";
        for (int i = 0; i < 30; i++) quote(body).andExpect(status().isOk());
        quote(body).andExpect(status().isTooManyRequests());
    }
}
