package com.dossier.api.service.entitlement;

import static com.dossier.api.service.entitlement.ResolverFixtures.NOW;
import static com.dossier.api.service.entitlement.ResolverFixtures.features;
import static com.dossier.api.service.entitlement.ResolverFixtures.personal;
import static com.dossier.api.service.entitlement.ResolverFixtures.plan;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.entitlement.EntitlementSet.Source;
import com.dossier.api.service.entitlement.EntitlementSet.SubscriptionState;
import com.dossier.api.service.entitlement.PlanData.CompLine;
import com.dossier.api.service.entitlement.PlanData.LicenseFeatureLine;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

/** The resolver core against the seeded plans (06-entitlements-and-enforcement.md section 10): no database, the SAME numbers the Liquibase seed writes. */
class PlanResolverTest {

    private static final Instant END = NOW.plus(10, ChronoUnit.DAYS);

    @Test
    void freeWithoutASubscriptionIsTheFreeSet() {
        EntitlementSet s = PlanResolverCore.resolvePersonal(
            new PlanResolverCore.PersonalInputs("u", false, null, null, null, false, null, null, plan("FREE"), List.of(), List.of(), features(), null),
            NOW
        );
        assertThat(s.planKey()).isEqualTo("FREE");
        assertThat(s.state()).isEqualTo(SubscriptionState.NONE);
        assertThat(s.has(FeatureKeys.BASE_PERSONAL)).isTrue();
        assertThat(s.has(FeatureKeys.Capability.AI_SERVER)).isFalse();
        assertThat(s.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(3);
        assertThat(s.limit(FeatureKeys.Limit.MATCHES_PER_DAY)).isEqualTo(3);
        assertThat(s.aiWindow()).isNull();
    }

    @Test
    void proMonthlyHasThePaidServicesAndAThreeDollarWindow() {
        EntitlementSet s = PlanResolverCore.resolvePersonal(personal("active", null, END, "MONTH", plan("PRO")), NOW);
        assertThat(s.planKey()).isEqualTo("PRO");
        assertThat(s.state()).isEqualTo(SubscriptionState.ACTIVE);
        assertThat(s.has(FeatureKeys.Capability.AI_SERVER)).isTrue();
        assertThat(s.has(FeatureKeys.AI_RESUME_TAILORING)).isTrue();
        assertThat(s.has(FeatureKeys.Capability.INBOX)).isTrue();
        assertThat(s.has(FeatureKeys.AUTOMATION_APPROVED_APPLY)).isFalse();
        assertThat(s.has(FeatureKeys.AI_CREDITS_EXTRA)).as("an OPTIONAL add-on is not granted until bought").isFalse();
        assertThat(s.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(25);
        assertThat(s.limit(FeatureKeys.Limit.MATCHES_PER_DAY)).isEqualTo(20);
        assertThat(s.features().get(FeatureKeys.AI_AUTOFILL).source()).isEqualTo(Source.PLAN_INCLUDED);
        assertThat(s.aiWindow().budgetCents()).isEqualTo(300);
        assertThat(s.aiWindow().resetsAt()).isEqualTo(END);
        assertThat(s.aiWindow().start()).isEqualTo(END.atZone(java.time.ZoneOffset.UTC).minusMonths(1).toInstant());
    }

    @Test
    void proQuarterlyIsTheExplicitEightDollarPool() {
        EntitlementSet s = PlanResolverCore.resolvePersonal(personal("active", null, END, "QUARTER", plan("PRO")), NOW);
        assertThat(s.aiWindow().budgetCents()).as("decision E-2: 800, not 3 x 300").isEqualTo(800);
        assertThat(s.aiWindow().start()).isEqualTo(END.atZone(java.time.ZoneOffset.UTC).minusMonths(3).toInstant());
    }

    @Test
    void autopilotWindowsAndLimits() {
        EntitlementSet monthly = PlanResolverCore.resolvePersonal(personal("active", null, END, "MONTH", plan("AUTOPILOT")), NOW);
        EntitlementSet quarterly = PlanResolverCore.resolvePersonal(personal("active", null, END, "QUARTER", plan("AUTOPILOT")), NOW);
        assertThat(monthly.aiWindow().budgetCents()).isEqualTo(600);
        assertThat(quarterly.aiWindow().budgetCents()).isEqualTo(1600);
        assertThat(monthly.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(50);
        assertThat(monthly.has(FeatureKeys.AUTOMATION_APPROVED_APPLY)).isTrue();
        assertThat(monthly.limit("operations.per_day")).isEqualTo(30);
    }

    @Test
    void extraCreditsAddSeventyFiveCentsEachAndDoNotTouchTheResumeLimit() {
        var addons = List.of(new PersonalAddonSource.Addon(FeatureKeys.AI_CREDITS_EXTRA, 2, NOW.minusSeconds(60), null));
        EntitlementSet monthly = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("active", null, END, "MONTH", plan("PRO")), addons), NOW);
        EntitlementSet quarterly = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("active", null, END, "QUARTER", plan("PRO")), addons), NOW);
        assertThat(monthly.aiWindow().budgetCents()).as("300 + 2 x 75").isEqualTo(450);
        assertThat(quarterly.aiWindow().budgetCents()).as("800 + 2 x 75 x 3").isEqualTo(1250);
        assertThat(monthly.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(25);
        assertThat(monthly.features().get(FeatureKeys.AI_CREDITS_EXTRA).source()).isEqualTo(Source.ADDON);
    }

    @Test
    void anAdditiveResumePackAddsToTheLimit() {
        var addons = List.of(new PersonalAddonSource.Addon(FeatureKeys.RESUME_EXTRA_PACK, 1, NOW.minusSeconds(60), null));
        EntitlementSet s = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("active", null, END, "MONTH", plan("PRO")), addons), NOW);
        assertThat(s.limit(FeatureKeys.Limit.RESUMES_MAX)).as("25 + one pack of 10").isEqualTo(35);
    }

    @Test
    void anEndedOrFutureAddonDoesNotCount() {
        var addons = List.of(
            new PersonalAddonSource.Addon(FeatureKeys.AI_CREDITS_EXTRA, 2, NOW.minus(40, ChronoUnit.DAYS), NOW.minusSeconds(1)),
            new PersonalAddonSource.Addon(FeatureKeys.RESUME_EXTRA_PACK, 1, NOW.plusSeconds(60), null)
        );
        EntitlementSet s = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("active", null, END, "MONTH", plan("PRO")), addons), NOW);
        assertThat(s.aiWindow().budgetCents()).isEqualTo(300);
        assertThat(s.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(25);
    }

    @Test
    void anAddonOnALapsedSubscriptionIsIgnored() {
        var addons = List.of(new PersonalAddonSource.Addon(FeatureKeys.RESUME_EXTRA_PACK, 1, NOW.minusSeconds(60), null));
        EntitlementSet s = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("unpaid", null, END, "MONTH", plan("PRO")), addons), NOW);
        assertThat(s.limit(FeatureKeys.Limit.RESUMES_MAX)).isEqualTo(3);
    }

    @Test
    void annualTermSpendsInMonthlySubWindows() {
        Instant termStart = Instant.parse("2026-01-15T00:00:00Z");
        Instant termEnd = Instant.parse("2027-01-15T00:00:00Z");
        EntitlementSet s = PlanResolverCore.resolvePersonal(personal("active", termStart, termEnd, "YEAR", plan("PRO")), Instant.parse("2026-04-20T08:00:00Z"));
        assertThat(s.aiWindow().budgetCents()).as("S-10: the yearly plan resets monthly, never pooled").isEqualTo(300);
        assertThat(s.aiWindow().start()).isEqualTo(Instant.parse("2026-04-15T00:00:00Z"));
        assertThat(s.aiWindow().resetsAt()).isEqualTo(Instant.parse("2026-05-15T00:00:00Z"));
    }

    @Test
    void lapsedFallsBackToTheFreeSetImmediatelyOrAtPeriodEnd() {
        assertThat(PlanResolverCore.resolvePersonal(personal("past_due", null, END, "MONTH", plan("PRO")), NOW).state()).isEqualTo(SubscriptionState.PAST_DUE_ENTITLED);
        assertThat(PlanResolverCore.resolvePersonal(personal("past_due", null, END, "MONTH", plan("PRO")), NOW).has(FeatureKeys.Capability.AI_SERVER)).isTrue();
        EntitlementSet lapsed = PlanResolverCore.resolvePersonal(personal("past_due", null, NOW.minusSeconds(1), "MONTH", plan("PRO")), NOW);
        assertThat(lapsed.state()).isEqualTo(SubscriptionState.PAST_DUE_LAPSED);
        assertThat(lapsed.planKey()).isEqualTo("FREE");
        assertThat(lapsed.has(FeatureKeys.Capability.AI_SERVER)).isFalse();
        assertThat(PlanResolverCore.resolvePersonal(personal("unpaid", null, END, "MONTH", plan("PRO")), NOW).planKey()).isEqualTo("FREE");
        assertThat(PlanResolverCore.resolvePersonal(personal("incomplete_expired", null, END, "MONTH", plan("PRO")), NOW).planKey()).isEqualTo("FREE");
    }

    @Test
    void cancelledKeepsThePaidServicesUntilThePeriodEnds() {
        EntitlementSet s = PlanResolverCore.resolvePersonal(personal("canceled", null, END, "MONTH", plan("PRO")), NOW);
        assertThat(s.state()).isEqualTo(SubscriptionState.CANCEL_PENDING);
        assertThat(s.has(FeatureKeys.Capability.AI_SERVER)).isTrue();
        assertThat(PlanResolverCore.resolvePersonal(personal("canceled", null, NOW.minusSeconds(1), "MONTH", plan("PRO")), NOW).has(FeatureKeys.Capability.AI_SERVER)).isFalse();
    }

    @Test
    void theEntitledStatesAgreeWithTheLegacyRuleForTheWholeMatrix() {
        for (String status : new String[] { null, "none", "active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused", "ACTIVE", " Past_Due " }) {
            for (Instant end : new Instant[] { null, NOW.minusSeconds(1), NOW, NOW.plusSeconds(1), END }) {
                for (boolean cancelAtEnd : new boolean[] { false, true }) {
                    boolean legacy = EntitlementService.isProFor(status, end, NOW);
                    boolean resolved = PlanResolverCore.personalState(status, end, cancelAtEnd, NOW).entitled();
                    assertThat(resolved).as("status=%s end=%s cancelAtEnd=%s", status, end, cancelAtEnd).isEqualTo(legacy);
                }
            }
        }
    }

    @Test
    void aCompGrantAddsItsPlanWithTheRichestPlanAsLabel() {
        var comp = new CompLine(plan("PRO"), NOW.minusSeconds(60), NOW.plus(30, ChronoUnit.DAYS));
        EntitlementSet s = PlanResolverCore.resolvePersonal(
            ResolverFixtures.withComps(new PlanResolverCore.PersonalInputs("u", false, null, null, null, false, null, null, plan("FREE"), List.of(), List.of(), features(), null), List.of(comp)),
            NOW
        );
        assertThat(s.planKey()).isEqualTo("PRO");
        assertThat(s.has(FeatureKeys.Capability.AI_SERVER)).isTrue();
        assertThat(s.features().get(FeatureKeys.AI_AUTOFILL).source()).isEqualTo(Source.ADMIN_COMP);
        assertThat(s.state()).as("a comp is not a subscription").isEqualTo(SubscriptionState.NONE);
        var expired = new CompLine(plan("PRO"), NOW.minus(40, ChronoUnit.DAYS), NOW.minusSeconds(1));
        EntitlementSet gone = PlanResolverCore.resolvePersonal(
            ResolverFixtures.withComps(new PlanResolverCore.PersonalInputs("u", false, null, null, null, false, null, null, plan("FREE"), List.of(), List.of(), features(), null), List.of(expired)),
            NOW
        );
        assertThat(gone.has(FeatureKeys.Capability.AI_SERVER)).isFalse();
    }

    @Test
    void anEnterpriseAccountInAPersonalContextIsNotFound() {
        var in = new PlanResolverCore.PersonalInputs("ent#7#anika", true, "active", null, END, false, "MONTH", plan("PRO"), plan("FREE"), List.of(), List.of(), features(), null);
        assertThatThrownBy(() -> PlanResolverCore.resolvePersonal(in, NOW))
            .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode().value()).isEqualTo(404));
    }

    // ---- organization reader -------------------------------------------------------------------------------------

    @Test
    void anActiveLicenseGetsTheSeatBaseAndItsLiveFeatures() {
        var in = new PlanResolverCore.OrgInputs(
            7,
            11,
            "ACTIVE",
            NOW.minus(5, ChronoUnit.DAYS),
            null,
            plan("ORG_STANDARD"),
            List.of(new LicenseFeatureLine(FeatureKeys.INBOX_MONITORING, 1, null, NOW.minus(5, ChronoUnit.DAYS), null, true)),
            features()
        );
        EntitlementSet s = PlanResolverCore.resolveOrg(in, NOW);
        assertThat(s.state()).isEqualTo(SubscriptionState.ACTIVE);
        assertThat(s.features().get(FeatureKeys.BASE_CONSULTANT).source()).isEqualTo(Source.SEAT_INCLUDED);
        assertThat(s.features().get(FeatureKeys.INBOX_MONITORING).source()).isEqualTo(Source.SEAT_ADDON);
        assertThat(s.has(FeatureKeys.Capability.INBOX)).isTrue();
        assertThat(s.has(FeatureKeys.AI_RESUME_TAILORING)).as("an add-on the seat does not hold").isFalse();
        assertThat(s.has(FeatureKeys.AI_AUTOFILL)).as("E14: a personal service never appears in an org set").isFalse();
        assertThat(s.aiWindow()).isNull();
    }

    @Test
    void noCrossWorldLeakage_aPersonalAddonIsNeverInAnOrgSetAndASeatIsNeverInAPersonalSet() {
        // E13: personal add-ons reach only the personal reader (the org reader has no add-on input at all) - an org set built beside a bought pack has no pack
        var addons = List.of(new PersonalAddonSource.Addon(FeatureKeys.AI_CREDITS_EXTRA, 2, NOW.minusSeconds(60), null));
        EntitlementSet personal = PlanResolverCore.resolvePersonal(ResolverFixtures.withAddons(personal("active", null, END, "MONTH", plan("PRO")), addons), NOW);
        assertThat(personal.has(FeatureKeys.AI_CREDITS_EXTRA)).isTrue();
        var org = new PlanResolverCore.OrgInputs(7, 11, "ACTIVE", NOW.minus(5, ChronoUnit.DAYS), null, plan("ORG_STANDARD"), List.of(), features());
        assertThat(PlanResolverCore.resolveOrg(org, NOW).has(FeatureKeys.AI_CREDITS_EXTRA)).isFalse();
        // E14: a seat grant never shows in the personal set
        assertThat(personal.has(FeatureKeys.BASE_CONSULTANT)).isFalse();
        assertThat(personal.features().values()).noneMatch(g -> g.source() == Source.SEAT_INCLUDED || g.source() == Source.SEAT_ADDON);
    }

    @Test
    void aSuspendedEndedOrMissingLicenseGrantsNothing() {
        Instant start = NOW.minus(5, ChronoUnit.DAYS);
        for (String status : new String[] { "SUSPENDED", "ENDED", "PENDING" }) {
            EntitlementSet s = PlanResolverCore.resolveOrg(new PlanResolverCore.OrgInputs(7, 11, status, start, null, plan("ORG_STANDARD"), List.of(), features()), NOW);
            assertThat(s.features()).as(status).isEmpty();
        }
        assertThat(PlanResolverCore.resolveOrg(new PlanResolverCore.OrgInputs(7, 11, "SUSPENDED", start, null, plan("ORG_STANDARD"), List.of(), features()), NOW).state()).isEqualTo(SubscriptionState.SUSPENDED);
        EntitlementSet expired = PlanResolverCore.resolveOrg(new PlanResolverCore.OrgInputs(7, 11, "ACTIVE", start, NOW.minusSeconds(1), plan("ORG_STANDARD"), List.of(), features()), NOW);
        assertThat(expired.state()).isEqualTo(SubscriptionState.NONE);
        assertThat(PlanResolverCore.resolveOrg(new PlanResolverCore.OrgInputs(7, 11, null, null, null, plan("ORG_STANDARD"), List.of(), features()), NOW).features()).isEmpty();
    }

    @Test
    void aFeatureRowThatIsNotLiveOrNotStartedIsIgnored() {
        Instant start = NOW.minus(5, ChronoUnit.DAYS);
        var in = new PlanResolverCore.OrgInputs(
            7,
            11,
            "ACTIVE",
            start,
            null,
            plan("ORG_STANDARD"),
            List.of(
                new LicenseFeatureLine(FeatureKeys.INBOX_MONITORING, 1, null, start, null, false),
                new LicenseFeatureLine(FeatureKeys.AI_RESUME_TAILORING, 1, null, NOW.plusSeconds(60), null, true)
            ),
            features()
        );
        EntitlementSet s = PlanResolverCore.resolveOrg(in, NOW);
        assertThat(s.has(FeatureKeys.INBOX_MONITORING)).isFalse();
        assertThat(s.has(FeatureKeys.AI_RESUME_TAILORING)).isFalse();
    }
}
