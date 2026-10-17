package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.catalog.CatalogException;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.4 / K10.11 {@code NoSilentRepriceTest} (docs/subscriptions/11 principle 2 and section 7): nobody is moved to a higher price without their say-so. MIGRATE_AT_RENEWAL is
 * refused when any subscriber would pay more; the default (Free) and every system path create no charge; a price that rose after the schedule is never scheduled. The only
 * way to a higher price is the subscriber's own SWITCH_NOW or SWITCH_AT_RENEWAL on a quote that shows it (RetirementChoiceIT).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class NoSilentRepriceTest extends RetirementItSupport {

    private RetirementDTO migrateDraft(String... successors) {
        List<SuccessorRequest> succ = new java.util.ArrayList<>();
        int rank = 1;
        for (String k : successors) succ.add(new SuccessorRequest(k, null, rank++, null));
        return retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, "MIGRATE_AT_RENEWAL", null, null, null, null, RetirementFixtures.REASON, succ));
    }

    @Test
    void migratingIsRefusedWhenAnySubscriberWouldPayMoreAndNothingChanges() {
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 3999, "price_td_base_m");
        monthly(40);
        RetirementDTO d = migrateDraft("TD");

        assertThatThrownBy(() -> retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(422);
            assertThat(e.getCode()).isEqualTo("PRICE_INCREASE_REQUIRES_CONSENT");
            assertThat(e.getExtra()).containsEntry("affected", 1L);
        });
        assertThat(planStatus("TQ")).as("the plan still sells").isEqualTo("PUBLISHED");
        assertThat(db().queryForObject("select count(*) from plan_retirement_item where retirement_id = ?", Integer.class, d.id())).isZero();
        assertThat(stripe.scheduleCalls).isEmpty();
    }

    @Test
    void migratingNeedsASuccessorAtAll() {
        monthly(40);
        RetirementDTO d = migrateDraft();
        assertThatThrownBy(() -> retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"))).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("SUCCESSOR_REQUIRED"));
    }

    @Test
    void anEqualPriceSuccessorIsMigratedAtTheDateWithTheScheduleCreatedAtOnce() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        Subscription s = monthly(40);
        RetirementDTO d = migrateDraft("TS");
        RetirementDTO r = retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        PlanRetirementItem item = item(r, s);

        var first = job.run(java.time.Instant.now());

        assertThat(first.scheduled()).isEqualTo(1);
        assertThat(stripe.scheduleCalls).hasSize(1);
        assertThat(stripe.scheduleCalls.get(0).at()).isEqualTo(item.getRetireEffectiveAt());
        assertThat(stripe.scheduleCalls.get(0).key()).isEqualTo("ret-" + r.id() + "-" + s.getId() + "-sched-mig");
        assertThat(job.run(java.time.Instant.now()).scheduled()).as("a rerun creates none").isZero();
        assertThat(stripe.scheduleCalls).hasSize(1);
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(item(r, s).getStatus()).as("still undecided: the reminders continue and the subscriber can choose").isEqualTo("PENDING");

        job.run(after(item, 1));

        long ts = db().queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TS'", Long.class);
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(ts);
        assertThat(item(r, s).getStatus()).isEqualTo("MIGRATED");
        assertThat(db().queryForObject("select count(*) from service_lock", Integer.class)).isZero();
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
    }

    @Test
    void aPriceThatRoseAfterTheStartIsNeverScheduledAndTheSubscriberFallsToFreeInstead() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementFixtures.successorPlan(jdbc, "TD", "AUTOPILOT");
        SubFixtures.price(jdbc, "AUTOPILOT", "MONTH", 1999, "price_td_base_m"); // equal at the start
        Subscription s = monthly(40);
        RetirementDTO d = migrateDraft("TD");
        RetirementDTO r = retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
        jdbc.update("update product_price set amount_minor = 4999 where stripe_price_id = 'price_td_base_m'"); // the successor became dearer before anything was scheduled

        var res = job.run(java.time.Instant.now());

        assertThat(res.scheduled()).isZero();
        assertThat(stripe.scheduleCalls).isEmpty();
        PlanRetirementItem item = item(r, s);
        assertThat(item.getNote()).contains("never scheduled without consent");
        job.run(after(item, 1));
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(freeVersionId());
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
    }

    @Test
    void theDefaultFreeOutcomeNeverCreatesAChargeAnywhere() {
        monthly(40);
        monthly(41);
        RetirementDTO r = startRetirement("FREE");
        var items = itemRepo.findByRetirementIdOrderByIdAsc(r.id());
        job.run(after(items.get(items.size() - 1), 2));
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.scheduleCalls).isEmpty();
        assertThat(stripe.checkoutSpecs).isEmpty();
        assertThat(stripe.refundLikeCalls).isEmpty();
    }
}
