package com.dossier.api.service.ai;

/**
 * One successful provider call (Phase 13.1a): the text, the model that actually answered, and
 * what it consumed. Token counts are what the provider reports for billing — without them there
 * is nothing to meter by cost, which is what 13.1b's monthly budget needs.
 *
 * @param inputTokens  prompt tokens billed at the full input rate (cached ones excluded)
 * @param cachedTokens prompt tokens served from the provider's context cache (billed far lower)
 * @param outputTokens generated tokens, including any "thinking" tokens (billed as output)
 */
public record AiResult(String text, String model, int inputTokens, int cachedTokens, int outputTokens) {
    public AiResult {
        inputTokens = Math.max(0, inputTokens);
        cachedTokens = Math.max(0, cachedTokens);
        outputTokens = Math.max(0, outputTokens);
    }
}
