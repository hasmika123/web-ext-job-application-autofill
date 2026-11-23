package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.dossier.api.service.AiMeteringService;
import com.dossier.api.service.ai.AiCallContext;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiRouter;
import com.dossier.api.service.ai.AiTask;
import java.util.List;
import org.junit.jupiter.api.Test;

class OpportunityAiScorerTest {

    private final AiRouter router = mock(AiRouter.class);
    private final AiMeteringService metering = mock(AiMeteringService.class);
    private final OpportunityAiScorer scorer = new OpportunityAiScorer(router, metering);
    private final AiCallContext context = AiCallContext.organization("actor", "beneficiary", 7L, "ai.job_matching", 11L);

    @Test
    void scoresOnlyRequestedReferencesAndBoundsTheModelOutput() {
        String longReason = "x".repeat(350);
        AiResult result = new AiResult(
            "{\"scores\":[{" +
                "\"id\":\"[J1]\",\"score\":140,\"why\":\"" + longReason + "\"},{" +
                "\"id\":\"j2\",\"score\":-5,\"why\":\"low\"},{" +
                "\"id\":\"j9\",\"score\":80,\"why\":\"unknown\"}]}",
            "model",
            10,
            0,
            2,
            "gemini",
            50
        );
        when(router.generate(eq(AiTask.JOBS), eq("model"), eq("prompt"), eq(""), eq(context))).thenReturn(result);

        OpportunityAiScorer.Result scored = scorer.score("model", "prompt", List.of("[j1]", "j2"), context);

        assertThat(scored.scores()).containsKeys("j1", "j2").doesNotContainKey("j9");
        assertThat(scored.scores().get("j1").score()).isEqualTo(100);
        assertThat(scored.scores().get("j1").why()).hasSize(300);
        assertThat(scored.scores().get("j2").score()).isZero();
        verify(metering).recordWithContext(AiTask.JOBS, result, context);
    }

    @Test
    void emptyCandidateBatchNeverCallsOrMetersTheProvider() {
        OpportunityAiScorer.Result scored = scorer.score("model", "prompt", List.of(), context);

        assertThat(scored.providerResult()).isNull();
        assertThat(scored.scores()).isEmpty();
        verifyNoInteractions(router, metering);
    }
}
