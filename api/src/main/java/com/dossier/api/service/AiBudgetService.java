package com.dossier.api.service;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.billing.StripeProperties;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Who may use server AI right now, and on which model (Phase 13.1b). One decision per call, made
 * before the provider is contacted, for every AI entry point.
 *
 * <p>Two ways to be metered:
 * <ul>
 *   <li><b>A cost budget</b> — Pro users and anyone with an admin override (a budget in cents,
 *       which outranks the plan). Pro's budget covers <b>one billing period</b> (15.5): $3 on the
 *       monthly plan, $8 on the 3-month plan, summed from the {@code ai_call} ledger from the
 *       period's start to its renewal. An override covers the calendar month (UTC). Past the soft
 *       cap every task drops to the economy model; at 100 % AI stops until the window resets.
 *       Users only ever see this as a percentage — never dollars.</li>
 *   <li><b>A call count</b> — a Free user with no override, who has exactly one kind of server AI:
 *       resume parsing (the free exception), limited to {@code dossier.ai.free-monthly-quota}
 *       parses a month. Every other task is Pro.</li>
 * </ul>
 * A task listed in {@link AiPolicy#getDisabledTasks()} is refused for everyone, before anything else.
 */
@Service
@Transactional(readOnly = true)
public class AiBudgetService {

    public enum Verdict {
        /** Go ahead, on {@link Decision#model()}. */
        OK,
        /** The feature is switched off (kill switch). */
        TASK_DISABLED,
        /** Free, no override, and not the free exception. */
        PRO_REQUIRED,
        /** This period's budget (or this month's free parse count) is used up. */
        EXHAUSTED,
    }

    /**
     * @param used     budget: percent spent (0–100); count: calls made this month
     * @param limit    budget: 100; count: the monthly call quota
     * @param resetsAt when {@code used} goes back to 0: Pro's renewal, else the start of next month (UTC)
     * @param economy  true when the soft cap has moved this call to the economy model
     */
    public record Decision(Verdict verdict, String model, boolean budgeted, int used, int limit, Instant resetsAt, boolean economy) {}

    /**
     * What a user's meter shows (13.1c). {@code metered} is {@code "budget"} (Pro or an override:
     * {@code used} is a percent of the month's budget, {@code limit} is 100) or {@code "count"} (a
     * Free user: resume parses this month out of {@code limit}). Never dollars — the budget's size
     * and what AI costs us stay out of the product.
     */
    public record Usage(String metered, int used, int limit, Instant resetsAt, boolean economy) {}

    /** A budget and the window it covers: spending since {@code start} counts, until {@code resetsAt}. */
    record Window(long budgetMicros, Instant start, Instant resetsAt) {}

    private final AiPolicy policy;
    private final AiProvider provider;
    private final AiQuotaOverrideRepository overrideRepository;
    private final EntitlementService entitlementService;
    private final AiCallRepository callRepository;
    private final AiMeteringService metering;
    private final SubscriptionRepository subscriptions;
    private final StripeProperties stripe;
    private final int freeMonthlyQuota;

    public AiBudgetService(
        AiPolicy policy,
        AiProvider provider,
        AiQuotaOverrideRepository overrideRepository,
        EntitlementService entitlementService,
        AiCallRepository callRepository,
        AiMeteringService metering,
        SubscriptionRepository subscriptions,
        StripeProperties stripe,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota
    ) {
        this.policy = policy;
        this.provider = provider;
        this.overrideRepository = overrideRepository;
        this.entitlementService = entitlementService;
        this.callRepository = callRepository;
        this.metering = metering;
        this.subscriptions = subscriptions;
        this.stripe = stripe;
        this.freeMonthlyQuota = freeMonthlyQuota;
    }

    /** The meter for Settings and the extension: use in the current window, and when it resets. */
    public Usage usage(String login) {
        Instant now = Instant.now();
        Optional<Window> window = window(login, now);
        if (window.isEmpty()) {
            return new Usage("count", metering.usedThisMonth(login), freeMonthlyQuota, resetsAt(now), false);
        }
        Window w = window.get();
        int pct = percent(callRepository.costSince(login, w.start()), w.budgetMicros());
        boolean economy = policy.hasEconomyModel() && pct >= policy.getSoftCapPercent() && pct < 100;
        return new Usage("budget", pct, 100, w.resetsAt(), economy);
    }

    /**
     * This user's budget and its window — an admin override (the calendar month), else Pro's (the
     * billing period) — or empty for a Free user.
     */
    Optional<Window> window(String login, Instant now) {
        // An admin override outranks the plan (a locked decision): it opens the gate AND sets the budget.
        Optional<AiQuotaOverride> override = overrideRepository.findById(login);
        if (override.isPresent()) {
            return Optional.of(new Window(centsToMicros(override.get().getMonthlyBudgetCents()), monthStart(now), resetsAt(now)));
        }
        if (!entitlementService.isPro(login)) return Optional.empty();
        return Optional.of(proWindow(subscriptions.findOneByUserLogin(login).orElse(null), now));
    }

    /**
     * Pro's window is the subscription's current billing period: it ends at {@code current_period_end}
     * (the renewal) and starts one plan length earlier — 3 months on the 3-month price, else 1. The
     * mirror keeps no period start, and Stripe's periods are whole calendar months from the
     * subscription's anchor, so this is the instant Stripe started it. A subscription with no usable
     * period end (shouldn't happen while it's Pro) falls back to the calendar month.
     */
    Window proWindow(Subscription sub, Instant now) {
        boolean threeMonth = sub != null && isThreeMonthPrice(sub.getPriceId());
        long budget = threeMonth ? policy.pro3moBudgetMicros() : policy.proBudgetMicros();
        Instant end = sub == null ? null : sub.getCurrentPeriodEnd();
        if (end == null || !end.isAfter(now)) {
            return new Window(budget, monthStart(now), resetsAt(now));
        }
        Instant start = end.atZone(ZoneOffset.UTC).minusMonths(threeMonth ? 3 : 1).toInstant();
        return new Window(budget, start.isAfter(now) ? now : start, end);
    }

    private boolean isThreeMonthPrice(String priceId) {
        String threeMonth = stripe.getPrice3mo();
        return priceId != null && threeMonth != null && !threeMonth.isBlank() && threeMonth.trim().equals(priceId.trim());
    }

    public Decision decide(String login, AiTask task) {
        Instant now = Instant.now();
        Instant resets = resetsAt(now);
        if (policy.isDisabled(task)) {
            return new Decision(Verdict.TASK_DISABLED, null, false, 0, 0, resets, false);
        }

        Optional<Window> window = window(login, now);
        String routed = policy.modelFor(task, provider.defaultModel());

        if (window.isEmpty()) {
            if (task != AiTask.PARSE) {
                return new Decision(Verdict.PRO_REQUIRED, null, false, 0, 0, resets, false);
            }
            int used = metering.usedThisMonth(login);
            return new Decision(used >= freeMonthlyQuota ? Verdict.EXHAUSTED : Verdict.OK, routed, false, used, freeMonthlyQuota, resets, false);
        }

        Window w = window.get();
        long budget = w.budgetMicros();
        long spent = callRepository.costSince(login, w.start());
        int pct = percent(spent, budget);
        if (spent >= budget) {
            return new Decision(Verdict.EXHAUSTED, null, true, pct, 100, w.resetsAt(), false);
        }
        boolean economy = policy.hasEconomyModel() && pct >= policy.getSoftCapPercent();
        return new Decision(Verdict.OK, economy ? policy.getEconomyModel().trim() : routed, true, pct, 100, w.resetsAt(), economy);
    }

    /** Whole percent of a budget spent, 0–100. A zero budget (an override of $0) is fully spent. */
    static int percent(long spentMicros, long budgetMicros) {
        if (budgetMicros <= 0) return 100;
        return (int) Math.min(100, Math.max(0, spentMicros * 100 / budgetMicros));
    }

    static long centsToMicros(int cents) {
        return Math.max(0, cents) * 10_000L;
    }

    /** The first instant of this calendar month, UTC — an override's (and Free parsing's) window starts here. */
    static Instant monthStart() {
        return monthStart(Instant.now());
    }

    static Instant monthStart(Instant now) {
        return YearMonth.from(now.atZone(ZoneOffset.UTC)).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    /** The first instant of next month, UTC — when a calendar-month window resets. */
    static Instant resetsAt() {
        return resetsAt(Instant.now());
    }

    static Instant resetsAt(Instant now) {
        return YearMonth.from(now.atZone(ZoneOffset.UTC)).plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
