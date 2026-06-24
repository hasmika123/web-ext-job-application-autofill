package com.dossier.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the server-side metered AI answer-drafting proxy (Phase 5.1).
 *
 * Provider-agnostic on purpose: {@code provider}, {@code model}, the API key, and the
 * monthly free quota are all env-config so the backend can switch from Google Gemini
 * to Anthropic/OpenAI/etc. without a code change — the same "endpoint is config, not a
 * constant" rule the storage and tracking seams follow.
 *
 * Bound under {@code dossier.ai.*} (NOT {@code application.*} — JHipster owns that
 * prefix with {@code ignoreUnknownFields=false}, so stray keys there fail startup).
 *
 * The API key lives in the server's env only; it never ships in the extension bundle.
 */
@ConfigurationProperties(prefix = "dossier.ai")
public class AiProperties {

    /** Master switch for the server-side AI proxy. Off unless a key is configured. */
    private boolean enabled = false;

    /** Which provider implementation to use. Currently: "gemini". */
    private String provider = "gemini";

    /** Provider base URL (no trailing slash). Gemini: the Generative Language API. */
    private String baseUrl = "https://generativelanguage.googleapis.com/v1beta";

    /** Model id. Gemini free-tier examples: gemini-2.0-flash, gemini-2.0-flash-lite. */
    private String model = "gemini-2.0-flash";

    /** Provider API key — env only, never bundled. Blank ⇒ the proxy reports "disabled". */
    private String apiKey = "";

    /** Free drafts per user per calendar month before the metered tier cuts off. */
    private int freeMonthlyQuota = 50;

    /** Cap on generated answer length. */
    private int maxOutputTokens = 400;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getProvider() {
        return provider;
    }

    public void setProvider(String provider) {
        this.provider = provider;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public int getFreeMonthlyQuota() {
        return freeMonthlyQuota;
    }

    public void setFreeMonthlyQuota(int freeMonthlyQuota) {
        this.freeMonthlyQuota = freeMonthlyQuota;
    }

    public int getMaxOutputTokens() {
        return maxOutputTokens;
    }

    public void setMaxOutputTokens(int maxOutputTokens) {
        this.maxOutputTokens = maxOutputTokens;
    }
}
