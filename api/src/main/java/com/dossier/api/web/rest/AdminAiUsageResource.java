package com.dossier.api.web.rest;

import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiSpendRow;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ai.AiPolicy;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Admin AI-usage dashboard (Phase 9.A2.1; since 13.1c it reports <b>cost</b>, from the
 * {@code ai_call} ledger). For a UTC calendar month: what server AI cost in total, how many calls,
 * how many users, the spend per user (dearest first, with each user's share of the Pro budget) and
 * per task. This is the admin's view of real money — the product only ever shows users a percent.
 * ADMIN-gated and read-only; per-user budget OVERRIDES are a separate write feature (A2.2).
 */
@RestController
@RequestMapping("/api/admin")
public class AdminAiUsageResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAiUsageResource.class);

    /** Cap the per-user list so a huge month can't return an unbounded payload. */
    private static final int MAX_USERS = 200;

    private final AiCallRepository callRepository;
    private final AiPolicy policy;
    private final int freeMonthlyQuota;

    public AdminAiUsageResource(
        AiCallRepository callRepository,
        AiPolicy policy,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota
    ) {
        this.callRepository = callRepository;
        this.policy = policy;
        this.freeMonthlyQuota = freeMonthlyQuota;
    }

    /** One user's month. {@code login} is null for spend kept from deleted accounts. */
    public record UserSpend(String login, long calls, long costMicros, int percentOfProBudget) {}

    public record TaskSpend(String task, long calls, long costMicros) {}

    public record AiUsageView(
        String period,
        long proBudgetMicros,
        int freeParsesPerMonth,
        long totalCostMicros,
        long totalCalls,
        long userCount,
        List<UserSpend> users,
        List<TaskSpend> tasks
    ) {}

    /** {@code GET /admin/ai-usage?period=YYYY-MM} (defaults to the current UTC month). */
    @GetMapping("/ai-usage")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public AiUsageView getAiUsage(@RequestParam(name = "period", required = false) String period) {
        YearMonth month = parse(period);
        Instant from = month.atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant to = month.plusMonths(1).atDay(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        LOG.debug("REST request for admin AI usage, period {}", month);

        long budget = policy.proBudgetMicros();
        List<AiSpendRow> byLogin = callRepository.spendByLogin(from, to);
        List<UserSpend> users = byLogin
            .stream()
            .limit(MAX_USERS)
            .map(r -> new UserSpend(r.key(), n(r.calls()), n(r.costMicros()), share(n(r.costMicros()), budget)))
            .toList();
        List<TaskSpend> tasks = callRepository
            .spendByTask(from, to)
            .stream()
            .map(r -> new TaskSpend(r.key(), n(r.calls()), n(r.costMicros())))
            .toList();

        long totalCost = byLogin.stream().mapToLong(r -> n(r.costMicros())).sum();
        long totalCalls = byLogin.stream().mapToLong(r -> n(r.calls())).sum();
        long userCount = byLogin.stream().filter(r -> r.key() != null).count();
        return new AiUsageView(month.toString(), budget, freeMonthlyQuota, totalCost, totalCalls, userCount, users, tasks);
    }

    static YearMonth parse(String period) {
        if (period != null && period.matches("\\d{4}-\\d{2}")) {
            try {
                return YearMonth.parse(period);
            } catch (Exception e) {
                // fall through to the current month
            }
        }
        return YearMonth.now(ZoneOffset.UTC);
    }

    /** A user's spend as a whole percent of the Pro budget — can pass 100 for an override above it. */
    static int share(long costMicros, long budgetMicros) {
        if (budgetMicros <= 0) return 0;
        return (int) Math.min(Integer.MAX_VALUE, costMicros * 100 / budgetMicros);
    }

    private static long n(Long v) {
        return v == null ? 0L : v;
    }
}
