package com.dossier.api.service;

import java.util.Map;

/**
 * A profile-item operation the server refused, with a machine-readable reason (Resume Builder R1.1).
 * Rendered by the same problem handler as {@link ResumeDocException} (which it extends), so a client
 * reads {@code code} (and {@code path}/{@code message} where given) exactly as for a document:
 *
 * <ul>
 *   <li>{@code ITEM_INVALID} (422) - the item is not a JSON object, or a field of the request is wrong.</li>
 *   <li>{@code ITEM_TOO_LARGE} (413) - one item is over {@code profile.item.maxBytes}.</li>
 *   <li>{@code ITEM_LIMIT} (422) - the profile already holds {@code profile.items.maxPerUser} items,
 *       or one import carries more than {@code profile.import.maxItems} (admin settings, DESIGN 15.2).</li>
 * </ul>
 *
 * Sensitive values are a different, shared refusal: {@code SensitiveContentException}.
 */
public class ProfileItemException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_ITEM_INVALID = "ITEM_INVALID";
    public static final String CODE_ITEM_TOO_LARGE = "ITEM_TOO_LARGE";
    public static final String CODE_ITEM_LIMIT = "ITEM_LIMIT";

    private ProfileItemException(int status, String code, String message, Map<String, Object> extra) {
        super(status, code, message, extra);
    }

    public static ProfileItemException invalid(String path, String message) {
        return new ProfileItemException(422, CODE_ITEM_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static ProfileItemException tooLarge(String path, int maxBytes) {
        return new ProfileItemException(413, CODE_ITEM_TOO_LARGE, path + " is over " + maxBytes + " bytes", Map.of("path", path, "maxBytes", maxBytes));
    }

    public static ProfileItemException limit(String message, int limit) {
        return new ProfileItemException(422, CODE_ITEM_LIMIT, message, Map.of("limit", limit));
    }
}
