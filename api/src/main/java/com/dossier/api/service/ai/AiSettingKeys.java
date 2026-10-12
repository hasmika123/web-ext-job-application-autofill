package com.dossier.api.service.ai;

import com.dossier.api.service.AdminSettingsWriter.Risk;
import com.dossier.api.service.ResumeBuilderSettingKeys.Key;
import com.dossier.api.service.ResumeBuilderSettingKeys.Type;
import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Every non-secret AI knob an admin may change at runtime, declared once (AI-ADMIN-CONFIG-DESIGN 3.2).
 * Same {@link Key} record and bounds as the Resume Builder registry, which consults this class after its
 * own map ({@code ResumeBuilderSettingKeys.find}), so {@code ResumeBuilderSettings} reads these unchanged.
 *
 * <p>Three FAMILIES are open-ended and resolved by pattern: {@code ai.route.<task>.*},
 * {@code ai.provider.<id>.*} and {@code ai.price.<model>.*}. The {@code defaultValue} of a key is its CODE
 * default; the env default (from {@code AiProperties}/{@code AiPolicy}) is layered between a stored row and
 * the code default by {@link AiRuntimeSettings}.
 *
 * <p>No secret is ever a setting: provider keys are env-only, and a test asserts that no key declared here
 * is named like one.
 */
public final class AiSettingKeys {

    public static final String ENABLED = "ai.enabled";
    public static final String ECONOMY_MODEL = "ai.economy_model";
    public static final String SOFT_CAP_PCT = "ai.soft_cap_pct";
    public static final String ADMIN_TEST_PER_HOUR = "ai.admin.test_per_hour";
    public static final String CALLS_DEFAULT_WINDOW_HOURS = "ai.calls.default_window_hours";

    /** Provider ids the registry may ever hold ({@code gemini} now, {@code openai_compat} in Phase 2). */
    public static final List<String> PROVIDER_IDS = List.of("gemini", "openai_compat");

    /** Route fields (the {@code <field>} of {@code ai.route.<task>.<field>}). */
    public static final List<String> ROUTE_FIELDS = List.of("enabled", "provider", "model", "fallback_provider", "fallback_model", "max_output_tokens");

    /** Provider fields. */
    public static final List<String> PROVIDER_FIELDS = List.of("enabled", "base_url", "timeout_ms", "models");

    /** A model id as it appears in a setting value or a price key. */
    public static final Pattern MODEL_ID = Pattern.compile("[a-z0-9][a-z0-9._:/-]{1,60}");

    public static final String CODE_MODEL_INVALID = "AI_MODEL_INVALID";
    public static final String CODE_URL_INVALID = "AI_URL_INVALID";

    private static final Pattern ROUTE_KEY;
    private static final Pattern PROVIDER_KEY;
    private static final Pattern PRICE_KEY = Pattern.compile("^ai\\.price\\.([a-z0-9][a-z0-9._:/-]{1,60})\\.(input|cached|output)_per_mtok_micros$");
    private static final Map<String, Key> EXACT;
    private static final Pattern RFC1918 = Pattern.compile("^(10\\.\\d+\\.\\d+\\.\\d+|192\\.168\\.\\d+\\.\\d+|172\\.(1[6-9]|2\\d|3[01])\\.\\d+\\.\\d+)$");

    static {
        String tasks = java.util.Arrays.stream(AiTask.values()).map(AiTask::wire).collect(Collectors.joining("|"));
        ROUTE_KEY = Pattern.compile("^ai\\.route\\.(" + tasks + ")\\.(" + String.join("|", ROUTE_FIELDS) + ")$");
        PROVIDER_KEY = Pattern.compile("^ai\\.provider\\.(" + String.join("|", PROVIDER_IDS) + ")\\.(" + String.join("|", PROVIDER_FIELDS) + ")$");

        Map<String, Key> m = new LinkedHashMap<>();
        put(m, new Key(ENABLED, Type.BOOL, "true", null, null, null, "Global server-AI switch. Effective only while DOSSIER_AI_ENABLED is on (the env master can only be lowered, never raised, here).", null));
        put(m, new Key(ECONOMY_MODEL, Type.STRING, "", null, null, null, "Model every task drops to past the soft cap of a user's budget. Blank = no downgrade.", null));
        put(m, new Key(SOFT_CAP_PCT, Type.INT, "80", 50d, 95d, null, "Percent of a user's AI budget after which the economy model is used.", null));
        put(m, new Key(ADMIN_TEST_PER_HOUR, Type.INT, "30", 1d, 120d, null, "Test-connection calls one admin may run per hour.", null));
        put(m, new Key(CALLS_DEFAULT_WINDOW_HOURS, Type.INT, "24", 1d, 168d, null, "Default window of the recent-calls panel, in hours.", null));
        EXACT = Collections.unmodifiableMap(m);
    }

    private AiSettingKeys() {}

    private static void put(Map<String, Key> m, Key k) {
        if (m.put(k.key(), k) != null) throw new IllegalStateException("duplicate AI setting " + k.key());
    }

    // ---- lookup -------------------------------------------------------------

    /** The declaration for {@code key} (exact keys first, then the three families); null when unknown. */
    public static Key find(String key) {
        if (key == null) return null;
        Key exact = EXACT.get(key);
        if (exact != null) return exact;
        Matcher r = ROUTE_KEY.matcher(key);
        if (r.matches()) return routeKey(key, taskOf(r.group(1)), r.group(2));
        Matcher p = PROVIDER_KEY.matcher(key);
        if (p.matches()) return providerKey(key, p.group(1), p.group(2));
        Matcher pr = PRICE_KEY.matcher(key);
        if (pr.matches()) return priceKey(key, pr.group(1), pr.group(2));
        return null;
    }

    /** The fixed (non-family) keys, in declaration order. */
    public static List<Key> exactKeys() {
        return new ArrayList<>(EXACT.values());
    }

    public static String routeKey(AiTask task, String field) {
        return "ai.route." + task.wire() + "." + field;
    }

    public static String providerKey(String id, String field) {
        return "ai.provider." + id + "." + field;
    }

    public static String priceKey(String model, String part) {
        return "ai.price." + model + "." + part + "_per_mtok_micros";
    }

    /** True for a model id acceptable in a setting value or a price key. */
    public static boolean isModelId(String s) {
        return s != null && MODEL_ID.matcher(s).matches() && !s.contains("..");
    }

    private static AiTask taskOf(String wire) {
        for (AiTask t : AiTask.values()) if (t.wire().equals(wire)) return t;
        throw new IllegalStateException(wire);
    }

    // ---- families -----------------------------------------------------------

    private static Key routeKey(String key, AiTask task, String field) {
        String name = task.wire();
        return switch (field) {
            case "enabled" -> new Key(key, Type.BOOL, "true", null, null, null, "Whether the " + name + " task may call a provider (per-task kill switch).", null);
            case "provider" -> new Key(key, Type.ENUM, "gemini", null, null, PROVIDER_IDS, "Provider that answers the " + name + " task.", null);
            case "model" -> new Key(key, Type.STRING, "", null, null, null, "Model for the " + name + " task. Blank = the env default for the task.", null);
            case "fallback_provider" -> new Key(key, Type.ENUM, "none", null, null, withNone(), "Provider tried once when the " + name + " task fails on its own provider. none = no fallback.", null);
            case "fallback_model" -> new Key(key, Type.STRING, "", null, null, null, "Model on the fallback provider for the " + name + " task. Blank = that provider's default.", null);
            case "max_output_tokens" -> new Key(
                key,
                Type.INT,
                String.valueOf(codeDefaultMaxOutputTokens(task)),
                64d,
                16384d,
                null,
                "Output token ceiling for the " + name + " task.",
                null
            );
            default -> throw new IllegalStateException(field);
        };
    }

    private static List<String> withNone() {
        List<String> l = new ArrayList<>();
        l.add("none");
        l.addAll(PROVIDER_IDS);
        return List.copyOf(l);
    }

    private static Key providerKey(String key, String id, String field) {
        return switch (field) {
            case "enabled" -> new Key(key, Type.BOOL, "true", null, null, null, "Whether " + id + " may be called at all.", null);
            case "base_url" -> new Key(key, Type.STRING, "gemini".equals(id) ? "https://generativelanguage.googleapis.com/v1beta" : "http://localhost:11434/v1", null, null, null, "Base URL of the " + id + " API (https; http only for local hosts).", null);
            case "timeout_ms" -> new Key(key, Type.INT, "gemini".equals(id) ? "30000" : "120000", 1000d, 300000d, null, "HTTP timeout per " + id + " call, in milliseconds.", null);
            case "models" -> new Key(key, Type.JSON, defaultModelsJson(id), null, null, null, "Models offered for " + id + " in the routing table (0-30 model ids).", AiSettingKeys::modelList);
            default -> throw new IllegalStateException(field);
        };
    }

    private static Key priceKey(String key, String model, String part) {
        return new Key(key, Type.INT, "0", 0d, 100_000_000d, null, "USD per million tokens, in millionths of a dollar, for " + part + " tokens of " + model + ".", null);
    }

    static String defaultModelsJson(String id) {
        if (!"gemini".equals(id)) return "[]";
        return "[" + AiPricing.defaultModelIds().stream().filter(m -> m.startsWith("gemini")).map(m -> "\"" + m + "\"").collect(Collectors.joining(",")) + "]";
    }

    private static boolean modelList(JsonNode n) {
        if (!n.isArray() || n.size() > 30) return false;
        Set<String> seen = new HashSet<>();
        for (JsonNode e : n) {
            if (!e.isTextual() || !isModelId(e.textValue()) || !seen.add(e.textValue())) return false;
        }
        return true;
    }

    /** Today's output ceilings made explicit (design 3.2). */
    public static int codeDefaultMaxOutputTokens(AiTask task) {
        return switch (task) {
            case DRAFT, PICK, MAP, ENRICH -> 400;
            case MATCH, FIT -> 1200;
            case TAILOR, JOBS, INBOX -> 3000;
            case PARSE -> 4000;
            case REWRITE, SUMMARY, SUGGEST, COVER, TRANSLATE -> 3000;
            default -> 16; // PROBE
        };
    }

    // ---- value rules beyond type and bounds ---------------------------------

    /** True when a blank stored value is meaningful for {@code k} (a model id, or the economy model). */
    public static boolean allowsBlank(Key k) {
        String key = k.key();
        return ECONOMY_MODEL.equals(key) || key.endsWith(".model") || key.endsWith(".fallback_model");
    }

    /**
     * An extra rule a value must meet beyond its type and bounds: {@link #CODE_MODEL_INVALID} for a model id
     * that is not one, {@link #CODE_URL_INVALID} for a base URL that is not acceptable; null when the value is fine.
     */
    public static String shapeError(Key k, String raw) {
        if (raw == null) return null;
        String key = k.key();
        boolean modelKey = ECONOMY_MODEL.equals(key) || key.endsWith(".model") || key.endsWith(".fallback_model");
        if (modelKey && k.type() == Type.STRING && !raw.isBlank() && !isModelId(raw.trim())) return CODE_MODEL_INVALID;
        if (key.endsWith(".base_url") && !isAcceptableBaseUrl(raw.trim())) return CODE_URL_INVALID;
        return null;
    }

    /** {@code https://} always; {@code http://} only for localhost, loopback, {@code *.localhost}, {@code host.docker.internal} and RFC-1918 hosts. */
    public static boolean isAcceptableBaseUrl(String url) {
        try {
            URI u = URI.create(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            String host = u.getHost() == null ? "" : u.getHost().toLowerCase(Locale.ROOT);
            if (host.isEmpty() || u.getUserInfo() != null) return false;
            if ("https".equals(scheme)) return true;
            if (!"http".equals(scheme)) return false;
            return (
                host.equals("localhost") ||
                host.equals("127.0.0.1") ||
                host.equals("[::1]") ||
                host.endsWith(".localhost") ||
                host.equals("host.docker.internal") ||
                RFC1918.matcher(host).matches()
            );
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * The risk of writing {@code newValue} to {@code key}: HIGH when it switches server AI, a provider or the
     * resume-parse route OFF (a reason is then required); MEDIUM for anything that re-routes or turns a task off;
     * LOW otherwise.
     */
    public static Risk riskOf(String key, String newValue) {
        boolean off = "false".equalsIgnoreCase(newValue == null ? "" : newValue.trim());
        if (off && (ENABLED.equals(key) || key.equals(routeKey(AiTask.PARSE, "enabled")) || (key.startsWith("ai.provider.") && key.endsWith(".enabled")))) {
            return Risk.HIGH;
        }
        if (key.startsWith("ai.route.") && !key.endsWith(".max_output_tokens")) return Risk.MEDIUM;
        if (ECONOMY_MODEL.equals(key) || SOFT_CAP_PCT.equals(key)) return Risk.MEDIUM;
        if (key.endsWith(".base_url")) return Risk.MEDIUM;
        return Risk.LOW;
    }

    public record RouteRef(AiTask task, String field) {}

    public record ProviderRef(String id, String field) {}

    /** The task and field of an {@code ai.route.<task>.<field>} key; null when it is not one. */
    public static RouteRef routeRef(String key) {
        Matcher m = key == null ? null : ROUTE_KEY.matcher(key);
        return m != null && m.matches() ? new RouteRef(taskOf(m.group(1)), m.group(2)) : null;
    }

    /** The provider id and field of an {@code ai.provider.<id>.<field>} key; null when it is not one. */
    public static ProviderRef providerRef(String key) {
        Matcher m = key == null ? null : PROVIDER_KEY.matcher(key);
        return m != null && m.matches() ? new ProviderRef(m.group(1), m.group(2)) : null;
    }

    /** Matches a price key; group 1 = model, group 2 = input|cached|output. Null when it is not one. */
    public static Matcher priceMatcher(String key) {
        Matcher m = key == null ? null : PRICE_KEY.matcher(key);
        return m != null && m.matches() ? m : null;
    }
}
