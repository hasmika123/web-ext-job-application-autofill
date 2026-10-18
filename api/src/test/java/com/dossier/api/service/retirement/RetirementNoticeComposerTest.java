package com.dossier.api.service.retirement;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.retirement.RetirementNoticeComposer.Input;
import com.dossier.api.service.retirement.RetirementNoticeComposer.Notice;
import com.dossier.api.service.retirement.SuccessorAdvisor.Suggestion;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

/**
 * K10.3 copy register (docs/subscriptions/11 section 4.2): every key the composer reads exists, every rendered notice names the effective date and says what happens if
 * the subscriber does nothing, a higher price is never presented as a default, and the tone rules hold (the date in every message, no pre-selected choice).
 */
class RetirementNoticeComposerTest {

    private static final Instant DATE = Instant.parse("2026-11-15T00:00:00Z");

    private final ResourceBundleMessageSource messages = bundle();
    private final RetirementNoticeComposer composer = new RetirementNoticeComposer(messages);

    private static ResourceBundleMessageSource bundle() {
        ResourceBundleMessageSource ms = new ResourceBundleMessageSource();
        ms.setBasename("i18n/messages");
        ms.setDefaultEncoding("UTF-8");
        ms.setFallbackToSystemLocale(false);
        return ms;
    }

    private static Suggestion suggestion(String direction, long delta, List<String> gaps) {
        return new Suggestion("PRO3", "Pro v3", "PLAN", 1, List.of("ai.resume_tailoring"), gaps, 1999, 1999 + delta, delta, direction, "MONTH", 1999 + delta, null, List.of(), 42L);
    }

    private Input input(String outcome, Suggestion s, int days) {
        return new Input("Sam", "Pro", false, DATE, outcome, s, "USD", "MONTH", List.of("AI tailoring", "Inbox monitoring"), "**Thanks** for being here. See [our note](https://kiwiply.com/changes).", days, false, "https://kiwiply.com/settings/plan/changing");
    }

    private Notice notice(String outcome, Suggestion s, int days) {
        return composer.compose(input(outcome, s, days), Locale.ENGLISH, k -> "Feature " + k);
    }

    @Test
    void everyKeyTheComposerReadsIsInTheRegister() {
        for (String k : List.of(
            "subject", "pre", "kicker", "l1", "l2", "intro", "intro.addon", "strip.title", "suggest", "gaps", "gaps.limit", "diffLine.same", "diffLine.lower", "diffLine.higher",
            "interval.month", "interval.quarter", "interval.year", "default.free", "default.migrate", "default.cancel", "cancel", "lastDay", "button", "footer",
            "applied.subject", "applied.pre", "applied.kicker", "applied.l1", "applied.l2", "applied.intro", "applied.strip.title", "applied.strip.text", "applied.locked", "applied.unlock", "applied.button"
        )) {
            assertThat(messages.getMessage(RetirementNoticeComposer.P + k, new Object[] { "x", "y", "z", "w" }, Locale.ENGLISH)).as(k).isNotBlank();
        }
    }

    @Test
    void everyNoticeCarriesTheDateAndTheDefaultOutcomeSentence() {
        for (String outcome : List.of("FREE", "MIGRATE_AT_RENEWAL", "CANCEL")) {
            for (int days : List.of(60, 30, 7, 1)) {
                Notice n = notice(outcome, suggestion("SAME", 0, List.of()), days);
                assertThat(n.subject()).contains("November 15, 2026").contains("Pro");
                assertThat(n.intro()).startsWith("Hi Sam,").contains("November 15, 2026");
                assertThat(n.defaultOutcome()).contains("If you do nothing, on November 15, 2026");
                assertThat(n.stripText()).isEqualTo(n.defaultOutcome());
                assertThat(n.cancel()).contains("until November 15, 2026").contains("nothing more is charged");
                assertThat(n.effectiveDate()).isEqualTo("November 15, 2026");
            }
        }
    }

    @Test
    void aPlanNameThatAlreadyEndsInPlanIsNeverFollowedByASecondPlan() {
        Input in = new Input("Sam", "Starter Plan", false, DATE, "FREE", null, "USD", "MONTH", List.of(), null, 30, false, "https://kiwiply.com/settings/plan/changing");
        Notice n = composer.compose(in, Locale.ENGLISH, k -> k);
        assertThat(n.subject()).isEqualTo("Your Starter plan is changing on November 15, 2026");
        assertThat(n.line1()).isEqualTo("Your Starter plan");
        assertThat(n.intro()).contains("We are retiring Starter Plan.");
        Notice applied = composer.compose(new Input("Sam", "Starter plan", false, DATE, "FREE", null, "USD", "MONTH", List.of(), null, 0, true, "x"), Locale.ENGLISH, k -> k);
        assertThat(applied.intro()).contains("Your Starter plan ended on November 15, 2026");
        // a name without it still gets it, and a name that is only "plan" is left alone
        assertThat(notice("FREE", null, 30).subject()).isEqualTo("Your Pro plan is changing on November 15, 2026");
        assertThat(RetirementNoticeComposer.withoutTrailingPlan("Plan")).isEqualTo("Plan");
        assertThat(RetirementNoticeComposer.withoutTrailingPlan("Business planning")).isEqualTo("Business planning");
    }

    @Test
    void theDefaultOutcomeIsFreeWithReadOnlyAndNothingDeletedUnlessTheAdminChoseOtherwise() {
        assertThat(notice("FREE", null, 30).defaultOutcome()).contains("moves to Free").contains("read-only").contains("unlock them instantly");
        Notice migrate = notice("MIGRATE_AT_RENEWAL", suggestion("LOWER", -200, List.of()), 30);
        assertThat(migrate.defaultOutcome()).contains("move you to Pro v3 at $17.99/month").contains("not more than you pay today");
        assertThat(notice("CANCEL", null, 30).defaultOutcome()).contains("moves to Free");
    }

    @Test
    void thePriceLineIsHonestInAllThreeDirectionsAndNeverPreselectsAChoice() {
        assertThat(notice("FREE", suggestion("SAME", 0, List.of()), 30).suggest()).contains("Pro v3 is the closest match: same price, everything you use is included");
        assertThat(notice("FREE", suggestion("LOWER", -300, List.of()), 30).suggest()).contains("$3.00 less per month");
        Notice higher = notice("FREE", suggestion("HIGHER", 2000, List.of()), 30);
        assertThat(higher.suggest()).contains("$20.00 more per month").contains("never move you to a higher price without your say-so");
        assertThat(higher.defaultOutcome()).as("a higher price is never what happens by default").contains("moves to Free");
    }

    @Test
    void gapsAreNamedAndTheResumeLimitIsInPlainWords() {
        Notice n = notice("FREE", suggestion("SAME", 0, List.of("inbox.monitoring", "limit:resumes.max")), 30);
        assertThat(n.suggest()).contains("It does not include: Feature inbox.monitoring, the number of resumes you have saved.");
    }

    @Test
    void theLastDayLineAppearsOnlyOnTheLastDay() {
        assertThat(notice("FREE", null, 1).emphasis()).isEqualTo("Tomorrow your plan changes. Today is the last day to switch with no gap.");
        assertThat(notice("FREE", null, 7).emphasis()).isNull();
    }

    @Test
    void theAdminsMarkdownBecomesCalmPlainText() {
        Notice n = notice("FREE", null, 30);
        assertThat(n.message()).isEqualTo("Thanks for being here. See our note (https://kiwiply.com/changes).");
        assertThat(n.paragraphs()).contains(n.message());
        assertThat(RetirementNoticeComposer.plain("  ")).isNull();
        assertThat(RetirementNoticeComposer.plain("# Heading\n- one\n- two")).isEqualTo("Heading\n- one\n- two");
    }

    @Test
    void theFallbackConfirmationNamesWhatIsReadOnlyAndSaysNothingWasDeleted() {
        Input in = new Input("Sam", "Pro", false, DATE, "FREE", null, "USD", "MONTH", List.of("AI tailoring", "Inbox monitoring"), null, 0, true, "https://kiwiply.com/pricing");
        Notice n = composer.compose(in, Locale.ENGLISH, k -> k);
        assertThat(n.subject()).isEqualTo("Your account moved to Free");
        assertThat(n.intro()).contains("Pro plan ended on November 15, 2026").contains("Nothing you made was deleted");
        assertThat(n.paragraphs()).anyMatch(p -> p.contains("AI tailoring, Inbox monitoring")).anyMatch(p -> p.contains("Unlocking is instant"));
        assertThat(n.button()).isEqualTo("Pick a plan");
    }

    @Test
    void anAddOnRetirementSaysAddOn() {
        Input in = new Input("Sam", "Extra resumes", true, DATE, "FREE", null, "USD", "MONTH", List.of(), null, 30, false, "x");
        assertThat(composer.compose(in, Locale.ENGLISH, k -> k).intro()).contains("the Extra resumes add-on").contains("November 15, 2026");
    }

    @Test
    void moneyIsFormattedFromMinorUnits() {
        assertThat(RetirementNoticeComposer.money(1999, "USD", Locale.ENGLISH)).isEqualTo("$19.99");
        assertThat(RetirementNoticeComposer.money(5, "USD", Locale.ENGLISH)).isEqualTo("$0.05");
        assertThat(RetirementNoticeComposer.money(0, null, Locale.ENGLISH)).isEqualTo("$0.00");
    }

    @Test
    void theDueDayIsTheSmallestScheduledDayNotBelowTheDaysLeft() {
        List<Integer> schedule = List.of(60, 30, 7, 1);
        Instant now = Instant.parse("2026-10-01T10:00:00Z");
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(90L * 86_400), now)).as("further away than the first day").isNull();
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(45L * 86_400), now)).isEqualTo(60);
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(30L * 86_400), now)).isEqualTo(30);
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(29L * 86_400 + 3600), now)).isEqualTo(30);
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(8L * 86_400), now)).isEqualTo(30);
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(7L * 86_400), now)).isEqualTo(7);
        assertThat(RetirementNoticeService.dueDay(schedule, now.plusSeconds(3600), now)).isEqualTo(1);
        assertThat(RetirementNoticeService.dueDay(schedule, now.minusSeconds(1), now)).as("the date has passed").isNull();
    }
}
