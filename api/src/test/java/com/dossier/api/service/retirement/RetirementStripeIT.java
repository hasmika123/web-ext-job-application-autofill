package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.SuccessorRequest;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.8 on MySQL with the recording Stripe (docs/subscriptions/11 section 9): every Stripe side effect of a retirement is idempotent and bounded. One schedule per subscriber with
 * its own key, a rerun creates none, the D-1 pass only ends the undecided, a Stripe failure leaves the item for the next run which replays the same key, and the gateway has no
 * refund path at all. (A coupon carried onto a schedule phase and a comparison with Stripe's own schedules wait for the gateway growth of stories K8.5 to K8.7.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class RetirementStripeIT extends RetirementItSupport {

    private RetirementDTO migrateRetirement() {
        RetirementDTO d = retirements.create(new CreateRequest("PLAN", "TQ", null, null, null, "MIGRATE_AT_RENEWAL", null, null, null, null, RetirementFixtures.REASON, List.of(new SuccessorRequest("TS", null, 1, null))));
        return retirements.start(d.id(), new StartRequest(RetirementFixtures.REASON, "TQ"));
    }

    @Test
    void threeSubscribersGetThreeSchedulesWithDistinctKeysAndARerunCreatesNone() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        Subscription a = monthly(40);
        Subscription b = monthly(41);
        Subscription c = monthly(42);
        RetirementDTO r = migrateRetirement();

        assertThat(job.run(Instant.now()).scheduled()).isEqualTo(3);

        assertThat(stripe.scheduleCalls).hasSize(3);
        Set<String> keys = new HashSet<>();
        stripe.scheduleCalls.forEach(s -> keys.add(s.key()));
        assertThat(keys).as("distinct keys").hasSize(3);
        assertThat(keys).containsExactlyInAnyOrder(
            "ret-" + r.id() + "-" + a.getId() + "-sched-mig",
            "ret-" + r.id() + "-" + b.getId() + "-sched-mig",
            "ret-" + r.id() + "-" + c.getId() + "-sched-mig"
        );
        assertThat(stripe.scheduleCalls).allSatisfy(s -> assertThat(s.phaseItems()).extracting(i -> i.priceId()).containsExactly(SubFixtures.BASE_MONTH));
        assertThat(job.run(Instant.now()).scheduled()).isZero();
        assertThat(stripe.scheduleCalls).hasSize(3);
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.cancelCalls).as("a migration is a schedule, never a cancel").isEmpty();
        PlanRetirementItem first = item(r, a);
        assertThat(first.getStripeRef()).isEqualTo(stripe.scheduleCalls.get(0).id());
        assertThat(job.run(before(first, 20)).cancelLead()).as("the D-1 pass leaves a migrating retirement alone").isZero();
    }

    @Test
    void aStripeFailureOnTheD1PassLeavesTheItemForTheNextRunWhichReplaysTheSameKey() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        stripe.failNextCancels = 1;

        assertThat(job.run(before(item, 20)).cancelLead()).isZero();
        assertThat(item(r, s).getCancelSetAt()).isNull();
        assertThat(stripe.cancelCalls).isEmpty();

        assertThat(job.run(before(item, 19)).cancelLead()).isEqualTo(1);
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(stripe.cancelCalls.get(0).key()).isEqualTo("ret-" + r.id() + "-" + s.getId() + "-cancel-d1");
        assertThat(job.run(before(item, 18)).cancelLead()).isZero();
        assertThat(stripe.cancelCalls).hasSize(1);
    }

    @Test
    void aFallbackStillEndsTheOldPlanInStripeWhenTheD1PassNeverRan() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1)); // the job was down the day before: the date finds the item untouched
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(stripe.cancelCalls.get(0).key()).isEqualTo("ret-" + r.id() + "-" + s.getId() + "-cancel-fb");
        assertThat(item(r, s).getStatus()).isEqualTo("FELL_BACK");
    }

    @Test
    void aFallbackWhoseStripeCallFailsStillHappensAndTheReconcilerHasTheLastWord() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        stripe.failNextCancels = 5;
        job.run(after(item, 1));
        assertThat(item(r, s).getStatus()).as("the person lands on Free whatever Stripe said").isEqualTo("FELL_BACK");
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(freeVersionId());
        assertThat(stripe.cancelCalls).isEmpty();
    }

    @Test
    void nothingInARetirementEverAsksStripeForARefund() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        job.run(after(item(r, s), 1));
        assertThat(stripe.refundLikeCalls).isEmpty(); // the recording gateway has no refund method to record; RetirementNeverRefundsTest pins the code
        Arrays.stream(RetirementStripeApplier.class.getDeclaredMethods()).forEach(m -> assertThat(m.getName().toLowerCase()).doesNotContain("refund"));
    }
}
