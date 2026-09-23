package com.dossier.api.service;

import com.dossier.api.domain.AiQuotaOverride;
import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.repository.UserRepository;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Admin management of per-user AI overrides (Phase 9.A2.2). Since 13.1b an override is a monthly
 * AI <b>budget in US cents</b> — server AI is metered by cost now — and it outranks the plan: it
 * gives a Free user server AI, or gives anyone a different budget. Set/clear are audited; the read
 * path ({@link AiBudgetService}) consults the repository directly. The target user must exist, and
 * the budget is clamped so a typo can't grant an effectively unlimited or a negative one.
 */
@Service
@Transactional
public class AdminAiQuotaService {

    /** $1,000 a month — far past any real use; the ceiling exists to catch typos. */
    static final int MAX_BUDGET_CENTS = 100_000;

    private final AiQuotaOverrideRepository overrideRepository;
    private final UserRepository userRepository;
    private final AdminAuditService auditService;

    public AdminAiQuotaService(
        AiQuotaOverrideRepository overrideRepository,
        UserRepository userRepository,
        AdminAuditService auditService
    ) {
        this.overrideRepository = overrideRepository;
        this.userRepository = userRepository;
        this.auditService = auditService;
    }

    @Transactional(readOnly = true)
    public Optional<Integer> getOverride(String login) {
        return overrideRepository.findById(login.toLowerCase()).map(AiQuotaOverride::getMonthlyBudgetCents);
    }

    public int setOverride(String login, int budgetCents) {
        if (budgetCents < 0 || budgetCents > MAX_BUDGET_CENTS) {
            throw new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "The monthly AI budget must be between $0 and $" + (MAX_BUDGET_CENTS / 100) + "."
            );
        }
        String target = requireUser(login);
        AiQuotaOverride o = overrideRepository.findById(target).orElseGet(AiQuotaOverride::new);
        o.setLogin(target);
        o.setMonthlyBudgetCents(budgetCents);
        overrideRepository.save(o);
        auditService.record(AdminAuditService.AI_QUOTA_SET, AdminAuditService.TARGET_USER, target, null, "monthlyBudgetCents=" + budgetCents);
        return budgetCents;
    }

    public void clearOverride(String login) {
        String target = requireUser(login);
        if (overrideRepository.existsById(target)) {
            overrideRepository.deleteById(target);
            auditService.record(AdminAuditService.AI_QUOTA_CLEAR, AdminAuditService.TARGET_USER, target);
        }
    }

    private String requireUser(String login) {
        return userRepository
            .findOneByLogin(login.toLowerCase())
            .map(u -> u.getLogin())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such user"));
    }
}
