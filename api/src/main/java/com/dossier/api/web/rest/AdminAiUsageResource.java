package com.dossier.api.web.rest;

import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.YearMonth;
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
 * Admin AI-usage dashboard (Phase 9.A2.1): a read-only view over the per-user monthly meter
 * ({@code ai_usage}). Shows, for a month, the configured free quota, total drafts, the number
 * of users who used AI, and the per-user counts (busiest first). ADMIN-gated. Per-user quota
 * OVERRIDES are a separate write feature (A2.2) — this view doesn't mutate anything.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminAiUsageResource {

    private static final Logger LOG = LoggerFactory.getLogger(AdminAiUsageResource.class);

    /** Cap the per-user list so a huge month can't return an unbounded payload. */
    private static final int MAX_USERS = 200;

    private final AiUsageRepository repository;
    private final int defaultQuota;

    public AdminAiUsageResource(AiUsageRepository repository, @Value("${dossier.ai.free-monthly-quota:50}") int defaultQuota) {
        this.repository = repository;
        this.defaultQuota = defaultQuota;
    }

    public record UserUsage(String login, int draftCount) {}

    public record AiUsageView(String period, int defaultQuota, long totalDrafts, long userCount, List<UserUsage> users) {}

    /** {@code GET /admin/ai-usage?period=YYYY-MM} (defaults to the current month). */
    @GetMapping("/ai-usage")
    @PreAuthorize("hasAuthority(\"" + AuthoritiesConstants.ADMIN + "\")")
    public AiUsageView getAiUsage(@RequestParam(name = "period", required = false) String period) {
        String p = (period != null && period.matches("\\d{4}-\\d{2}")) ? period : YearMonth.now().toString();
        LOG.debug("REST request for admin AI usage, period {}", p);
        List<UserUsage> users = repository
            .findByPeriodOrderByDraftCountDesc(p)
            .stream()
            .limit(MAX_USERS)
            .map(u -> new UserUsage(u.getLogin(), u.getDraftCount()))
            .toList();
        return new AiUsageView(p, defaultQuota, repository.sumDraftsForPeriod(p), repository.countByPeriod(p), users);
    }
}
