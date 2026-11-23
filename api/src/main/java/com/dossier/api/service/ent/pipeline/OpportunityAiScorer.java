package com.dossier.api.service.ent.pipeline;

import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiRouter;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.jobs.JobScoreParser;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * AI scoring for source-neutral organization candidates.
 *
 * <p>This is deliberately a narrow deep module: callers provide the already bounded prompt and
 * candidate references, while this class owns the one JOBS call, success metering, and response
 * validation. It does not know about opportunities, HTTP, licenses, consent, or match writes.</p>
 */
@Service
public class OpportunityAiScorer {

    public static final int MAX_REASON_LENGTH = 300;

    public record Result(AiResult providerResult, Map<String, JobScoreParser.Score> scores) {
        public boolean usable() {
            return !scores.isEmpty();
        }
    }

    private final AiRouter router;
    private final AiMeteringService metering;

    public OpportunityAiScorer(AiRouter router, AiMeteringService metering) {
        this.router = router;
        this.metering = metering;
    }

    /** One provider call for the complete batch; an empty batch is a no-op and is never billed. */
    public Result score(String model, String prompt, Collection<String> candidateRefs, AiCallContext context) {
        Set<String> allowed = normalizeRefs(candidateRefs);
        if (allowed.isEmpty()) return new Result(null, Map.of());
        AiResult result = router.generate(AiTask.JOBS, model, prompt, "", context);
        // The provider response is billable even when its JSON is malformed, matching the personal
        // matcher contract. The caller decides whether an unusable response releases match usage.
        metering.recordWithContext(AiTask.JOBS, result, context);
        return new Result(result, JobScoreParser.parse(result.text(), allowed, MAX_REASON_LENGTH));
    }

    public static Set<String> normalizeRefs(Collection<String> refs) {
        if (refs == null) return Set.of();
        return refs.stream()
            .filter(ref -> ref != null && !ref.isBlank())
            .map(ref -> ref.trim().toLowerCase(Locale.ROOT).replaceAll("[\\[\\]]", ""))
            .filter(ref -> !ref.isBlank())
            .collect(Collectors.toCollection(LinkedHashSet::new));
    }
}
