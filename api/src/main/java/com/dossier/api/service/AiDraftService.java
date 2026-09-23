package com.dossier.api.service;

import com.dossier.api.repository.AiQuotaOverrideRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The metered server-side AI drafting proxy (Phase 5.1). Gates each request on:
 * (1) the feature being enabled + a provider configured, (2) <b>Pro</b> (Phase 12.4),
 * (3) the user's explicit consent (the free-tier inputs may be used by the provider —
 * opt-in only), and (4) the monthly quota. Only a successful draft consumes quota.
 *
 * <p>The provider key never reaches the client — this server holds it and proxies.
 * Server-side answer caching by question_hash (Phase 5.3) is delegated to
 * {@link AiAnswerCacheService}: a cache hit returns instantly without touching the
 * provider or the monthly quota.
 *
 * <p><b>Pro gate (12.4).</b> Server AI is a Pro feature: Free users bring their own key,
 * which the extension already prefers when present, so a {@code PRO_REQUIRED} here is a
 * nudge rather than a dead end. Two things ride this endpoint besides drafting — field
 * mapping and constrained option picks — so gating here gates all three. <b>An admin
 * quota override outranks the plan gate</b> (a locked decision): if someone has been
 * granted a quota by hand, that grant is the entitlement. Resume parsing is deliberately
 * NOT gated — see {@link AiResumeParseService}; it is how a profile builds itself, and it
 * is the one free server-AI exception.
 *
 * <p><b>Tasks (13.1a).</b> Each request names its {@link AiTask} — draft, pick, map or enrich — so
 * it gets instructions written for it, is cached under its own key, and is recorded as that kind
 * in the {@code ai_call} ledger ({@link AiMeteringService}) with the tokens it cost.
 */
@Service
@Transactional
public class AiDraftService {

    private static final Logger LOG = LoggerFactory.getLogger(AiDraftService.class);

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        /** Free plan and no admin override — server AI is Pro (Phase 12.4). */
        PRO_REQUIRED,
        QUOTA_EXCEEDED,
        ERROR,
    }

    public record Result(Status status, String answer, int used, int quota, boolean cached) {}

    private final AiProvider provider;
    private final AiMeteringService metering;
    private final AiQuotaOverrideRepository quotaOverrideRepository;
    private final AiAnswerCacheService answerCache;
    private final EntitlementService entitlementService;
    private final boolean enabled;
    private final int freeMonthlyQuota;
    private final int proMonthlyQuota;
    private final String model;

    public AiDraftService(
        AiProvider provider,
        AiMeteringService metering,
        AiQuotaOverrideRepository quotaOverrideRepository,
        AiAnswerCacheService answerCache,
        EntitlementService entitlementService,
        @Value("${dossier.ai.enabled:false}") boolean enabled,
        @Value("${dossier.ai.free-monthly-quota:50}") int freeMonthlyQuota,
        @Value("${dossier.ai.pro-monthly-quota:2000}") int proMonthlyQuota,
        @Value("${dossier.ai.model:}") String model
    ) {
        this.provider = provider;
        this.metering = metering;
        this.quotaOverrideRepository = quotaOverrideRepository;
        this.answerCache = answerCache;
        this.entitlementService = entitlementService;
        this.enabled = enabled;
        this.freeMonthlyQuota = freeMonthlyQuota;
        this.proMonthlyQuota = proMonthlyQuota;
        this.model = model;
    }

    /** A draft — what every caller before 13.1a meant. */
    public Result draft(String question, String context, boolean consent) {
        return run(AiTask.DRAFT, question, context, consent);
    }

    public Result run(AiTask task, String question, String context, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, 0, 0, false);
        }

        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );

        // Per-user override (Phase 9.A2.2) wins over both the plan gate and the default quota.
        Optional<Integer> override = quotaOverrideRepository
            .findById(login)
            .map(com.dossier.api.domain.AiQuotaOverride::getMonthlyQuota);
        boolean pro = entitlementService.isPro(login);

        // Checked BEFORE consent: telling a Free user "we need your consent" and then "…and
        // also this is Pro" is two refusals for one request. Lead with the real one.
        if (!pro && override.isEmpty()) {
            return new Result(Status.PRO_REQUIRED, null, 0, 0, false);
        }

        int quota = override.orElse(pro ? proMonthlyQuota : freeMonthlyQuota);

        // Opt-in: the free-tier provider may use inputs to improve its services, so we
        // only proxy when the user has explicitly consented (enforced again here).
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, 0, quota, false);
        }

        int used = metering.usedThisMonth(login);

        // Cache hit (Phase 5.3): identical question already answered for this user → return it
        // for free. Checked BEFORE the quota gate, so a repeat never costs quota or gets blocked.
        // Non-draft tasks are keyed apart from drafts (13.1a): the same text asked as a pick and
        // as a draft wants two different kinds of answer.
        String hash = AiAnswerCacheService.questionHash(task == AiTask.DRAFT ? question : task.wire() + ":" + question);
        var cached = answerCache.lookup(login, hash);
        if (cached.isPresent()) {
            return new Result(Status.OK, cached.get(), used, quota, true);
        }

        if (used >= quota) {
            return new Result(Status.QUOTA_EXCEEDED, null, used, quota, false);
        }

        AiResult result;
        try {
            result = provider.generate(task, question, context);
        } catch (AiProviderException e) {
            // Provider/transport failure — don't charge quota; report a generic error.
            LOG.warn("AI {} failed for user: {}", task.wire(), e.getMessage());
            return new Result(Status.ERROR, null, used, quota, false);
        }

        used = metering.record(login, task, result); // only a real call costs quota
        answerCache.store(login, hash, result.text(), result.model() != null ? result.model() : model); // reuse next time (own tx; race-safe)
        return new Result(Status.OK, result.text(), used, quota, false);
    }
}
