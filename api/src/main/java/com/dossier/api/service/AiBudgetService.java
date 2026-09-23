package com.dossier.api.service;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiTask;
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
 *   <li><b>A cost budget</b> — Pro users ({@link AiPolicy#proBudgetMicros()}, ≈ $5 a month) and
 *       anyone with an admin override (which is now a budget in cents, and outranks the plan). What
 *       they have spent this calendar month (UTC) is summed from the {@code ai_call} ledger. Past
 *       the soft cap every task drops to the economy model; at 100 % AI stops until the month
 *       resets. Users only ever see this as a percentage — never dollars.</li>
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
        /** This month's budget (or free parse count) is used up. */
        EXHAUSTED,
    }

    /**
     * @param used     budget: percent spent (0–100); count: calls made this month
     * @param limit    budget: 100; count: the monthly call quota
     * @param resetsAt the start of next month (UTC), when {@code used} goes back to 0
     * @param economy  true when the soft cap has moved this call to the economy model
     */
    public record Decision(Verdict verdict, String model, boolean budgeted, int used, int limit, Instant resetsAt, boolean economy) {}

    private final AiPolicy policy;
    private final AiProvider provider;
    private final AiQuotaOverrideRepository overrideRepository;
    private final EntitlementService entitlementService;
    private final AiCallRepository callRepository;
    private final AiMeteringService metering;
    private final int freeMonthlyQuota;

    public AiBudgetService(
        AiPolicy policy,
        AiProvider provider,
        AiQuotaOverrideRepository overrideRepository,
        EntitlementService entitlementService,
        AiCallRepository callRepository,
        AiMeteringService metering,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota
    ) {
        this.policy = policy;
        this.provider = provider;
        this.overrideRepository = overrideRepository;
        this.entitlementService = entitlementService;
        this.callRepository = callRepository;
        this.metering = metering;
        this.freeMonthlyQuota = freeMonthlyQuota;
    }

    public Decision decide(String login, AiTask task) {
        Instant resets = resetsAt();
        if (policy.isDisabled(task)) {
            return new Decision(Verdict.TASK_DISABLED, null, false, 0, 0, resets, false);
        }

        // An admin override outranks the plan (a locked decision): it opens the gate AND sets the budget.
        Optional<Long> overrideMicros = overrideRepository.findById(login).map(o -> centsToMicros(o.getMonthlyBudgetCents()));
        String routed = policy.modelFor(task, provider.defaultModel());

        if (overrideMicros.isEmpty() && !entitlementService.isPro(login)) {
            if (task != AiTask.PARSE) {
                return new Decision(Verdict.PRO_REQUIRED, null, false, 0, 0, resets, false);
            }
            int used = metering.usedThisMonth(login);
            return new Decision(used >= freeMonthlyQuota ? Verdict.EXHAUSTED : Verdict.OK, routed, false, used, freeMonthlyQuota, resets, false);
        }

        long budget = overrideMicros.orElse(policy.proBudgetMicros());
        long spent = callRepository.costSince(login, monthStart());
        int pct = percent(spent, budget);
        if (spent >= budget) {
            return new Decision(Verdict.EXHAUSTED, null, true, pct, 100, resets, false);
        }
        boolean economy = policy.hasEconomyModel() && pct >= policy.getSoftCapPercent();
        return new Decision(Verdict.OK, economy ? policy.getEconomyModel().trim() : routed, true, pct, 100, resets, economy);
    }

    /** Whole percent of a budget spent, 0–100. A zero budget (an override of $0) is fully spent. */
    static int percent(long spentMicros, long budgetMicros) {
        if (budgetMicros <= 0) return 100;
        return (int) Math.min(100, Math.max(0, spentMicros * 100 / budgetMicros));
    }

    static long centsToMicros(int cents) {
        return Math.max(0, cents) * 10_000L;
    }

    /** The first instant of this calendar month, UTC — the budget window starts here. */
    static Instant monthStart() {
        return YearMonth.now(ZoneOffset.UTC).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }

    /** The first instant of next month, UTC — when the budget resets. */
    static Instant resetsAt() {
        return YearMonth.now(ZoneOffset.UTC).plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
    }
}
