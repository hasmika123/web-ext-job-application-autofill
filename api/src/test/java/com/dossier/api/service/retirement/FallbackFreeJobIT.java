package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.5 on MySQL (docs/subscriptions/11 section 7): the day of the retirement. Doing nothing is safe: the account lands on the live Free version, the add-on lines end, every
 * service held that Free does not include is locked read-only, a FALLBACK_FREE change keeps the previous version, the confirmation is sent once, a rerun changes nothing, and
 * Stripe is told "end at the period end" once and only for the undecided.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class FallbackFreeJobIT extends RetirementItSupport {

    @Test
    void doingNothingMovesTheAccountToFreeLocksWhatFreeLacksAndKeepsEverythingElse() {
        Subscription s = monthly(40);
        RetirementFixtures.addon(jdbc, s, "ai.credits_extra", "FEAT_AI_CREDITS", SubFixtures.AI_MONTH, 1);
        RetirementFixtures.resumes(jdbc, s.getUser().getId(), 5);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        List<String> expectedLocks = new ArrayList<>(included(plan.versionId()));
        expectedLocks.removeAll(included(freeVersionId()));
        expectedLocks.add("ai.credits_extra");

        // the D-1 pass: Stripe is told to end the old plan at the period end, once, and nothing else changes
        var lead = job.run(before(item, 20));
        assertThat(lead.cancelLead()).isEqualTo(1);
        assertThat(lead.applied()).isZero();
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(stripe.cancelCalls.get(0).cancel()).isTrue();
        assertThat(stripe.cancelCalls.get(0).subscriptionId()).isEqualTo(s.getStripeSubscriptionId());
        assertThat(stripe.cancelCalls.get(0).key()).isEqualTo("ret-" + r.id() + "-" + s.getId() + "-cancel-d1");
        assertThat(job.run(before(item, 10)).cancelLead()).as("once").isZero();
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(plan.versionId());
        assertThat(db().queryForObject("select count(*) from service_lock", Integer.class)).isZero();

        // one second before the date nothing has moved
        assertThat(job.run(item.getRetireEffectiveAt().minusSeconds(1)).applied()).isZero();
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(plan.versionId());

        // the date
        assertThat(job.run(after(item, 1)).applied()).isEqualTo(1);

        Map<String, Object> row = subRow(s.getId());
        assertThat(((Number) row.get("plan_version_id")).longValue()).isEqualTo(freeVersionId());
        assertThat(row.get("billing_interval")).isNull();
        assertThat(row.get("lapse_notice_pending")).isIn(true, 1);
        assertThat(db().queryForList("select feature_key from service_lock where user_id = ? and released_at is null order by feature_key", String.class, s.getUser().getId())).containsExactlyInAnyOrderElementsOf(expectedLocks);
        assertThat(db().queryForObject("select count(*) from subscription_addon where subscription_id = ? and live = true", Integer.class, s.getId())).as("the add-on line ended").isZero();
        assertThat(db().queryForObject("select count(*) from subscription_addon where subscription_id = ?", Integer.class, s.getId())).as("the row is kept").isEqualTo(1);
        Map<String, Object> change = db().queryForMap("select kind, status, plan_version_from, plan_version_to, payload_json from personal_subscription_change where subscription_id = ? and kind = 'FALLBACK_FREE'", s.getId());
        assertThat(change.get("status")).isEqualTo("APPLIED");
        assertThat(((Number) change.get("plan_version_from")).longValue()).isEqualTo(plan.versionId());
        assertThat(((Number) change.get("plan_version_to")).longValue()).isEqualTo(freeVersionId());
        assertThat(String.valueOf(change.get("payload_json"))).contains("previousPlanVersionId").contains("ai.credits_extra");
        PlanRetirementItem done = item(r, s);
        assertThat(done.getStatus()).isEqualTo("FELL_BACK");
        assertThat(done.getAppliedAt()).isNotNull();
        assertThat(db().queryForObject("select count(*) from resume where user_id = ?", Integer.class, s.getUser().getId())).as("over-cap data stays whole").isEqualTo(5);

        // the confirmation, once
        assertThat(mail.subjects()).contains("Your account moved to Free");
        assertThat(db().queryForObject("select count(*) from billing_notice where item_id = ? and kind = 'FALLBACK_APPLIED'", Integer.class, done.getId())).isEqualTo(1);

        // no charge, no refund, no schedule, anywhere
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.scheduleCalls).isEmpty();
        assertThat(stripe.refundLikeCalls).isEmpty();
    }

    @Test
    void aRerunIsANoOp() {
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        job.run(after(item, 1));
        long changes = db().queryForObject("select count(*) from personal_subscription_change where subscription_id = ?", Long.class, s.getId());
        long locksBefore = db().queryForObject("select count(*) from service_lock", Long.class);
        long notices = db().queryForObject("select count(*) from billing_notice where retirement_id = ?", Long.class, r.id());
        int mailsBefore = mail.sent.size();
        var again = job.run(after(item, 2));
        assertThat(again.applied()).isZero();
        assertThat(db().queryForObject("select count(*) from personal_subscription_change where subscription_id = ?", Long.class, s.getId())).isEqualTo(changes);
        assertThat(db().queryForObject("select count(*) from service_lock", Long.class)).isEqualTo(locksBefore);
        assertThat(db().queryForObject("select count(*) from billing_notice where retirement_id = ?", Long.class, r.id())).isEqualTo(notices);
        assertThat(mail.sent).hasSize(mailsBefore);
    }

    @Test
    void theD1PassCancelsOnlyTheUndecided() {
        Subscription undecided = monthly(40);
        Subscription chose = monthly(40);
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        RetirementDTO r = startRetirement("FREE", "TS");
        Long quote = choices.me(chose.getUser().getLogin()).suggestion().quoteId();
        choices.choose(chose.getUser().getLogin(), java.util.UUID.randomUUID().toString(), new com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        PlanRetirementItem lead = item(r, undecided);

        var res = job.run(before(lead, 20));

        assertThat(res.cancelLead()).isEqualTo(1);
        assertThat(stripe.cancelCalls).hasSize(1);
        assertThat(stripe.cancelCalls.get(0).subscriptionId()).isEqualTo(undecided.getStripeSubscriptionId());
        assertThat(item(r, chose).getCancelSetAt()).isNull();
    }

    @Test
    void aSubscriberWhoChoseToSwitchGetsTheirSwitchOnTheDateAndNeverFalls() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        Subscription s = monthly(40);
        RetirementDTO r = startRetirement("FREE", "TS");
        Long quote = choices.me(s.getUser().getLogin()).suggestion().quoteId();
        choices.choose(s.getUser().getLogin(), java.util.UUID.randomUUID().toString(), new com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        PlanRetirementItem item = item(r, s);

        job.run(after(item, 1));

        long ts = db().queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TS'", Long.class);
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(ts);
        assertThat(subRow(s.getId()).get("lapse_notice_pending")).isIn(false, 0);
        assertThat(db().queryForObject("select count(*) from service_lock", Integer.class)).isZero();
        assertThat(db().queryForObject("select status from personal_subscription_change where id = ?", String.class, item(r, s).getDecidedChangeId())).isEqualTo("APPLIED");
        assertThat(item(r, s).getAppliedAt()).isNotNull();
    }

    @Test
    void whenEveryoneIsHandledTheRetirementCompletesAndThePlanIsRetired() {
        Subscription a = monthly(40);
        Subscription b = monthly(41);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem last = item(r, b);
        var res = job.run(after(last, 2));
        assertThat(res.applied()).isEqualTo(2);
        assertThat(res.completed()).isEqualTo(1);
        assertThat(db().queryForObject("select status from plan_retirement where id = ?", String.class, r.id())).isEqualTo("COMPLETED");
        assertThat(planStatus("TQ")).isEqualTo("RETIRED");
        assertThat(db().queryForObject("select count(*) from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TQ' and v.status <> 'RETIRED'", Integer.class)).isZero();
        assertThat(((Number) subRow(a.getId()).get("plan_version_id")).longValue()).isEqualTo(freeVersionId());
    }

    @Test
    void aCancelPendingSubscriberFallsBackAtTheirPeriodEndWithoutAnyNewStripeCall() {
        Subscription s = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 12, true, true);
        RetirementDTO r = startRetirement("FREE");
        PlanRetirementItem item = item(r, s);
        assertThat(item.getStatus()).isEqualTo("CANCELLED");
        assertThat(item.getRetireEffectiveAt()).as("their period end, not shortened and not extended").isEqualTo(s.getCurrentPeriodEnd());
        assertThat(job.run(before(item, 20)).cancelLead()).isZero();
        assertThat(job.run(after(item, 1)).applied()).isEqualTo(1);
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).isEqualTo(freeVersionId());
        assertThat(stripe.cancelCalls).as("they had cancelled already").isEmpty();
    }
}
