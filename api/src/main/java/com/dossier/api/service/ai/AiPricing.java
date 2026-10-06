package com.dossier.api.service.ai;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * What each model costs, in US dollars per million tokens (Phase 13.1a) — so every call can be
 * recorded at what it cost, and 13.1b can meter a monthly budget by cost instead of by count.
 *
 * <p>Bound under {@code dossier.ai.pricing.*} and kept in the service layer (like
 * {@code StripeProperties}) because the metering service reads it. A served model version matches
 * the LONGEST configured name it starts with ({@code gemini-2.5-flash-lite-001} →
 * {@code gemini-2.5-flash-lite}). Model names contain dots, so they are written in brackets:
 * {@code dossier.ai.pricing.models[gemini-2.5-flash].output=2.50}.
 *
 * <p>The defaults are Google's published paid-tier list prices for text (checked 2026-09-22 against
 * ai.google.dev/gemini-api/docs/pricing); check again whenever the model changes. The 3.6–3.8 Flash
 * rates are introductory and double on 2027-01-01 — update them then.
 */
@ConfigurationProperties(prefix = "dossier.ai.pricing")
public class AiPricing {

    private Map<String, Rate> models = defaults();

    /** Used for a model with no entry — the dearest Flash's rates, so an unpriced model is
     *  over-counted rather than treated as free. */
    private Rate fallback = new Rate(1.50, 0.15, 9.00);

    /** USD per million tokens. {@code cachedInput} is the rate for prompt tokens served from the
     *  provider's context cache. */
    public static class Rate {

        private double input;
        private double cachedInput;
        private double output;

        public Rate() {}

        public Rate(double input, double cachedInput, double output) {
            this.input = input;
            this.cachedInput = cachedInput;
            this.output = output;
        }

        public double getInput() {
            return input;
        }

        public void setInput(double input) {
            this.input = input;
        }

        public double getCachedInput() {
            return cachedInput;
        }

        public void setCachedInput(double cachedInput) {
            this.cachedInput = cachedInput;
        }

        public double getOutput() {
            return output;
        }

        public void setOutput(double output) {
            this.output = output;
        }
    }

    private static Map<String, Rate> defaults() {
        Map<String, Rate> m = new LinkedHashMap<>();
        m.put("gemini-2.5-flash-lite", new Rate(0.10, 0.01, 0.40));
        m.put("gemini-2.5-flash", new Rate(0.30, 0.03, 2.50));
        m.put("gemini-3.1-flash-lite", new Rate(0.25, 0.025, 1.50));
        m.put("gemini-3.5-flash-lite", new Rate(0.30, 0.03, 2.50));
        m.put("gemini-3.5-flash", new Rate(1.50, 0.15, 9.00));
        m.put("gemini-3.6-flash", new Rate(0.75, 0.075, 3.75));
        m.put("gemini-3.7-flash", new Rate(0.75, 0.075, 3.75));
        m.put("gemini-3.8-flash", new Rate(0.75, 0.075, 3.75));
        return m;
    }

    /** The configured model name this one is priced as, or null when none matches. */
    private String keyFor(String model) {
        String name = model == null ? "" : model.trim();
        String best = null;
        for (String key : models.keySet()) {
            if (name.startsWith(key) && (best == null || key.length() > best.length())) best = key;
        }
        return best;
    }

    /** The rate for a model: the longest configured name it starts with, else the fallback. */
    public Rate rateFor(String model) {
        String key = keyFor(model);
        return key == null ? fallback : models.get(key);
    }

    public boolean isPriced(String model) {
        return keyFor(model) != null;
    }

    /**
     * Cost in millionths of a dollar. Rates are dollars per MILLION tokens, which is the same number
     * as millionths of a dollar per token — so this is tokens × rate, summed and rounded.
     */
    public long costMicros(String model, int inputTokens, int cachedTokens, int outputTokens) {
        Rate r = rateFor(model);
        return Math.round(inputTokens * r.getInput() + cachedTokens * r.getCachedInput() + outputTokens * r.getOutput());
    }

    public Map<String, Rate> getModels() {
        return models;
    }

    public void setModels(Map<String, Rate> models) {
        this.models = models;
    }

    public Rate getFallback() {
        return fallback;
    }

    public void setFallback(Rate fallback) {
        this.fallback = fallback;
    }
}
