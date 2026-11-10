package com.dossier.api.service.ai;

/**
 * The env-level (deployment) AI settings the service layer needs, without the secret. Built once from
 * {@code AiProperties} by {@code AiConfiguration} (the config layer may not be reached from services, so
 * this record carries the values across). {@code enabled} is the deployment MASTER switch
 * ({@code DOSSIER_AI_ENABLED}): runtime settings can lower it, never raise it. The API key is deliberately
 * NOT here - it goes straight to the provider registry and nowhere else.
 */
public record AiEnv(boolean enabled, String provider, String baseUrl, String model, int maxOutputTokens, int parseMaxOutputTokens) {
    public AiEnv {
        provider = provider == null ? "" : provider.trim().toLowerCase(java.util.Locale.ROOT);
        baseUrl = baseUrl == null ? "" : baseUrl.trim();
        model = model == null ? "" : model.trim();
    }

    /** Defaults as {@code AiProperties} declares them, off - for tests. */
    public static AiEnv defaults() {
        return new AiEnv(false, "gemini", "https://generativelanguage.googleapis.com/v1beta", "gemini-2.5-flash-lite", 400, 4000);
    }
}
