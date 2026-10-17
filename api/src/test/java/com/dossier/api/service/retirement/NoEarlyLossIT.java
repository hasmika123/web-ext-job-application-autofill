package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.catalog.PlanRetirementItem;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.personal.SubFixtures;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.retirement.dto.CustomerRetirementDTOs.ChoiceRequest;
import com.dossier.api.service.retirement.dto.RetirementDTOs.RetirementDTO;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K10.11 / docs/subscriptions/11 section 13 {@code NoEarlyLossIT}: the promise of every retirement e-mail, as a clock-driven test. For six kinds of subscriber the entitlements
 * (the resolved services, capabilities and limits), the price they pay and their subscription row are identical from the start of the retirement to one second before their
 * own effective date, while the notice job and the retirement job run at every notice day, at the cancel-lead moment and at the last second. After the date the outcome is
 * exactly the retirement's, and not a row of anyone's data is gone.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
@Import({ SubFixtures.CatalogPortConfig.class, RecordingStripeGateway.Config.class })
class NoEarlyLossIT extends RetirementItSupport {

    @Autowired private RetirementMoney money;

    /** What a subscriber can use and pays, in a form two moments can be compared by. */
    private record Shape(String planKey, Long planVersionId, TreeSet<String> features, TreeSet<String> capabilities, Map<String, Long> limits, String state, long recurringMinor, Map<String, Object> row) {}

    private Shape shape(Subscription s, Instant t) {
        EntitlementSet set = resolver.resolvePersonal(s.getUser().getLogin(), t);
        Map<String, Object> row = new LinkedHashMap<>(subRow(s.getId()));
        row.remove("lapse_notice_pending");
        return new Shape(
            set.planKey(),
            set.planVersionId(),
            new TreeSet<>(set.features().keySet()),
            new TreeSet<>(set.capabilities()),
            new LinkedHashMap<>(new java.util.TreeMap<>(set.limits())),
            set.state().name(),
            money.recurringMinor(subscriptions.findById(s.getId()).orElseThrow(), t),
            row
        );
    }

    @Test
    void nobodyLosesAnythingBeforeTheirOwnDateForSixKindsOfSubscriber() {
        RetirementFixtures.successorPlan(jdbc, "TS", "PRO");
        Subscription monthlyUndecided = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 40, false, true);
        Subscription quarterlySwitch = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "QUARTER", "active", 80, false, true);
        Subscription yearly = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "YEAR", "active", 20, false, true);
        Subscription cancelPending = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 12, true, true);
        Subscription pastDue = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "past_due", 45, false, true);
        Subscription withAddon = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 41, false, true);
        RetirementFixtures.addon(jdbc, withAddon, "ai.credits_extra", "FEAT_AI_CREDITS", SubFixtures.AI_MONTH, 1);
        List<Subscription> all = List.of(monthlyUndecided, quarterlySwitch, yearly, cancelPending, pastDue, withAddon);
        for (Subscription s : all) RetirementFixtures.resumes(jdbc, s.getUser().getId(), 4);

        RetirementDTO r = startRetirement("FREE", "TS");
        Instant now = Instant.now();
        Map<Long, Shape> baseline = new LinkedHashMap<>();
        Map<Long, Instant> dates = new LinkedHashMap<>();
        for (Subscription s : all) {
            baseline.put(s.getId(), shape(s, now));
            dates.put(s.getId(), item(r, s).getRetireEffectiveAt());
        }
        // the quarterly subscriber chooses to switch at renewal (the cancel-pending one keeps what they chose already)
        Long quote = choices.me(quarterlySwitch.getUser().getLogin()).suggestion().quoteId();
        choices.choose(quarterlySwitch.getUser().getLogin(), UUID.randomUUID().toString(), new ChoiceRequest("SWITCH_AT_RENEWAL", quote, null, null, null));
        assertThat(stripe.itemCalls).as("a scheduled switch changes nothing in Stripe today").isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        for (Subscription s : all) baseline.put(s.getId(), shape(s, now)); // the choice itself records a pending change but touches no subscription row

        // the dates differ by kind: monthly at the period end, the short ones one renewal later, the yearly one a whole term later
        assertThat(dates.get(monthlyUndecided.getId())).isEqualTo(monthlyUndecided.getCurrentPeriodEnd());
        assertThat(dates.get(yearly.getId())).isAfter(now.plus(300, ChronoUnit.DAYS));
        assertThat(dates.get(cancelPending.getId())).isEqualTo(cancelPending.getCurrentPeriodEnd());

        // the clock: every notice day, the cancel-lead moment and the last second before each date, in order
        List<Instant> points = new ArrayList<>();
        for (Instant e : dates.values()) {
            for (long d : new long[] { 61, 60, 59, 31, 30, 29, 8, 7, 6, 2, 1 }) points.add(e.minus(d, ChronoUnit.DAYS));
            points.add(e.minus(37, ChronoUnit.HOURS));
            points.add(e.minus(36, ChronoUnit.HOURS));
            points.add(e.minus(1, ChronoUnit.HOURS));
            points.add(e.minusSeconds(1));
        }
        points.removeIf(t -> t.isBefore(now));
        points.sort(Instant::compareTo);
        int checked = 0;
        for (Instant t : points.stream().distinct().toList()) {
            noticeJob.run(t);
            job.run(t);
            for (Subscription s : all) {
                if (!t.isBefore(dates.get(s.getId()))) continue; // their date: what happens there is the retirement's outcome, checked below
                Shape expected = baseline.get(s.getId());
                Shape actual = shape(s, t);
                assertThat(actual).as("%s at %s, before their date %s", s.getUser().getLogin(), t, dates.get(s.getId())).isEqualTo(expected);
                checked++;
            }
        }
        assertThat(checked).as("the clock really walked through the notice days").isGreaterThan(100);
        assertThat(stripe.itemCalls).as("no item update, no proration, no invoice, before any date").isEmpty();
        assertThat(stripe.invoiceItemCalls).isEmpty();
        assertThat(stripe.refundLikeCalls).isEmpty();
        assertThat(db().queryForObject("select count(*) from service_lock", Integer.class)).as("nothing is locked before a date").isZero();
        assertThat(mail.subjects()).anyMatch(t -> t.contains("is changing on"));

        // after the dates: the outcome is exactly the retirement's
        Instant end = dates.values().stream().max(Instant::compareTo).orElseThrow().plus(1, ChronoUnit.HOURS);
        noticeJob.run(end);
        job.run(end);
        for (Subscription s : List.of(monthlyUndecided, yearly, cancelPending, pastDue, withAddon)) {
            assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).as(s.getUser().getLogin()).isEqualTo(freeVersionId());
        }
        long ts = db().queryForObject("select v.id from plan_version v join plan p on p.id = v.plan_id where p.plan_key = 'TS'", Long.class);
        assertThat(((Number) subRow(quarterlySwitch.getId()).get("plan_version_id")).longValue()).as("the switch they chose").isEqualTo(ts);
        assertThat(db().queryForObject("select count(*) from service_lock where user_id = ?", Integer.class, quarterlySwitch.getUser().getId())).isZero();
        assertThat(db().queryForObject("select status from plan_retirement where id = ?", String.class, r.id())).isEqualTo("COMPLETED");
        for (Subscription s : all) {
            assertThat(db().queryForObject("select count(*) from resume where user_id = ?", Integer.class, s.getUser().getId())).as("resumes of %s", s.getUser().getLogin()).isEqualTo(4);
        }
    }

    @Test
    void anAddOnRetirementKeepsTheLineAndItsServiceUntilItsDate() {
        Subscription s = RetirementFixtures.subscriber(users, subscriptions, plan.versionId(), "MONTH", "active", 41, false, true);
        RetirementFixtures.addon(jdbc, s, "ai.credits_extra", "FEAT_AI_CREDITS", SubFixtures.AI_MONTH, 1);
        RetirementDTO d = retirements.create(new com.dossier.api.service.retirement.dto.RetirementDTOs.CreateRequest("ADDON", null, null, "ai.credits_extra", null, null, null, null, null, null, RetirementFixtures.REASON, List.of()));
        RetirementDTO r = retirements.start(d.id(), new com.dossier.api.service.retirement.dto.RetirementDTOs.StartRequest(RetirementFixtures.REASON, "ai.credits_extra"));
        assertThat(db().queryForObject("select lifecycle from feature_definition where feature_key = 'ai.credits_extra'", String.class)).isEqualTo("RETIRING");
        PlanRetirementItem item = item(r, s);
        Instant now = Instant.now();
        Shape baseline = shape(s, now);

        for (Instant t : List.of(before(item, 24 * 30), before(item, 24 * 7), before(item, 24), item.getRetireEffectiveAt().minusSeconds(1))) {
            if (t.isBefore(now)) continue;
            noticeJob.run(t);
            job.run(t);
            assertThat(shape(s, t)).isEqualTo(baseline);
        }
        assertThat(stripe.itemCalls).isEmpty();
        assertThat(db().queryForObject("select count(*) from subscription_addon where subscription_id = ? and live = true", Integer.class, s.getId())).isEqualTo(1);

        job.run(after(item, 1));

        assertThat(db().queryForObject("select count(*) from subscription_addon where subscription_id = ? and live = true", Integer.class, s.getId())).as("the line ended on its date").isZero();
        assertThat(stripe.itemCalls).as("Stripe stops billing the add-on").hasSize(1);
        assertThat(stripe.itemCalls.get(0).items()).extracting(i -> i.priceId()).containsExactly(SubFixtures.BASE_MONTH);
        assertThat(((Number) subRow(s.getId()).get("plan_version_id")).longValue()).as("the plan itself is untouched").isEqualTo(plan.versionId());
        assertThat(db().queryForObject("select count(*) from service_lock where user_id = ? and feature_key = 'ai.credits_extra' and released_at is null", Integer.class, s.getUser().getId())).isEqualTo(1);
        assertThat(db().queryForObject("select lifecycle from feature_definition where feature_key = 'ai.credits_extra'", String.class)).isEqualTo("RETIRED");
    }
}
