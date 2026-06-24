package com.dossier.api.service;

import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import java.time.YearMonth;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The metered server-side AI drafting proxy (Phase 5.1). Gates each request on:
 * (1) the feature being enabled + a provider configured, (2) the user's explicit
 * consent (the free-tier inputs may be used by the provider — opt-in only), and
 * (3) the per-user monthly free quota. Only a successful draft consumes quota.
 *
 * The provider key never reaches the client — this server holds it and proxies.
 * Server-side answer caching by question_hash (Phase 5.3) is delegated to
 * {@link AiAnswerCacheService}: a cache hit returns instantly without touching the
 * provider or the monthly quota.
 */
@Service
@Transactional
public class AiDraftService {

    private static final Logger LOG = LoggerFactory.getLogger(AiDraftService.class);

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        QUOTA_EXCEEDED,
        ERROR,
    }

    public record Result(Status status, String answer, int used, int quota, boolean cached) {}

    private final AiProvider provider;
    private final AiUsageRepository usageRepository;
    private final AiAnswerCacheService answerCache;
    private final boolean enabled;
    private final int freeMonthlyQuota;
    private final String model;

    public AiDraftService(
        AiProvider provider,
        AiUsageRepository usageRepository,
        AiAnswerCacheService answerCache,
        @Value("${dossier.ai.enabled:false}") boolean enabled,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota,
        @Value("${dossier.ai.model:}") String model
    ) {
        this.provider = provider;
        this.usageRepository = usageRepository;
        this.answerCache = answerCache;
        this.enabled = enabled;
        this.freeMonthlyQuota = freeMonthlyQuota;
        this.model = model;
    }

    public Result draft(String question, String context, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, 0, 0, false);
        }
        // Opt-in: the free-tier provider may use inputs to improve its services, so we
        // only proxy when the user has explicitly consented (enforced again here).
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, 0, freeMonthlyQuota, false);
        }

        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        String period = YearMonth.now().toString(); // YYYY-MM, server clock
        int quota = freeMonthlyQuota;

        AiUsage usage = usageRepository.findByLoginAndPeriod(login, period).orElseGet(() -> {
            AiUsage u = new AiUsage();
            u.setLogin(login);
            u.setPeriod(period);
            u.setDraftCount(0);
            return u;
        });

        // Cache hit (Phase 5.3): identical question already answered for this user → return it
        // for free. Checked BEFORE the quota gate, so a repeat never costs quota or gets blocked.
        String hash = AiAnswerCacheService.questionHash(question);
        var cached = answerCache.lookup(login, hash);
        if (cached.isPresent()) {
            return new Result(Status.OK, cached.get(), usage.getDraftCount(), quota, true);
        }

        if (usage.getDraftCount() >= quota) {
            return new Result(Status.QUOTA_EXCEEDED, null, usage.getDraftCount(), quota, false);
        }

        String answer;
        try {
            answer = provider.draft(question, context);
        } catch (AiProviderException e) {
            // Provider/transport failure — don't charge quota; report a generic error.
            LOG.warn("AI draft failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, usage.getDraftCount(), quota, false);
        }

        usage.setDraftCount(usage.getDraftCount() + 1); // only a real draft costs quota
        usageRepository.save(usage);
        answerCache.store(login, hash, answer, model); // reuse next time (own tx; race-safe)
        return new Result(Status.OK, answer, usage.getDraftCount(), quota, false);
    }
}
