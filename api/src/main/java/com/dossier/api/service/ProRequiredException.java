package com.dossier.api.service;

import java.util.Map;

/**
 * A service refused because the user isn't on Pro (Phase 12).
 *
 * <p>Service-layer twin of {@code web.rest.errors.ProRequiredException}, following the same
 * split as {@code EmailAlreadyUsedException}: the service layer may not depend on the web
 * layer (enforced by {@code TechnicalStructureTest}), so it throws this and
 * {@code ExceptionTranslator} turns it into the 402 ProblemDetail.
 */
public class ProRequiredException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_PRO_REQUIRED = "PRO_REQUIRED";
    public static final String CODE_RESUME_LIMIT = "RESUME_LIMIT";

    private final String code;
    private final transient Map<String, Object> extra;
    /** The service that was refused, when known: used only to choose the upgrade block of the 402 body, never part of the body itself. */
    private transient String featureKey;

    public ProRequiredException(String code, String message) {
        this(code, message, Map.of());
    }

    public ProRequiredException(String code, String message, Map<String, Object> extra) {
        super(message);
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    public ProRequiredException forFeature(String featureKey) {
        this.featureKey = featureKey;
        return this;
    }

    public String getFeatureKey() {
        return featureKey;
    }

    public String getCode() {
        return code;
    }

    /** Extra properties for the response body — e.g. {@code limit} and {@code count} for the resume cap. */
    public Map<String, Object> getExtra() {
        return extra;
    }
}
