package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirement;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.sub.PlanRetirementItemRepository;
import com.dossier.api.repository.sub.PlanRetirementRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.SuccessorAdvisor.Evaluation;
import com.dossier.api.service.retirement.dto.CoverageDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.2 on MySQL (docs/subscriptions/11 section 5): the closest match is computed from what the subscriber uses, priced exactly, ranked by fewest gaps, then smallest
 * increase, then the admin's rank; Free is evaluated but is never the suggestion; the RETIREMENT_SWITCH quote is real, reused while nothing moved and re-created
 * (the old one SUPERSEDED) when it did; the coverage preview counts who would pay more.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class SuccessorAdvisorIT {

    @Autowired private RetirementService retirements;
    @Autowired private SuccessorAdvisor advisor;
    @Autowired private RetirementSuggestionService suggestions;
    @Autowired private RetirementCoverageService coverage;
    @Autowired private PlanRetirementRepository retirementRepo;
    @Autowired private PlanRetirementItemRepository itemRepo;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private UserRepository users;
    @Autowired private SubscriptionRepository subscriptions;

    private SubFixtures.Plan plan;

    @BeforeEach
    void data() {
        plan = SubFixtures.publishedPlan(jdbc);
        SubFixtures.standardPrices(jdbc);
    }

    private Subscription heavyUser() {
        Subscription s = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 20, false, false);
        RetirementFixtures.aiCall(jdbc, s.getUser().getLogin(), "ai.resume_tailoring");
        RetirementFixtures.aiCall(jdbc, s.getUser().getLogin(), "inbox.monitoring");
        RetirementFixtures.resumes(jdbc, s.getUser().getId(), 5);
        return s;
    }

    private RetirementDTO draft(SuccessorRequest... successors) {
        return retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, null, null, null, null, null, RetirementFixtures.REASON, List.of(successors)));
    }

    private Evaluation evaluate(RetirementDTO r, Subscription s) {
        PlanRetirement entity = retirementRepo.findById(r.id()).orElseThrow();
        return advisor.evaluate(entity, s, Instant.now());
    }

    @Test
    void theSuccessorWithNoGapsAndNoIncreaseBeatsTheDearerOneAndFree() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, "price_td_base_m");
        Subscription s = heavyUser();
        RetirementDTO r = draft(new SuccessorRequest("TD", null, 1, "more"), new SuccessorRequest("TS", null, 2, "same"));

        Evaluation ev = evaluate(r, s);

        assertThat(ev.ranked()).extracting(x -> x.suggestion().successorKey()).containsExactly("TS", "TD", "FREE");
        var best = ev.best().suggestion();
        assertThat(best.successorKey()).isEqualTo("TS");
        assertThat(best.gaps()).isEmpty();
        assertThat(best.deltaMinor()).isZero();
        assertThat(best.priceDirection()).isEqualTo("SAME");
        assertThat(best.currentMinor()).isEqualTo(1999);
        assertThat(best.proposedMinor()).isEqualTo(1999);
        assertThat(best.covered()).contains("ai.resume_tailoring", "inbox.monitoring", "resume.library");
        var dear = ev.ranked().get(1).suggestion();
        assertThat(dear.deltaMinor()).isEqualTo(2000);
        assertThat(dear.priceDirection()).isEqualTo("HIGHER");
        var free = ev.ranked().get(2).suggestion();
        assertThat(free.gaps()).contains("ai.resume_tailoring", "inbox.monitoring", "limit:resumes.max");
        assertThat(free.proposedMinor()).isZero();
        assertThat(free.deltaMinor()).isEqualTo(-1999);
        assertThat(ev.used()).extracting(u -> u.featureKey()).contains("ai.resume_tailoring", "inbox.monitoring", "resume.library");
        assertThat(ev.lockPreview()).extracting(l -> l.featureKey()).contains("ai.resume_tailoring", "inbox.monitoring");
        assertThat(best.monthlyEquivalentMinor()).isEqualTo(1999);
    }

    @Test
    void aTieOnGapsAndPriceGoesToTheAdminRank() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TT", "PRO");
        Subscription s = heavyUser();
        RetirementDTO r = draft(new SuccessorRequest("TS", null, 2, null), new SuccessorRequest("TT", null, 1, null));
        assertThat(evaluate(r, s).best().suggestion().successorKey()).isEqualTo("TT");
    }

    @Test
    void fewestGapsComesBeforeTheSmallestIncrease() {
        long cheapVersion = RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, "price_td_base_m");
        jdbc.update("delete from plan_component where plan_version_id = ? and feature_key = 'inbox.monitoring'", cheapVersion);
        Subscription s = heavyUser();
        RetirementDTO r = draft(new SuccessorRequest("TS", null, 1, null), new SuccessorRequest("TD", null, 2, null));
        Evaluation ev = evaluate(r, s);
        assertThat(ev.best().suggestion().successorKey()).as("the dearer plan has no gaps, the cheaper one lacks inbox monitoring").isEqualTo("TD");
        var cheap = ev.ranked().stream().filter(x -> x.suggestion().successorKey().equals("TS")).findFirst().orElseThrow().suggestion();
        assertThat(cheap.gaps()).contains("inbox.monitoring");
    }

    @Test
    void aSuccessorThatDoesNotSellTheSubscribersIntervalIsSkippedNotGuessed() {
        long v = RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        jdbc.update("update plan_version set intervals_json = '[\"MONTH\"]' where id = ?", v);
        Subscription quarterly = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "QUARTER", "active", 20, false, false);
        RetirementDTO r = draft(new SuccessorRequest("TS", null, 1, null));
        jdbc.update("update product_price set active = false where stripe_price_id = ?", SubFixtures.BASE_QUARTER);
        Evaluation ev = evaluate(r, quarterly);
        assertThat(ev.best()).isNull();
        assertThat(ev.ranked()).extracting(x -> x.suggestion().successorKey()).containsExactly("FREE");
    }

    @Test
    void theQuoteIsRealReusedWhileNothingMovedAndRecreatedWhenThePriceMoved() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        Subscription s = heavyUser();
        RetirementDTO d = draft(new SuccessorRequest("TS", null, 1, null));
        retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        PlanRetirement r = retirementRepo.findById(d.id()).orElseThrow();
        PlanRetirementItem item = itemRepo.findByRetirementIdAndSubscriptionId(d.id(), s.getId()).orElseThrow();

        suggestions.refresh(r, item, Instant.now());
        Long first = item.getSuggestedQuoteId();
        assertThat(first).isNotNull();
        assertThat(item.getSuggestionJson()).contains("\"successorKey\":\"TS\"").contains("\"quoteId\":" + first);
        assertThat(jdbc.queryForMap("select kind, status, plan_version_id, proposed_recurring_minor, current_recurring_minor, delta_minor from subscription_quote where id = ?", first))
            .containsEntry("kind", "RETIREMENT")
            .containsEntry("status", "OPEN")
            .containsEntry("proposed_recurring_minor", 1999L)
            .containsEntry("current_recurring_minor", 1999L)
            .containsEntry("delta_minor", 0L);
        assertThat(jdbc.queryForObject("select expires_at > ? from subscription_quote where id = ?", Boolean.class, java.sql.Timestamp.from(item.getRetireEffectiveAt()), first)).isTrue();

        suggestions.refresh(r, item, Instant.now());
        assertThat(item.getSuggestedQuoteId()).as("nothing moved: the same quote").isEqualTo(first);

        jdbc.update("update product_price set amount_minor = 2099 where stripe_price_id = ?", SubFixtures.BASE_MONTH);
        suggestions.refresh(r, item, Instant.now());
        assertThat(item.getSuggestedQuoteId()).isNotEqualTo(first);
        assertThat(jdbc.queryForObject("select status from subscription_quote where id = ?", String.class, first)).isEqualTo("SUPERSEDED");
        assertThat(jdbc.queryForObject("select proposed_recurring_minor from subscription_quote where id = ?", Long.class, item.getSuggestedQuoteId())).isEqualTo(2099L);
    }

    @Test
    void theNightlyPassRefreshesEveryUndecidedItemAndIsIdempotent() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        heavyUser();
        heavyUser();
        RetirementDTO d = draft(new SuccessorRequest("TS", null, 1, null));
        retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        assertThat(itemRepo.findPending(d.id())).allSatisfy(i -> assertThat(i.getSuggestionJson()).isNull());
        assertThat(suggestions.recomputeOpen(Instant.now())).isEqualTo(2);
        List<Long> quoteIds = itemRepo.findPending(d.id()).stream().map(PlanRetirementItem::getSuggestedQuoteId).toList();
        assertThat(quoteIds).doesNotContainNull().doesNotHaveDuplicates();
        assertThat(suggestions.recomputeOpen(Instant.now())).isEqualTo(2);
        assertThat(itemRepo.findPending(d.id()).stream().map(PlanRetirementItem::getSuggestedQuoteId).toList()).containsExactlyElementsOf(quoteIds);
    }

    @Test
    void theCoverageCountsWhoIsCoveredWhoHasGapsAndWhoWouldPayMore() {
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, "price_td_base_m");
        heavyUser();
        heavyUser();
        heavyUser();
        RetirementDTO d = draft(new SuccessorRequest("TD", null, 1, null));

        CoverageDTO c = coverage.coverage(d.id());

        assertThat(c.subscribers()).isEqualTo(3);
        assertThat(c.fullyCovered()).isEqualTo(3);
        assertThat(c.withGaps()).isZero();
        assertThat(c.wouldPayMore()).isEqualTo(3);
        assertThat(c.bySuccessor()).singleElement().satisfies(s -> {
            assertThat(s.planKey()).isEqualTo("TD");
            assertThat(s.wouldPayMore()).isEqualTo(3);
            assertThat(s.fullyCovered()).isEqualTo(3);
        });
        assertThat(c.migrateAllowed()).as("a dearer only successor never allows migrating at renewal").isFalse();
    }

    @Test
    void migratingIsAllowedWhenNobodyWouldPayMore() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        heavyUser();
        RetirementDTO d = draft(new SuccessorRequest("TS", null, 1, null));
        CoverageDTO c = coverage.coverage(d.id());
        assertThat(c.wouldPayMore()).isZero();
        assertThat(c.migrateAllowed()).isTrue();
        assertThat(c.gapFeatures()).isEmpty();
    }
}
