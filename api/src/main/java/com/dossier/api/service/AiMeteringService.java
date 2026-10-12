package com.dossier.api.service;

import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.service.ai.AiErrorKind;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Counts and prices every AI call (Phase 13.1a) — the one place {@link AiDraftService},
 * {@link AiResumeParseService} and the AI router go to after the provider answers (or fails).
 *
 * <p>Two records per successful call: the monthly call count in {@code ai_usage} (still what the per-call
 * quota reads, until 13.1b replaces it with a cost budget), bumped with one atomic upsert so concurrent
 * calls can't lose a count; and a row in the {@code ai_call} ledger with the provider that served it, how
 * long it took, the tokens the provider billed and what they cost at the configured rates ({@link AiPricing}).
 * A FAILED attempt writes only a ledger row ({@code success = false}, cost 0, a short error code) so the admin
 * page can show errors; it never counts toward a quota or a budget.
 */
@Service
@Transactional
public class AiMeteringService {

    private static final Logger LOG = LoggerFactory.getLogger(AiMeteringService.class);

    private final AiUsageRepository usageRepository;
    private final AiCallRepository callRepository;
    private final AiPricing pricing;
    /** Models already warned about, so an unpriced model logs once, not on every call. */
    private final Set<String> unpricedWarned = ConcurrentHashMap.newKeySet();

    public AiMeteringService(AiUsageRepository usageRepository, AiCallRepository callRepository, AiPricing pricing) {
        this.usageRepository = usageRepository;
        this.callRepository = callRepository;
        this.pricing = pricing;
    }

    /** Calls this login has made this calendar month (server clock). */
    @Transactional(readOnly = true)
    public int usedThisMonth(String login) {
        return usageRepository.findByLoginAndPeriod(login, period()).map(AiUsage::getDraftCount).orElse(0);
    }

    /**
     * Record one successful call: count it (an admin {@code probe} is not counted - it is not a user's AI),
     * and write it to the ledger at what it cost.
     *
     * @return this login's call count for the month, including this one
     */
    public int record(String login, AiTask task, AiResult result) {
        if (task != AiTask.PROBE) usageRepository.increment(login, period());

        if (!pricing.isPriced(result.model()) && unpricedWarned.add(String.valueOf(result.model()))) {
            LOG.warn("No AI price configured for model '{}' — costing it at the fallback rate. Add dossier.ai.pricing.models[{}] or an ai.price.{}.* setting", result.model(), result.model(), result.model());
        }
        AiCall call = new AiCall();
        call.setLogin(login);
        call.setTask(task.wire());
        call.setModel(result.model() == null || result.model().isBlank() ? "unknown" : truncate(result.model(), 80));
        call.setInputTokens(result.inputTokens());
        call.setCachedTokens(result.cachedTokens());
        call.setOutputTokens(result.outputTokens());
        call.setCostMicros(pricing.costMicros(result.model(), result.inputTokens(), result.cachedTokens(), result.outputTokens()));
        call.setProvider(result.provider() == null || result.provider().isBlank() ? "gemini" : truncate(result.provider(), 20));
        call.setLatencyMs(result.latencyMs());
        call.setSuccess(true);
        callRepository.save(call);

        return usedThisMonth(login);
    }

    /**
     * Record one FAILED attempt: no count, no cost, a short error code. Runs in its OWN transaction so the
     * caller's rollback (a refused request) never loses the fact that the provider failed.
     *
     * @param login null for a job with no signed-in user (the nightly jobs)
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(String login, AiTask task, String provider, String model, AiErrorKind kind, int latencyMs) {
        AiCall call = new AiCall();
        call.setLogin(login);
        call.setTask(task.wire());
        call.setModel(model == null || model.isBlank() ? "unknown" : truncate(model, 80));
        call.setCostMicros(0);
        call.setProvider(provider == null || provider.isBlank() ? "unknown" : truncate(provider, 20));
        call.setLatencyMs(latencyMs);
        call.setSuccess(false);
        call.setErrorKind(kind == null ? AiErrorKind.UNKNOWN.name() : kind.name());
        callRepository.save(call);
    }

    static String period() {
        return YearMonth.now(ZoneOffset.UTC).toString(); // YYYY-MM, UTC — the same month the budget uses
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
