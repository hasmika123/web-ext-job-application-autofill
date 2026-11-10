package com.dossier.api.service.ai;

/**
 * One successful provider call (Phase 13.1a): the text, the model that actually answered, and
 * what it consumed. Token counts are what the provider reports for billing — without them there
 * is nothing to meter by cost, which is what 13.1b's monthly budget needs.
 *
 * @param inputTokens  prompt tokens billed at the full input rate (cached ones excluded)
 * @param cachedTokens prompt tokens served from the provider's context cache (billed far lower)
 * @param outputTokens generated tokens, including any "thinking" tokens (billed as output)
 * @param provider     the provider id that served the call ({@code gemini}); blank when the adapter was called
 *                     directly - the router stamps it (I1.10)
 * @param latencyMs    wall-clock milliseconds the winning attempt took; 0 when unknown
 */
public record AiResult(String text, String model, int inputTokens, int cachedTokens, int outputTokens, String provider, int latencyMs) {
    public AiResult {
        inputTokens = Math.max(0, inputTokens);
        cachedTokens = Math.max(0, cachedTokens);
        outputTokens = Math.max(0, outputTokens);
        provider = provider == null ? "" : provider;
        latencyMs = Math.max(0, latencyMs);
    }

    /** The pre-I1.10 shape: no provider, no latency. */
    public AiResult(String text, String model, int inputTokens, int cachedTokens, int outputTokens) {
        this(text, model, inputTokens, cachedTokens, outputTokens, "", 0);
    }

    /** The same result stamped with the provider that served it and how long it took. */
    public AiResult withProvider(String providerId, int latencyMs) {
        return new AiResult(text, model, inputTokens, cachedTokens, outputTokens, providerId, latencyMs);
    }
}
