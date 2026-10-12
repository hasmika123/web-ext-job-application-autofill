package com.dossier.api.service.ai;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.annotation.JsonValue;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.regex.Matcher;
import org.springframework.stereotype.Service;

/**
 * Every runtime AI value, resolved ONCE with the precedence <b>stored row, then env, then code default</b>
 * (AI-ADMIN-CONFIG-DESIGN 3.3). The router, the budget service, the metering service and the admin API all
 * read through here, so there is one answer to "which model does {@code parse} use right now".
 *
 * <p>Stored rows come from {@link ResumeBuilderSettings} (a 60 s snapshot of {@code app_setting}, dropped
 * by {@link #invalidate()} on every admin write), so a change applies without a restart. A row that is
 * invalid for its key is ignored, so a bad edit in the database falls back to env rather than breaking AI.
 *
 * <p>One deliberate exception to the precedence: {@code DOSSIER_AI_ENABLED=false} (env) is the deployment
 * MASTER switch. {@link #globalEnabled()} is false whenever it is, whatever the {@code ai.enabled} row says:
 * runtime settings can only lower it, never raise it.
 */
@Service
public class AiRuntimeSettings {

    /** Where a resolved value came from. Serialised in lower case ({@code db}, {@code env}, {@code default}). */
    public enum Source {
        DB,
        ENV,
        DEFAULT;

        @JsonValue
        public String wire() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /**
     * A value and its provenance - what {@code GET /api/admin/ai/config} returns for each field.
     *
     * @param envDefault  what the value becomes when the row is deleted (null when the key has no env counterpart)
     * @param codeDefault the declared code default
     */
    public record Resolved<T>(T value, Source source, T envDefault, T codeDefault) {}

    /**
     * The route of one task. {@code fallbackProvider} is null for "no fallback"; {@code fallbackModel} is
     * blank for "the fallback provider's own default".
     */
    public record Route(String provider, String model, String fallbackProvider, String fallbackModel, int maxOutputTokens, boolean enabled) {}

    private final ResumeBuilderSettings settings;
    private final AiEnv env;
    private final AiPolicy policy;
    private final AiPricing pricing;
    private final ObjectMapper mapper;

    public AiRuntimeSettings(ResumeBuilderSettings settings, AiEnv env, AiPolicy policy, AiPricing pricing, ObjectMapper mapper) {
        this.settings = settings;
        this.env = env;
        this.policy = policy;
        this.pricing = pricing;
        this.mapper = mapper;
    }

    // ---- switches -----------------------------------------------------------

    /** The deployment master ({@code DOSSIER_AI_ENABLED}). */
    public boolean envMasterEnabled() {
        return env.enabled();
    }

    /** Server AI is on: the env master AND the runtime switch. */
    public boolean globalEnabled() {
        return env.enabled() && bool(AiSettingKeys.ENABLED);
    }

    public boolean providerEnabled(String id) {
        String key = AiSettingKeys.providerKey(id == null ? "" : id, "enabled");
        return AiSettingKeys.find(key) != null && bool(key);
    }

    public String providerBaseUrl(String id) {
        return str(AiSettingKeys.providerKey(id, "base_url"));
    }

    public int providerTimeoutMs(String id) {
        return integer(AiSettingKeys.providerKey(id, "timeout_ms"));
    }

    public List<String> providerModels(String id) {
        return models(str(AiSettingKeys.providerKey(id, "models")));
    }

    public boolean taskEnabled(AiTask task) {
        return bool(AiSettingKeys.routeKey(task, "enabled"));
    }

    public Route route(AiTask task) {
        String fallbackProvider = str(AiSettingKeys.routeKey(task, "fallback_provider")).trim();
        return new Route(
            str(AiSettingKeys.routeKey(task, "provider")).trim(),
            str(AiSettingKeys.routeKey(task, "model")).trim(),
            fallbackProvider.isEmpty() || "none".equalsIgnoreCase(fallbackProvider) ? null : fallbackProvider,
            str(AiSettingKeys.routeKey(task, "fallback_model")).trim(),
            integer(AiSettingKeys.routeKey(task, "max_output_tokens")),
            taskEnabled(task)
        );
    }

    /** The model every task drops to past the soft cap; empty = no downgrade. */
    public Optional<String> economyModel() {
        String m = str(AiSettingKeys.ECONOMY_MODEL).trim();
        return m.isEmpty() ? Optional.empty() : Optional.of(m);
    }

    public int softCapPercent() {
        return integer(AiSettingKeys.SOFT_CAP_PCT);
    }

    public int adminTestPerHour() {
        return integer(AiSettingKeys.ADMIN_TEST_PER_HOUR);
    }

    public int callsDefaultWindowHours() {
        return integer(AiSettingKeys.CALLS_DEFAULT_WINDOW_HOURS);
    }

    // ---- prices -------------------------------------------------------------

    /**
     * The admin-set price of {@code model}: the stored {@code ai.price.<name>.*} rows (all three present and
     * valid) of the LONGEST name {@code model} starts with. Empty when no such triple exists, and
     * {@link AiPricing} then uses its code defaults.
     */
    public Optional<AiPricing.Rate> price(String model) {
        String name = model == null ? "" : model.trim();
        if (name.isEmpty()) return Optional.empty();
        Map<String, AiPricing.Rate> rates = storedRates();
        String best = null;
        for (String key : rates.keySet()) {
            if (name.startsWith(key) && (best == null || key.length() > best.length())) best = key;
        }
        return best == null ? Optional.empty() : Optional.of(rates.get(best));
    }

    /**
     * Every model that has all three stored price rows, as a rate (USD per million tokens). {@link AiPricing}
     * merges these names with its own when it picks the longest name a served model starts with.
     */
    public Map<String, AiPricing.Rate> storedRates() {
        Map<String, AiPricing.Rate> out = new TreeMap<>();
        for (Map.Entry<String, long[]> e : storedPrices().entrySet()) {
            long[] v = e.getValue();
            if (v[0] < 0 || v[1] < 0 || v[2] < 0) continue; // a part is missing: ignore the model's rows
            out.put(e.getKey(), new AiPricing.Rate(v[0] / 1_000_000.0, v[1] / 1_000_000.0, v[2] / 1_000_000.0));
        }
        return out;
    }

    /** Stored price rows grouped by model: [input, cached, output] in micros, -1 where a part has no valid row. */
    public Map<String, long[]> storedPrices() {
        Map<String, long[]> out = new TreeMap<>();
        for (Map.Entry<String, String> row : settings.storedWithPrefix("ai.price.").entrySet()) {
            Matcher m = AiSettingKeys.priceMatcher(row.getKey());
            if (m == null) continue;
            long[] v = out.computeIfAbsent(m.group(1), k -> new long[] { -1, -1, -1 });
            int idx = "input".equals(m.group(2)) ? 0 : "cached".equals(m.group(2)) ? 1 : 2;
            v[idx] = Long.parseLong(row.getValue().trim());
        }
        return out;
    }

    /** The code/env price of one part, in micros per million tokens (the unpriced fallback rate when unknown). */
    public long pricingDefaultMicros(String model, String part) {
        AiPricing.Rate r = pricing.rateFor(model);
        double usd = "input".equals(part) ? r.getInput() : "cached".equals(part) ? r.getCachedInput() : r.getOutput();
        return Math.round(usd * 1_000_000);
    }

    // ---- provenance ---------------------------------------------------------

    /** The value of {@code key} with its provenance (typed: Boolean, Integer, String, or List&lt;String&gt; for JSON). */
    public Resolved<Object> resolved(String key) {
        Key k = ResumeBuilderSettingKeys.find(key);
        if (k == null) throw new IllegalArgumentException("Unknown AI setting: " + key);
        String code = codeDefault(k);
        String envDefault = envValue(k);
        Optional<String> row = settings.stored(k.key());
        if (row.isPresent()) return new Resolved<>(typed(k, row.get()), Source.DB, envDefault == null ? null : typed(k, envDefault), typed(k, code));
        if (envDefault != null) return new Resolved<>(typed(k, envDefault), Source.ENV, typed(k, envDefault), typed(k, code));
        return new Resolved<>(typed(k, code), Source.DEFAULT, null, typed(k, code));
    }

    /** Whether a row is stored (and valid) for {@code key} - what makes a field "overridden". */
    public boolean hasRow(String key) {
        return settings.stored(key).isPresent();
    }

    /** Drop the cache so the next read sees the table as it is now (called after every admin write). */
    public void invalidate() {
        settings.invalidate();
    }

    // ---- internals ----------------------------------------------------------

    private String str(String key) {
        Key k = ResumeBuilderSettingKeys.find(key);
        if (k == null) throw new IllegalArgumentException("Unknown AI setting: " + key);
        Optional<String> row = settings.stored(k.key());
        if (row.isPresent()) return row.get();
        String envv = envValue(k);
        return envv != null ? envv : codeDefault(k);
    }

    private boolean bool(String key) {
        return Boolean.parseBoolean(str(key).trim());
    }

    private int integer(String key) {
        try {
            return Integer.parseInt(str(key).trim());
        } catch (NumberFormatException e) {
            return Integer.parseInt(codeDefault(ResumeBuilderSettingKeys.find(key)).trim());
        }
    }

    private List<String> models(String json) {
        List<String> out = new ArrayList<>();
        try {
            JsonNode n = mapper.readTree(json);
            if (n != null && n.isArray()) for (JsonNode e : n) if (e.isTextual()) out.add(e.textValue());
        } catch (Exception e) {
            // an unparsable list is an empty list
        }
        return out;
    }

    private Object typed(Key k, String s) {
        return switch (k.type()) {
            case BOOL -> Boolean.parseBoolean(s.trim());
            case INT -> {
                try {
                    yield Integer.parseInt(s.trim());
                } catch (NumberFormatException e) {
                    yield 0;
                }
            }
            case JSON -> models(s);
            default -> s;
        };
    }

    /** The code default of {@code k}; for a price key, what {@link AiPricing} charges when no row is set. */
    private String codeDefault(Key k) {
        Matcher price = AiSettingKeys.priceMatcher(k.key());
        if (price != null) return String.valueOf(pricingDefaultMicros(price.group(1), price.group(2)));
        return k.defaultValue();
    }

    /** The env-level value of {@code k} ({@code AiProperties}/{@code AiPolicy}), or null when it has no env counterpart. */
    private String envValue(Key k) {
        String key = k.key();
        if (AiSettingKeys.ECONOMY_MODEL.equals(key)) return policy.hasEconomyModel() ? policy.getEconomyModel().trim() : "";
        if (AiSettingKeys.SOFT_CAP_PCT.equals(key)) return String.valueOf(policy.getSoftCapPercent());
        AiSettingKeys.RouteRef route = AiSettingKeys.routeRef(key);
        if (route != null) {
            AiTask t = route.task();
            return switch (route.field()) {
                case "enabled" -> String.valueOf(!policy.isDisabled(t));
                case "model" -> policy.modelFor(t, env.model());
                case "provider" -> env.provider().isEmpty() ? "gemini" : env.provider();
                case "max_output_tokens" -> switch (t) {
                    case DRAFT, PICK, MAP, ENRICH -> String.valueOf(env.maxOutputTokens());
                    case PARSE -> String.valueOf(env.parseMaxOutputTokens());
                    default -> null;
                };
                default -> null;
            };
        }
        AiSettingKeys.ProviderRef provider = AiSettingKeys.providerRef(key);
        if (provider != null && "base_url".equals(provider.field()) && "gemini".equals(provider.id()) && !env.baseUrl().isEmpty()) {
            return env.baseUrl();
        }
        return null;
    }
}
