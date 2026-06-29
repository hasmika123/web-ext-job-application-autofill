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
 * Admin management of per-user AI quota overrides (Phase 9.A2.2). Set/clear are audited; the
 * read path ({@link AiDraftService}) consults the repository directly. The target user must
 * exist. Quota is clamped to a sane range so a typo can't grant effectively-unlimited or
 * negative quota.
 */
@Service
@Transactional
public class AdminAiQuotaService {

    static final int MAX_QUOTA = 100_000;

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
        return overrideRepository.findById(login.toLowerCase()).map(AiQuotaOverride::getMonthlyQuota);
    }

    public int setOverride(String login, int quota) {
        if (quota < 0 || quota > MAX_QUOTA) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Quota must be between 0 and " + MAX_QUOTA + ".");
        }
        String target = requireUser(login);
        AiQuotaOverride o = overrideRepository.findById(target).orElseGet(AiQuotaOverride::new);
        o.setLogin(target);
        o.setMonthlyQuota(quota);
        overrideRepository.save(o);
        auditService.record(AdminAuditService.AI_QUOTA_SET, AdminAuditService.TARGET_USER, target, null, "monthlyQuota=" + quota);
        return quota;
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
