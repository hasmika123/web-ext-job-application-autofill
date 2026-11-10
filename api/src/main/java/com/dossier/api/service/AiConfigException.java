package com.dossier.api.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * An admin AI-config operation the server refused, with a machine-readable reason (AI-ADMIN-CONFIG-DESIGN 6.2).
 * Service-layer twin of {@code web.rest.errors.AiConfigProblemException}, the same split
 * {@link ResumeDocException} uses (the service layer may not depend on the web layer). Clients branch on
 * {@link #getCode()}, never on the message.
 *
 * <ul>
 *   <li>400 {@code AI_CONFIG_UNKNOWN_KEY} - a task, provider or field that is not in the registry.</li>
 *   <li>400 {@code AI_CONFIG_OUT_OF_BOUNDS} {@code {key,min,max,allowed}} - bounds or enum violated.</li>
 *   <li>400 {@code AI_CONFIG_REASON_REQUIRED} {@code {key}} - a HIGH-risk change without a reason.</li>
 *   <li>400 {@code AI_MODEL_INVALID} {@code {model}} - a model id that fails the pattern.</li>
 *   <li>400 {@code AI_URL_INVALID} - a base URL that breaks the rule.</li>
 *   <li>404 {@code AI_PROVIDER_UNKNOWN} - an unknown provider id.</li>
 *   <li>409 {@code AI_PROVIDER_NOT_CONFIGURED} {@code {provider,keyEnvVar}} - routing to or testing a provider whose key is missing.</li>
 *   <li>409 {@code AI_PROVIDER_IN_USE} {@code {tasks[]}} - disabling a provider routes still use, with no fallback.</li>
 *   <li>429 {@code AI_TEST_RATE_LIMITED} {@code {retryAfterSeconds}} - too many tests this hour.</li>
 * </ul>
 */
public class AiConfigException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_UNKNOWN_KEY = "AI_CONFIG_UNKNOWN_KEY";
    public static final String CODE_OUT_OF_BOUNDS = "AI_CONFIG_OUT_OF_BOUNDS";
    public static final String CODE_REASON_REQUIRED = "AI_CONFIG_REASON_REQUIRED";
    public static final String CODE_MODEL_INVALID = "AI_MODEL_INVALID";
    public static final String CODE_URL_INVALID = "AI_URL_INVALID";
    public static final String CODE_PROVIDER_UNKNOWN = "AI_PROVIDER_UNKNOWN";
    public static final String CODE_PROVIDER_NOT_CONFIGURED = "AI_PROVIDER_NOT_CONFIGURED";
    public static final String CODE_PROVIDER_IN_USE = "AI_PROVIDER_IN_USE";
    public static final String CODE_TEST_RATE_LIMITED = "AI_TEST_RATE_LIMITED";

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public AiConfigException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    public static AiConfigException unknownKey(String key) {
        return new AiConfigException(400, CODE_UNKNOWN_KEY, "Unknown AI setting: " + key, Map.of("key", String.valueOf(key)));
    }

    public static AiConfigException outOfBounds(String key, Double min, Double max, List<String> allowed) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("key", key);
        if (min != null) extra.put("min", min);
        if (max != null) extra.put("max", max);
        if (allowed != null) extra.put("allowed", allowed);
        String range = min != null && max != null ? "Must be between " + min.intValue() + " and " + max.intValue() + "." : "Value for " + key + " is not acceptable.";
        return new AiConfigException(400, CODE_OUT_OF_BOUNDS, range, extra);
    }

    public static AiConfigException reasonRequired(String key) {
        return new AiConfigException(400, CODE_REASON_REQUIRED, "A reason is required for this change.", Map.of("key", key));
    }

    public static AiConfigException modelInvalid(String model) {
        return new AiConfigException(400, CODE_MODEL_INVALID, "Not a model id (letters, digits, . _ : / -).", Map.of("model", String.valueOf(model)));
    }

    public static AiConfigException urlInvalid() {
        return new AiConfigException(400, CODE_URL_INVALID, "Must be an https:// URL (http:// only for localhost).", Map.of());
    }

    public static AiConfigException providerUnknown(String id) {
        return new AiConfigException(404, CODE_PROVIDER_UNKNOWN, "Unknown AI provider: " + id, Map.of("provider", String.valueOf(id)));
    }

    public static AiConfigException providerNotConfigured(String id, String keyEnvVar) {
        return new AiConfigException(
            409,
            CODE_PROVIDER_NOT_CONFIGURED,
            "Provider " + id + " has no key; set " + keyEnvVar + " on the API and restart.",
            Map.of("provider", id, "keyEnvVar", keyEnvVar)
        );
    }

    public static AiConfigException providerInUse(String id, List<String> tasks) {
        return new AiConfigException(
            409,
            CODE_PROVIDER_IN_USE,
            id + " still answers " + String.join(", ", tasks) + ". Set a fallback or re-route them first.",
            Map.of("provider", id, "tasks", tasks)
        );
    }

    public static AiConfigException testRateLimited(int retryAfterSeconds) {
        return new AiConfigException(429, CODE_TEST_RATE_LIMITED, "Too many provider tests this hour.", Map.of("retryAfterSeconds", retryAfterSeconds));
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** Extra properties for the response body. */
    public Map<String, Object> getExtra() {
        return extra;
    }
}
