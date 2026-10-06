package com.dossier.api.service;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The metered server-side AI proxy for short tasks (Phase 5.1): drafting, option picks, field
 * mapping and job enrichment. Gates each request on (1) the feature being enabled + a provider
 * configured, (2) the {@link AiBudgetService} decision — kill switch, <b>Pro</b> (Phase 12.4), the
 * monthly budget — and (3) the user's explicit consent (the free-tier inputs may be used by the
 * provider — opt-in only). Only a successful provider call costs anything.
 *
 * <p>The provider key never reaches the client — this server holds it and proxies.
 * Server-side answer caching by question_hash (Phase 5.3) is delegated to
 * {@link AiAnswerCacheService}: a cache hit returns instantly without touching the
 * provider or the budget.
 *
 * <p><b>Pro gate (12.4).</b> Server AI is a Pro feature: Free users bring their own key,
 * which the extension already prefers when present, so a {@code PRO_REQUIRED} here is a
 * nudge rather than a dead end. <b>An admin override outranks the plan gate</b> (a locked
 * decision). Resume parsing is deliberately NOT gated — see {@link AiResumeParseService}.
 *
 * <p><b>Tasks (13.1a) and budget (13.1b).</b> Each request names its {@link AiTask}, so it gets
 * instructions written for it, is cached under its own key, runs on the model the policy routes it
 * to (or the economy model past the soft cap), and is recorded as itself in the {@code ai_call}
 * ledger ({@link AiMeteringService}) — which is what the budget is measured against.
 */
@Service
@Transactional
public class AiDraftService {

    private static final Logger LOG = LoggerFactory.getLogger(AiDraftService.class);

    public enum Status {
        OK,
        /** Server AI is off, or this task's kill switch is on. */
        DISABLED,
        CONSENT_REQUIRED,
        /** Free plan and no admin override — server AI is Pro (Phase 12.4). */
        PRO_REQUIRED,
        /** This month's AI is used up (13.1b: the budget; resets at {@code resetsAt}). */
        QUOTA_EXCEEDED,
        ERROR,
    }

    /**
     * @param used     percent of the month's budget spent (or calls made, for a count-metered user)
     * @param quota    100 for a budget, else the monthly call quota
     * @param resetsAt when {@code used} goes back to 0
     */
    public record Result(Status status, String answer, int used, int quota, boolean cached, Instant resetsAt) {}

    private final AiProvider provider;
    private final AiMeteringService metering;
    private final AiBudgetService budget;
    private final AiAnswerCacheService answerCache;
    private final boolean enabled;

    public AiDraftService(
        AiProvider provider,
        AiMeteringService metering,
        AiBudgetService budget,
        AiAnswerCacheService answerCache,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.metering = metering;
        this.budget = budget;
        this.answerCache = answerCache;
        this.enabled = enabled;
    }

    /** A draft — what every caller before 13.1a meant. */
    public Result draft(String question, String context, boolean consent) {
        return run(AiTask.DRAFT, question, context, consent);
    }

    public Result run(AiTask task, String question, String context, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, 0, 0, false, null);
        }

        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );

        AiBudgetService.Decision d = budget.decide(login, task);
        // PRO_REQUIRED is decided BEFORE consent: telling a Free user "we need your consent" and then
        // "…and also this is Pro" is two refusals for one request. Lead with the real one.
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return new Result(Status.DISABLED, null, 0, 0, false, null);
            }
            case PRO_REQUIRED -> {
                return new Result(Status.PRO_REQUIRED, null, 0, 0, false, null);
            }
            default -> {}
        }

        // Opt-in: the free-tier provider may use inputs to improve its services, so we
        // only proxy when the user has explicitly consented (enforced again here).
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, 0, d.limit(), false, d.resetsAt());
        }

        // Cache hit (Phase 5.3): identical question already answered for this user → return it
        // for free. Checked BEFORE the budget, so a repeat never costs anything or gets blocked.
        // Non-draft tasks are keyed apart from drafts (13.1a): the same text asked as a pick and
        // as a draft wants two different kinds of answer.
        String hash = AiAnswerCacheService.questionHash(task == AiTask.DRAFT ? question : task.wire() + ":" + question);
        var cached = answerCache.lookup(login, hash);
        if (cached.isPresent()) {
            return new Result(Status.OK, cached.get(), d.used(), d.limit(), true, d.resetsAt());
        }

        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) {
            return new Result(Status.QUOTA_EXCEEDED, null, d.used(), d.limit(), false, d.resetsAt());
        }

        AiResult result;
        try {
            result = provider.generate(task, d.model(), question, context);
        } catch (AiProviderException e) {
            // Provider/transport failure — nothing is charged; report a generic error.
            LOG.warn("AI {} failed for user: {}", task.wire(), e.getMessage());
            return new Result(Status.ERROR, null, d.used(), d.limit(), false, d.resetsAt());
        }

        metering.record(login, task, result); // only a real call costs anything
        answerCache.store(login, hash, result.text(), result.model()); // reuse next time (own tx; race-safe)
        AiBudgetService.Decision after = budget.decide(login, task); // the meter, including this call
        return new Result(Status.OK, result.text(), after.used(), after.limit(), false, after.resetsAt());
    }
}
