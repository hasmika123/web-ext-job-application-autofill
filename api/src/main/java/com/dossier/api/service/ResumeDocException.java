package com.dossier.api.service;

import java.util.Map;

/**
 * A resume-document operation the server refused, with a machine-readable reason (Resume Builder
 * R0.3). Service-layer twin of {@code web.rest.errors.ResumeDocProblemException}, the same split
 * {@link BillingException} uses (the service layer may not depend on the web layer).
 *
 * <p>Clients branch on {@link #getCode()}, never on the message:
 *
 * <ul>
 *   <li>{@code DOC_INVALID} (422) - the document or theme failed validation; {@code path} and
 *       {@code message} name the first problem.</li>
 *   <li>{@code DOC_TOO_LARGE} (413) - the document is over the size limit.</li>
 *   <li>{@code IF_MATCH_REQUIRED} (428) - a save without an {@code If-Match} header.</li>
 *   <li>{@code DOC_VERSION_CONFLICT} (409) - the document moved since the client loaded it;
 *       {@code serverVersion} and {@code doc} (the server's document) let it merge.</li>
 * </ul>
 */
public class ResumeDocException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_DOC_INVALID = "DOC_INVALID";
    public static final String CODE_DOC_TOO_LARGE = "DOC_TOO_LARGE";
    public static final String CODE_IF_MATCH_REQUIRED = "IF_MATCH_REQUIRED";
    public static final String CODE_DOC_VERSION_CONFLICT = "DOC_VERSION_CONFLICT";

    private final int status;
    private final String code;
    private final transient Map<String, Object> extra;

    public ResumeDocException(int status, String code, String message, Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? Map.of() : Map.copyOf(extra);
    }

    public static ResumeDocException invalid(String path, String message) {
        return new ResumeDocException(422, CODE_DOC_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static ResumeDocException tooLarge(String message) {
        return new ResumeDocException(413, CODE_DOC_TOO_LARGE, message, Map.of());
    }

    public static ResumeDocException ifMatchRequired() {
        return new ResumeDocException(428, CODE_IF_MATCH_REQUIRED, "Send the document version you loaded in an If-Match header", Map.of());
    }

    public static ResumeDocException conflict(int serverVersion, Object doc) {
        return new ResumeDocException(
            409,
            CODE_DOC_VERSION_CONFLICT,
            "The document changed since you loaded it",
            Map.of("serverVersion", serverVersion, "doc", doc)
        );
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }

    /** Extra properties for the response body, e.g. {@code path}/{@code message} or {@code serverVersion}/{@code doc}. */
    public Map<String, Object> getExtra() {
        return extra;
    }
}
