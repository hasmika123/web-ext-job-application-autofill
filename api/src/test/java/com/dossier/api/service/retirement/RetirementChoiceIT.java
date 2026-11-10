package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.pricing.PricingEngine;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceResultDTO;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.RetirementMeDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.4 on MySQL (docs/subscriptions/11 section 6): every choice of the subscriber is one call over the retirement quote. An equal or lower price is scheduled for the date
 * (no charge today), a higher price takes effect now only when the subscriber asks for it and is prorated, a later choice replaces the earlier schedule, a cancel wins and keeps
 * the plan, a replay with the same key changes nothing twice, and a stale quote is refused.
 */
@IntegrationTest
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementChoiceIT {

    @Autowired private RetirementService retirements;
    @Autowired private RetirementChoiceService choices;
    @Autowired private RecordingStripeGateway stripe;
    @Autowired private PlanRetirementItemRepository itemRepo;
    @Autowired private JdbcTemplate jdbc;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;

    private SubFixtures.Plan plan;
    private Subscription sub;
    private String login;
    private RetirementDTO retirement;

    @BeforeEach
    void data() {
        stripe.reset();
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TT", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, "price_td_base_m");
        sub = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 20, false, true);
        login = sub.getUser().getLogin();
        RetirementFixtures.aiCall(jdbc, login, "ai.resume_tailoring");
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of(new SuccessorRequest("TS", null, 1, null), new SuccessorRequest("TD", null, 2, null))));
        retirement = retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
    }

    private static String key() {
        return UUID.randomUUID().toString();
    }

    private PlanRetirementItem item() {
        return itemRepo.findByRetirementIdAndSubscriptionId(retirement.id(), sub.getId()).orElseThrow();
    }

    private Long quoteFor(String planKey) {
        ChoiceResultDTO picked = choices.choose(login, key(), new ChoiceRequest("PICK", null, planKey, null, null));
        assertThat(picked.quote()).isNotNull();
        assertThat(picked.quote().kind()).isEqualTo("RETIREMENT_SWITCH");
        assertThat(picked.quote().plan().planKey()).isEqualTo(planKey);
        return picked.quote().quoteId();
    }

    /** JDBC after the service calls: flush the persistence context first, a plain JDBC read does not. */
    private JdbcTemplate db() {
        em.flush();
        return jdbc;
    }

    private Map<String, Object> subRow() {
        return db().queryForMap("select plan_version_id, price_id, billing_interval, cancel_at_period_end, status from subscription where id = ?", sub.getId());
    }

    @Test
    void thePageShowsTheDateWhatIsUsedTheClosestMatchWithARealQuoteAndWhatWouldLock() {
        RetirementMeDTO me = choices.me(login);
        assertThat(me.state()).isEqualTo("CHANGING");
        assertThat(me.retirementId()).isEqualTo(retirement.id());
        assertThat(me.planKey()).isEqualTo("TQ");
        assertThat(me.effectiveAt()).isEqualTo(item().getRetireEffectiveAt());
        assertThat(me.defaultOutcome()).isEqualTo("FREE");
        assertThat(me.currentRecurringMinor()).isEqualTo(1999);
        assertThat(me.suggestion().successorKey()).isEqualTo("TS");
        assertThat(me.suggestion().priceDirection()).isEqualTo("SAME");
        assertThat(me.suggestion().quoteId()).isNotNull();
        assertThat(me.used()).extracting(u -> u.featureKey()).contains("ai.resume_tailoring");
        assertThat(me.alternatives()).extracting(a -> a.successorKey()).contains("TD", "FREE").doesNotContain("TS");
        assertThat(me.lockPreview()).extracting(l -> l.featureKey()).contains("ai.resume_tailoring");
        assertThat(me.choice()).isNull();
        assertThat(me.fallback()).isNull();
    }

    @Test
    void switchingAtRenewalToAnEqualPriceSchedulesItWithNoChargeToday() {
        Long quote = choices.me(login).suggestion().quoteId();
        Map<String, Object> before = subRow();

        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));

        assertThat(r.scheduled()).isTrue();
        assertThat(r.itemStatus()).isEqualTo("SWITCH_SCHEDULED");
        assertThat(r.change().kind()).isEqualTo("RETIREMENT_SWITCH");
        assertThat(r.change().status()).isEqualTo("PENDING");
        assertThat(r.change().effectiveAt()).isEqualTo(item().getRetireEffectiveAt());
        assertThat(stripe.scheduleCalls).hasSize(1);
        assertThat(stripe.scheduleCalls.get(0).at()).isEqualTo(item().getRetireEffectiveAt());
        assertThat(stripe.scheduleCalls.get(0).phaseItems()).extracting(i -> i.priceId()).containsExactly(SubFixtures.BASE_MONTH);
        assertThat(stripe.scheduleCalls.get(0).key()).startsWith("ret-" + retirement.id() + "-" + sub.getId() + "-sched-");
        assertThat(stripe.itemCalls).as("nothing changes in Stripe today").isEmpty();
        assertThat(stripe.invoiceItemCalls).as("nothing is charged today").isEmpty();
        assertThat(subRow()).as("the subscription is untouched until the date").isEqualTo(before);
        assertThat(item().getStatus()).isEqualTo("SWITCH_SCHEDULED");
        assertThat(item().getStripeRef()).isEqualTo(stripe.scheduleCalls.get(0).id());
        assertThat(db().queryForObject("select status from subscription_quote where id = ?", String.class, quote)).isEqualTo("APPLIED");
        assertThat(choices.me(login).choice().kind()).isEqualTo("SWITCH_AT_RENEWAL");
    }

    @Test
    void switchingNowToAHigherPriceIsTheSubscribersConsentAndIsProrated() {
        Long quote = quoteFor("TD");
        Instant before = Instant.now();

        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_NOW", quote, null, null, null));

        assertThat(r.scheduled()).isFalse();
        assertThat(r.itemStatus()).isEqualTo("SWITCHED_NOW");
        assertThat(r.change().status()).isEqualTo("APPLIED");
        assertThat(stripe.itemCalls).hasSize(1);
        assertThat(stripe.itemCalls.get(0).items()).extracting(i -> i.priceId()).containsExactly("price_td_base_m");
        assertThat(stripe.invoiceItemCalls).hasSize(1);
        Instant end = sub.getCurrentPeriodEnd();
        long expected = PricingEngine.prorate(2000, 1, sub.getCurrentPeriodStart(), end, before);
        assertThat(stripe.invoiceItemCalls.get(0).amountMinor()).isBetween(expected - 5, expected + 5);
        assertThat(stripe.scheduleCalls).isEmpty();
        Map<String, Object> row = subRow();
        assertThat(row.get("price_id")).isEqualTo("price_td_base_m");
        assertThat(((Number) row.get("plan_version_id")).longValue()).isEqualTo(db().queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TD'", Long.class));
        assertThat(item().getAppliedAt()).isNotNull();
    }

    @Test
    void switchingNowToAnEqualPriceIsStillAppliedOnTheDateNotToday() {
        Long quote = choices.me(login).suggestion().quoteId();
        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_NOW", quote, null, null, null));
        assertThat(r.scheduled()).isTrue();
        assertThat(r.itemStatus()).isEqualTo("SWITCH_SCHEDULED");
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.scheduleCalls).hasSize(1);
    }

    @Test
    void aHigherPriceCanAlsoWaitForTheDateWhenTheSubscriberAsksForThat() {
        Long quote = quoteFor("TD");
        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        assertThat(r.scheduled()).isTrue();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.scheduleCalls.get(0).phaseItems()).extracting(i -> i.priceId()).containsExactly("price_td_base_m");
    }

    @Test
    void aLaterChoiceReleasesTheEarlierScheduleAndTheLastOneWins() {
        Long first = choices.me(login).suggestion().quoteId();
        choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", first, null, null, null));
        String firstSchedule = stripe.scheduleCalls.get(0).id();
        Long second = quoteFor("TT");

        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", second, null, null, null));

        assertThat(stripe.releaseCalls).hasSize(1);
        assertThat(stripe.releaseCalls.get(0).scheduleId()).isEqualTo(firstSchedule);
        assertThat(stripe.scheduleCalls).hasSize(2);
        assertThat(item().getStripeRef()).isEqualTo(stripe.scheduleCalls.get(1).id());
        assertThat(db().queryForList("select status from personal_subscription_change where subscription_id = ? and kind = 'RETIREMENT_SWITCH' order by id", String.class, sub.getId())).containsExactly("CANCELLED", "PENDING");
        assertThat(choices.me(login).choice().planKey()).isEqualTo("TT");
        assertThat(r.itemStatus()).isEqualTo("SWITCH_SCHEDULED");
    }

    @Test
    void cancelWinsKeepsThePlanToThePeriodEndAndCostsNothingMore() {
        Long quote = choices.me(login).suggestion().quoteId();
        choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));

        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("CANCEL", null, null, null, null));

        assertThat(r.cancelAtPeriodEnd()).isTrue();
        assertThat(r.itemStatus()).isEqualTo("CANCELLED");
        assertThat(stripe.releaseCalls).as("the scheduled switch is released").hasSize(1);
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(stripe.cancelCalls.get(0).cancel()).isTrue();
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.refundLikeCalls).isEmpty();
        assertThat(((Number) subRow().get("plan_version_id")).longValue()).as("they keep the plan to the period end").isEqualTo(plan.versionId());
        assertThat(item().getRetireEffectiveAt()).as("their own choice: the plan ends with the period they paid for").isEqualTo(sub.getCurrentPeriodEnd());
        assertThat(db().queryForObject("select count(*) from personal_subscription_change where subscription_id = ? and kind = 'RETIREMENT_CANCEL' and status = 'APPLIED'", Integer.class, sub.getId())).isEqualTo(1);

        // a cancel beats a switch (and a new quote is not even offered)
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("CANCEL_PENDING"));
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("PICK", null, "TT", null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("CANCEL_PENDING"));
    }

    @Test
    void aReplayWithTheSameKeyReturnsTheSameResultAndDoesNothingTwice() {
        Long quote = choices.me(login).suggestion().quoteId();
        String k = key();
        ChoiceResultDTO first = choices.choose(login, k, new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        ChoiceResultDTO again = choices.choose(login, k, new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        assertThat(again.change().id()).isEqualTo(first.change().id());
        assertThat(again.itemStatus()).isEqualTo(first.itemStatus());
        assertThat(stripe.scheduleCalls).hasSize(1);
        assertThat(stripe.releaseCalls).isEmpty();
        assertThat(db().queryForObject("select count(*) from personal_subscription_change where batch_id = ?", Integer.class, k)).isEqualTo(1);
    }

    @Test
    void aStaleQuoteIsRefusedWithTheNewOneAndNothingHappens() {
        Long quote = choices.me(login).suggestion().quoteId();
        jdbc.update("update product_price set amount_minor = 2099 where stripe_price_id = ?", SubFixtures.BASE_MONTH);
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("QUOTE_STALE");
            assertThat(e.getExtra()).containsKey("quoteId");
        });
        assertThat(stripe.scheduleCalls).isEmpty();
        assertThat(item().getStatus()).isEqualTo("PENDING");
    }

    @Test
    void anotherPersonsQuoteAndAnUnknownOneAre404() {
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", 987654321L, null, null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", null, null, null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("INVALID_CHOICE"));
    }

    @Test
    void laterChangesNothingAndTheRemindersContinue() {
        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("LATER", null, null, null, null));
        assertThat(r.itemStatus()).isEqualTo("PENDING");
        assertThat(item().getDecidedAt()).isNull();
        assertThat(stripe.scheduleCalls).isEmpty();
    }

    @Test
    void theRefusalsHaveTheirCodes() {
        assertThatThrownBy(() -> choices.choose(login, null, new ChoiceRequest("LATER", null, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_KEY_REQUIRED"));
        assertThatThrownBy(() -> choices.choose(login, "not-a-uuid", new ChoiceRequest("LATER", null, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("IDEMPOTENCY_KEY_REQUIRED"));
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("REFUND", null, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("INVALID_CHOICE"));
        assertThatThrownBy(() -> choices.choose("nobody-here", key(), new ChoiceRequest("LATER", null, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getStatus()).isEqualTo(401));
    }

    @Test
    void withBillingOffASwitchIs503AndNothingIsRecorded() {
        Long quote = choices.me(login).suggestion().quoteId();
        stripe.enabled = false;
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null)))
            .isInstanceOfSatisfying(BillingException.class, e -> assertThat(e.getCode()).isEqualTo("BILLING_DISABLED"));
        assertThat(item().getStatus()).isEqualTo("PENDING");
        assertThat(db().queryForObject("select count(*) from personal_subscription_change where subscription_id = ?", Integer.class, sub.getId())).isZero();
    }

    @Test
    void aSwitchToAPlanThatDoesNotOfferAHeldAddOnIsRefusedAndTheAddOnIsNeverDropped() {
        RetirementFixtures.addon(jdbc, sub, "ai.credits_extra", "FEAT_AI_CREDITS", SubFixtures.AI_MONTH, 1);
        jdbc.update("delete from plan_component where feature_key = 'ai.credits_extra' and plan_version_id = (select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TT')");
        Long quote = quoteFor("TT");
        assertThatThrownBy(() -> choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null))).isInstanceOfSatisfying(BillingException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("SUCCESSOR_NOT_AVAILABLE");
            assertThat(e.getExtra()).containsEntry("featureKey", "ai.credits_extra");
        });
        assertThat(stripe.scheduleCalls).isEmpty();
        // a plan that does offer it carries it at its held quantity and price
        Long ok = quoteFor("TS");
        ChoiceResultDTO r = choices.choose(login, key(), new ChoiceRequest("SWITCH_AT_RENEWAL", ok, null, null, null));
        assertThat(stripe.scheduleCalls.get(0).phaseItems()).extracting(i -> i.priceId() + "x" + i.quantity()).containsExactly(SubFixtures.BASE_MONTH + "x1", SubFixtures.AI_MONTH + "x1");
        assertThat(r.scheduled()).isTrue();
    }
}
