package com.dossier.api.service;

import com.dossier.api.domain.AiCall;
import com.dossier.api.domain.AiUsage;
import com.dossier.api.repository.AiCallRepository;
import com.dossier.api.repository.AiUsageRepository;
import com.dossier.api.service.ai.AiPricing;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import java.time.YearMonth;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Counts and prices every successful AI call (Phase 13.1a) — the one place both
 * {@link AiDraftService} and {@link AiResumeParseService} go to after the provider answers.
 *
 * <p>Two records per call: the monthly call count in {@code ai_usage} (still what the per-call
 * quota reads, until 13.1b replaces it with a cost budget), bumped with one atomic upsert so
 * concurrent calls can't lose a count; and a row in the {@code ai_call} ledger with the tokens the
 * provider billed and what they cost at the configured rates ({@link AiPricing}).
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
     * Record one successful call: count it, and write it to the ledger at what it cost.
     *
     * @return this login's call count for the month, including this one
     */
    public int record(String login, AiTask task, AiResult result) {
        usageRepository.increment(login, period());

        if (!pricing.isPriced(result.model()) && unpricedWarned.add(String.valueOf(result.model()))) {
            LOG.warn("No AI price configured for model '{}' — costing it at the fallback rate. Add dossier.ai.pricing.models[{}]", result.model(), result.model());
        }
        AiCall call = new AiCall();
        call.setLogin(login);
        call.setTask(task.wire());
        call.setModel(result.model() == null || result.model().isBlank() ? "unknown" : truncate(result.model(), 80));
        call.setInputTokens(result.inputTokens());
        call.setCachedTokens(result.cachedTokens());
        call.setOutputTokens(result.outputTokens());
        call.setCostMicros(pricing.costMicros(result.model(), result.inputTokens(), result.cachedTokens(), result.outputTokens()));
        callRepository.save(call);

        return usedThisMonth(login);
    }

    static String period() {
        return YearMonth.now().toString(); // YYYY-MM, server clock
    }

    private static String truncate(String s, int max) {
        return s.length() > max ? s.substring(0, max) : s;
    }
}
