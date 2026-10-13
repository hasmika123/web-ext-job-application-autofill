package com.dossier.api.service.settings;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A generic admin-settings operation the server refused, with a machine-readable reason (A5.1, ADMIN-E2E-PLAN 2.1).
 * Service-layer twin of {@code web.rest.errors.SettingsProblemException}, the same split {@code AiConfigException}
 * uses (the service layer may not depend on the web layer). Clients branch on {@link #getCode()}, never on the message.
 *
 * <ul>
 *   <li>400 {@code SETTING_UNKNOWN_KEY} {@code {key}} - a key that is not in the registry.</li>
 *   <li>400 {@code SETTING_OUT_OF_BOUNDS} {@code {key,min,max,allowed}} - the value breaks the key's type, bounds, allowed list or shape.</li>
 *   <li>400 {@code SETTING_REASON_REQUIRED} {@code {key,minLength}} - a HIGH-risk change without a reason of at least {@value #REASON_MIN_LENGTH} characters.</li>
 *   <li>404 {@code SETTING_HISTORY_NOT_FOUND} {@code {key,historyId}} - a revert of a history row that is not this key's.</li>
 * </ul>
 */
public class SettingsException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_UNKNOWN_KEY = "SETTING_UNKNOWN_KEY";
    public static final String CODE_OUT_OF_BOUNDS = "SETTING_OUT_OF_BOUNDS";
    public static final String CODE_REASON_REQUIRED = "SETTING_REASON_REQUIRED";
    public static final String CODE_HISTORY_NOT_FOUND = "SETTING_HISTORY_NOT_FOUND";

    /** The shortest reason a HIGH-risk change may carry (ADMIN-E2E-PLAN 3.3). */
    public static final int REASON_MIN_LENGTH = 10;

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public SettingsException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    public static SettingsException unknownKey(String key) {
        return new SettingsException(400, CODE_UNKNOWN_KEY, "Unknown setting: " + key, Map.of("key", String.valueOf(key)));
    }

    public static SettingsException outOfBounds(String key, Double min, Double max, List<String> allowed, String message) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("key", key);
        if (min != null) extra.put("min", min % 1 == 0 ? (Object) min.longValue() : min);
        if (max != null) extra.put("max", max % 1 == 0 ? (Object) max.longValue() : max);
        if (allowed != null) extra.put("allowed", allowed);
        String text = message;
        if (text == null) {
            text = min != null && max != null ? "Must be between " + (min % 1 == 0 ? String.valueOf(min.longValue()) : min) + " and " + (max % 1 == 0 ? String.valueOf(max.longValue()) : max) + "." : "Value for " + key + " is not acceptable.";
        }
        return new SettingsException(400, CODE_OUT_OF_BOUNDS, text, extra);
    }

    public static SettingsException reasonRequired(String key) {
        return new SettingsException(
            400,
            CODE_REASON_REQUIRED,
            "A reason (at least " + REASON_MIN_LENGTH + " characters) is required for this change.",
            Map.of("key", key, "minLength", REASON_MIN_LENGTH)
        );
    }

    public static SettingsException historyNotFound(String key, Long historyId) {
        return new SettingsException(404, CODE_HISTORY_NOT_FOUND, "No such change in the history of " + key + ".", Map.of("key", key, "historyId", String.valueOf(historyId)));
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
