package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.BillingException;
import com.dossier.api.service.billing.personal.PersonalQuoteService;
import com.dossier.api.service.billing.personal.QuoteRequest;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CancelRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.ItemPage;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.UpdateRequest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.1 on MySQL (docs/subscriptions/11 sections 2 and 3): the retirement is an audited object, starting it changes nothing for any subscriber, dates only move
 * later, a plan with no subscribers retires at once, a RETIRING plan takes no new buyers (410 PLAN_RETIRING with the ranked successors) and cancelling is refused
 * once a subscriber has acted.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementServiceIT {

    @Autowired private RetirementService retirements;
    @Autowired private PersonalQuoteService quoteService;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;
    @Autowired private PlanRetirementItemRepository itemRepo;

    private SubFixtures.Plan plan;

    @BeforeEach
    void data() {
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    private CreateRequest planRequest(String key) {
        return new CreateRequest("PLAN", key, null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of());
    }

    private RetirementDTO createAndStart(String key) {
        RetirementDTO r = retirements.create(planRequest(key));
        return retirements.start(r.id(), new StartRequest(RetirementFixtures.REASON, key));
    }

    private Subscription sub(String interval, String status, long endDays, boolean cancel) {
        return RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), interval, status, endDays, cancel, false);
    }

    private String planStatus(String key) {
        return jdbc.queryForObject("select status from plan where plan_key = ?", String.class, key);
    }

    private String versionStatus() {
        return jdbc.queryForObject("select status from plan_version where id = ?", String.class, plan.versionId());
    }

    @Test
    void aDraftCarriesTheSafeDefaultsOfTheSettingsAndChangesNothing() {
        RetirementDTO r = retirements.create(planRequest("tq"));
        assertThat(r.status()).isEqualTo("DRAFT");
        assertThat(r.kind()).isEqualTo("PLAN");
        assertThat(r.planKey()).isEqualTo("TQ");
        assertThat(r.mode()).isEqualTo("RETIRE_AT_RENEWAL");
        assertThat(r.defaultOutcome()).isEqualTo("FREE");
        assertThat(r.noticeScheduleDays()).containsExactly(60, 30, 7, 1);
        assertThat(r.minNoticeDays()).isEqualTo(30);
        assertThat(r.channels()).containsExactly("EMAIL", "IN_APP");
        assertThat(planStatus("TQ")).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'PLAN_RETIREMENT_CREATED' and target_id like ?", Integer.class, "retirement:" + r.id() + "%")).isEqualTo(1);
    }

    @Test
    void theRefusalsCarryTheirCode() {
        assertThatThrownBy(() -> retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, "too short", List.of())))
            .isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("REASON_REQUIRED"));
        assertThatThrownBy(() -> retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, 29, null, null, RetirementFixtures.REASON, List.of())))
            .isInstanceOfSatisfying(CatalogException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getCode()).isEqualTo("MIN_NOTICE_TOO_SHORT");
            });
        assertThatThrownBy(() -> retirements.create(planRequest("FREE"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("FREE_PLAN_PROTECTED"));
        assertThatThrownBy(() -> retirements.create(new CreateRequest("PRICE", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of())))
            .isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("KIND_NOT_SUPPORTED"));
        assertThatThrownBy(() -> retirements.create(planRequest("NOPE"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
        assertThatThrownBy(() -> retirements.create(planRequest("ORG_STANDARD"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isIn("AUDIENCE_NOT_SUPPORTED", "PLAN_STATE"));
        retirements.create(planRequest("TQ"));
        assertThatThrownBy(() -> retirements.create(planRequest("TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("RETIREMENT_EXISTS"));
    }

    @Test
    void startNeedsTheTypedKeyAndAReason() {
        RetirementDTO r = retirements.create(planRequest("TQ"));
        assertThatThrownBy(() -> retirements.start(r.id(), new StartRequest(RetirementFixtures.REASON, "PRO")))
            .isInstanceOfSatisfying(CatalogException.class, e -> {
                assertThat(e.getStatus()).isEqualTo(412);
                assertThat(e.getCode()).isEqualTo("CONFIRM_MISMATCH");
            });
        assertThatThrownBy(() -> retirements.start(r.id(), new StartRequest("short", "TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("REASON_REQUIRED"));
        assertThat(planStatus("TQ")).isEqualTo("PUBLISHED");
    }

    @Test
    void aMinimumNoticeBelowTheHardMinimumIsRefusedOnEditToo() {
        RetirementDTO r = retirements.create(planRequest("TQ"));
        assertThatThrownBy(() -> retirements.update(r.id(), new UpdateRequest(null, null, null, 12, null, null, RetirementFixtures.REASON)))
            .isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("MIN_NOTICE_TOO_SHORT"));
        RetirementDTO edited = retirements.update(r.id(), new UpdateRequest(null, null, List.of(45, 14, 3), 45, List.of("EMAIL"), "A note for everyone", RetirementFixtures.REASON));
        assertThat(edited.noticeScheduleDays()).containsExactly(45, 14, 3);
        assertThat(edited.minNoticeDays()).isEqualTo(45);
        assertThat(edited.channels()).containsExactly("EMAIL");
        assertThat(edited.messageMd()).isEqualTo("A note for everyone");
    }

    @Test
    void startingOnAPlanWithNoSubscribersRetiresItAtOnceWithNoNotices() {
        RetirementDTO r = createAndStart("TQ");
        assertThat(r.status()).isEqualTo("COMPLETED");
        assertThat(r.completedAt()).isNotNull();
        assertThat(planStatus("TQ")).isEqualTo("RETIRED");
        assertThat(versionStatus()).isEqualTo("RETIRED");
        assertThat(itemRepo.countByRetirementId(r.id())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from billing_notice", Integer.class)).isZero();
    }

    @Test
    void startingChangesNothingForAnySubscriberAndGivesEachTheirOwnDate() {
        Subscription monthly = sub("MONTH", "active", 10, false);
        Subscription quarterly = sub("QUARTER", "active", 80, false);
        Subscription yearly = sub("YEAR", "active", 200, false);
        Subscription ending = sub("MONTH", "active", 5, true);
        Subscription lapsed = sub("MONTH", "canceled", -3, false);
        Map<Long, Map<String, Object>> before = new java.util.LinkedHashMap<>();
        for (Subscription s : List.of(monthly, quarterly, yearly, ending, lapsed)) before.put(s.getId(), row(s.getId()));

        RetirementDTO r = createAndStart("TQ");

        assertThat(r.status()).isEqualTo("NOTICING");
        assertThat(planStatus("TQ")).isEqualTo("RETIRING");
        assertThat(versionStatus()).isEqualTo("RETIRING");
        assertThat(r.impact().subscribers()).as("the lapsed one is not counted").isEqualTo(4);
        assertThat(r.impact().byInterval()).containsEntry("MONTH", 2).containsEntry("QUARTER", 1).containsEntry("YEAR", 1);
        assertThat(r.impact().mrrMinor()).as("monthly 1999 + quarterly 4999/3 + yearly (priced at 1999 here) 1999/12 + the ending monthly one").isEqualTo(1999 + 1666 + 167 + 1999L);
        assertThat(r.itemCounts()).containsEntry("PENDING", 3L).containsEntry("CANCELLED", 1L).containsEntry("EXCLUDED", 1L);
        for (Subscription s : before.keySet().stream().map(id -> subscriptions.findById(id).orElseThrow()).toList()) {
            assertThat(row(s.getId())).as("subscription %s is byte-identical", s.getId()).isEqualTo(before.get(s.getId()));
        }

        ItemPage items = retirements.items(r.id(), null, null, 0, 50);
        assertThat(items.total()).isEqualTo(5);
        var byId = items.items().stream().collect(java.util.stream.Collectors.toMap(i -> i.subscriptionId(), i -> i));
        // monthly with 10 days left and 30 days notice: one more renewal on the old plan
        assertThat(byId.get(monthly.getId()).retireEffectiveAt()).isEqualTo(monthly.getCurrentPeriodEnd().atZone(ZoneOffset.UTC).plusMonths(1).toInstant());
        // quarterly with 80 days left: the period end
        assertThat(byId.get(quarterly.getId()).retireEffectiveAt()).isEqualTo(quarterly.getCurrentPeriodEnd());
        // yearly: the next renewal, never mid-term
        assertThat(byId.get(yearly.getId()).retireEffectiveAt()).isEqualTo(yearly.getCurrentPeriodEnd());
        // cancel-pending: their period end, however short
        assertThat(byId.get(ending.getId()).retireEffectiveAt()).isEqualTo(ending.getCurrentPeriodEnd());
        assertThat(byId.get(ending.getId()).status()).isEqualTo("CANCELLED");
        assertThat(byId.get(lapsed.getId()).status()).isEqualTo("EXCLUDED");
        assertThat(retirements.items(r.id(), "PENDING", "MONTH", 0, 50).total()).isEqualTo(1);
    }

    private Map<String, Object> row(Long subscriptionId) {
        return jdbc.queryForMap("select plan, status, price_id, plan_version_id, billing_interval, current_period_end, cancel_at_period_end from subscription where id = ?", subscriptionId);
    }

    @Test
    void aRetiringPlanTakesNoNewBuyersAndTheAnswerNamesTheRankedSuccessors() {
        RetirementFixtures.successorPlan(jdbc, 1999);
        sub("MONTH", "active", 20, false);
        RetirementDTO draft = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of(new SuccessorRequest("TS", null, 1, "the same thing, renamed"))));
        assertThat(draft.successors()).singleElement().satisfies(s -> {
            assertThat(s.planKey()).isEqualTo("TS");
            assertThat(s.rank()).isEqualTo(1);
        });
        retirements.start(draft.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));

        assertThatThrownBy(() -> quoteService.create(new QuoteRequest("CHECKOUT", "TQ", "MONTH", List.of(), null, false, List.of()), "user")).isInstanceOfSatisfying(BillingException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(410);
            assertThat(e.getCode()).isEqualTo("PLAN_RETIRING");
            assertThat(e.getExtra()).containsEntry("successors", List.of("TS"));
        });
    }

    @Test
    void cancellingBeforeAnySubscriberActedRestoresTheSaleAndClosesTheItems() {
        sub("MONTH", "active", 20, false);
        RetirementDTO r = createAndStart("TQ");
        assertThat(planStatus("TQ")).isEqualTo("RETIRING");
        assertThatThrownBy(() -> retirements.cancel(r.id(), new CancelRequest(RetirementFixtures.REASON, "PRO"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getStatus()).isEqualTo(412));

        RetirementDTO cancelled = retirements.cancel(r.id(), new CancelRequest(RetirementFixtures.REASON, "TQ"));

        assertThat(cancelled.status()).isEqualTo("CANCELLED");
        assertThat(planStatus("TQ")).isEqualTo("PUBLISHED");
        assertThat(versionStatus()).isEqualTo("PUBLISHED");
        assertThat(retirements.items(r.id(), "EXCLUDED", null, 0, 10).total()).isEqualTo(1);
        // it sells again
        assertThat(quoteService.create(new QuoteRequest("CHECKOUT", "TQ", "MONTH", List.of(), null, false, List.of()), "user").proposed().recurringMinor()).isEqualTo(1999);
    }

    @Test
    void cancellingAfterASubscriberSwitchedIsRefusedAndTheSwitchStays() {
        sub("MONTH", "active", 20, false);
        Subscription switched = sub("MONTH", "active", 25, false);
        RetirementDTO r = createAndStart("TQ");
        var acted = itemRepo.findByRetirementIdAndSubscriptionId(r.id(), switched.getId()).orElseThrow();
        acted.setStatus("SWITCH_SCHEDULED"); // through the entity: a JDBC update would leave the managed copy of this transaction stale
        acted.setDecidedAt(Instant.now());
        itemRepo.saveAndFlush(acted);

        assertThatThrownBy(() -> retirements.cancel(r.id(), new CancelRequest(RetirementFixtures.REASON, "TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(409);
            assertThat(e.getCode()).isEqualTo("RETIREMENT_IN_PROGRESS");
        });
        assertThat(planStatus("TQ")).isEqualTo("RETIRING");
        assertThat(jdbc.queryForObject("select status from plan_retirement_item where retirement_id = ? and subscription_id = ?", String.class, r.id(), switched.getId())).isEqualTo("SWITCH_SCHEDULED");
    }

    @Test
    void completingNeedsEveryoneHandledAndTheDraftCannotStartTwice() {
        sub("MONTH", "active", 20, false);
        RetirementDTO r = createAndStart("TQ");
        assertThatThrownBy(() -> retirements.complete(r.id(), new com.dossier.api.service.retirement.dto.RetirementDTOs.CompleteRequest(RetirementFixtures.REASON)))
            .isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("ITEMS_PENDING"));
        assertThatThrownBy(() -> retirements.start(r.id(), new StartRequest(RetirementFixtures.REASON, "TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("NOT_DRAFT"));
    }

    @Test
    void keepingAPlanIndefinitelyOnlyHidesItFromNewBuyers() {
        Subscription s = sub("MONTH", "active", 20, false);
        Map<String, Object> before = row(s.getId());
        RetirementDTO r = retirements.create(new CreateRequest("PLAN", "TQ", null, null, "KEEP_INDEFINITELY", null, null, null, null, null, RetirementFixtures.REASON, List.of()));
        RetirementDTO started = retirements.start(r.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        assertThat(started.status()).isEqualTo("COMPLETED");
        assertThat(itemRepo.countByRetirementId(r.id())).isZero();
        assertThat(planStatus("TQ")).isEqualTo("RETIRING");
        assertThat(row(s.getId())).isEqualTo(before);
        RetirementDTO reopened = retirements.cancel(r.id(), new CancelRequest(RetirementFixtures.REASON, "TQ"));
        assertThat(reopened.status()).isEqualTo("CANCELLED");
        assertThat(planStatus("TQ")).isEqualTo("PUBLISHED");
    }

    @Test
    void anAddOnRetirementWithNoHoldersRetiresTheServiceAndTheQuoteRefusesIt() {
        RetirementDTO r = retirements.create(new CreateRequest("ADDON", null, null, "ai.credits_extra", null, null, null, null, null, null, RetirementFixtures.REASON, List.of()));
        RetirementDTO started = retirements.start(r.id(), new StartRequest(RetirementFixtures.REASON, "ai.credits_extra"));
        assertThat(started.status()).isEqualTo("COMPLETED");
        assertThat(jdbc.queryForObject("select lifecycle from feature_definition where feature_key = 'ai.credits_extra'", String.class)).isEqualTo("RETIRED");
        assertThatThrownBy(
            () -> quoteService.create(new QuoteRequest("CHECKOUT", "TQ", "MONTH", List.of(new QuoteRequest.AddonRequest("ai.credits_extra", 1)), null, false, List.of()), "user")
        ).isInstanceOfSatisfying(BillingException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(410);
            assertThat(e.getCode()).isEqualTo("PLAN_RETIRING");
            assertThat(e.getExtra()).containsEntry("featureKey", "ai.credits_extra");
        });
    }

    @Test
    void theImpactOfADraftIsPreviewedWithoutWritingAnything() {
        sub("MONTH", "active", 10, false);
        sub("QUARTER", "active", 80, false);
        RetirementDTO r = retirements.create(planRequest("TQ"));
        var impact = retirements.impact(r.id());
        assertThat(impact.subscribers()).isEqualTo(2);
        assertThat(impact.mrrMinor()).isEqualTo(1999 + 1666);
        assertThat(impact.earliestEffectiveAt()).isBefore(Instant.now().plusSeconds(200L * 86400));
        assertThat(itemRepo.countByRetirementId(r.id())).isZero();
        assertThat(planStatus("TQ")).isEqualTo("PUBLISHED");
    }
}
