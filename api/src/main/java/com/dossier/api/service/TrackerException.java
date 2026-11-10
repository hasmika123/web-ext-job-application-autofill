package com.dossier.api.service;

import java.util.List;
import java.util.Map;

/**
 * An applications-tracker operation the server refused, with a machine-readable reason (APP-E2E U6.x).
 * Rendered by the same problem handler as {@link ResumeDocException} (which it extends), so a client
 * reads {@code code} (and {@code path}/{@code message} where given):
 *
 * <ul>
 *   <li>{@code SORT_INVALID} (400) - a {@code sort} the list does not allow; {@code allowed} lists the fields.</li>
 *   <li>{@code TRACKER_INVALID} (422) - a field of the request is wrong; {@code path} and {@code message} name it.</li>
 *   <li>{@code TRACKER_LIMIT} (422) - a configured cap is reached (notes or interviews per application,
 *       ids per bulk call); {@code limit} says which number.</li>
 * </ul>
 *
 * A never-collected value in free text is the shared refusal {@code SensitiveContentException}.
 */
public class TrackerException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_SORT_INVALID = "SORT_INVALID";
    public static final String CODE_TRACKER_INVALID = "TRACKER_INVALID";
    public static final String CODE_TRACKER_LIMIT = "TRACKER_LIMIT";

    private TrackerException(int status, String code, String message, Map<String, Object> extra) {
        super(status, code, message, extra);
    }

    public static TrackerException sortInvalid(String sort, List<String> allowed) {
        return new TrackerException(400, CODE_SORT_INVALID, "Cannot sort by '" + sort + "'", Map.of("sort", String.valueOf(sort), "allowed", allowed));
    }

    public static TrackerException invalid(String path, String message) {
        return new TrackerException(422, CODE_TRACKER_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static TrackerException limit(String message, int limit) {
        return new TrackerException(422, CODE_TRACKER_LIMIT, message, Map.of("limit", limit));
    }
}
