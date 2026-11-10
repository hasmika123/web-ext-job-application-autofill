package com.dossier.api.service.onboarding;

import com.dossier.api.service.ResumeDocException;
import java.time.Instant;
import java.util.Map;

/**
 * An onboarding operation the server refused, with a machine-readable reason (Onboarding v2 R1.8,
 * DESIGN 9). Rendered by the same problem handler as {@link ResumeDocException} (which it extends), so a
 * client reads {@code code} and the extras exactly as for a document:
 *
 * <ul>
 *   <li>{@code DRAFT_CONFLICT} (409) - another device saved the draft since {@code baseUpdatedAt};
 *       {@code serverUpdatedAt} lets the client offer "Use that" or "Keep mine" ({@code force}).</li>
 *   <li>{@code DRAFT_TOO_LARGE} (413) - the draft state is over {@code onboarding.draft.maxBytes}; {@code max} is the cap.</li>
 *   <li>{@code DRAFT_INVALID} (422) - an unknown step or state version, a bad step counter or a state that is not an object; {@code path} names it.</li>
 *   <li>{@code PERSONA_INVALID} (422) - the persona is not one of the four.</li>
 * </ul>
 *
 * A never-collected value in the draft is the shared refusal {@code SensitiveContentException}
 * (422 {@code SENSITIVE_CONTENT {path, class}}).
 */
public class OnboardingException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_DRAFT_CONFLICT = "DRAFT_CONFLICT";
    public static final String CODE_DRAFT_TOO_LARGE = "DRAFT_TOO_LARGE";
    public static final String CODE_DRAFT_INVALID = "DRAFT_INVALID";
    public static final String CODE_PERSONA_INVALID = "PERSONA_INVALID";

    private OnboardingException(int status, String code, String message, Map<String, Object> extra) {
        super(status, code, message, extra);
    }

    public static OnboardingException conflict(Instant serverUpdatedAt) {
        return new OnboardingException(
            409,
            CODE_DRAFT_CONFLICT,
            "The setup draft was updated on another device",
            Map.of("serverUpdatedAt", serverUpdatedAt.toString())
        );
    }

    public static OnboardingException tooLarge(int maxBytes) {
        return new OnboardingException(413, CODE_DRAFT_TOO_LARGE, "The setup draft is over " + maxBytes + " bytes", Map.of("max", maxBytes));
    }

    public static OnboardingException invalid(String path, String message) {
        return new OnboardingException(422, CODE_DRAFT_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static OnboardingException personaInvalid() {
        return new OnboardingException(422, CODE_PERSONA_INVALID, "persona must be student, first_job, switching, experienced or null", Map.of());
    }
}
