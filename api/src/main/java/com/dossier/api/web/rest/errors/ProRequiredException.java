package com.dossier.api.web.rest.errors;

import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * "This needs Pro" — HTTP <b>402 Payment Required</b> (Phase 12).
 *
 * <p>402 rather than 403 on purpose: the user is not forbidden from doing this, they simply
 * haven't paid for it. Clients branch on the machine-readable {@code code} property, never on
 * the message:
 *
 * <ul>
 *   <li>{@code PRO_REQUIRED} — a Pro-only endpoint (server AI, cross-device answer sync)</li>
 *   <li>{@code RESUME_LIMIT} — the Free resume cap, with {@code limit} and {@code count}</li>
 * </ul>
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class ProRequiredException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_PRO_REQUIRED = "PRO_REQUIRED";
    public static final String CODE_RESUME_LIMIT = "RESUME_LIMIT";

    private final String code;

    public ProRequiredException(String code, String detail) {
        this(code, detail, Map.of());
    }

    public ProRequiredException(String code, String detail, Map<String, Object> extra) {
        super(HttpStatus.PAYMENT_REQUIRED, build(code, detail, extra), null);
        this.code = code;
    }

    private static org.springframework.http.ProblemDetail build(String code, String detail, Map<String, Object> extra) {
        var builder = ProblemDetailWithCauseBuilder.instance()
            .withStatus(HttpStatus.PAYMENT_REQUIRED.value())
            .withType(ErrorConstants.DEFAULT_TYPE)
            .withTitle(detail)
            .withProperty("code", code)
            .withProperty("message", "error.proRequired");
        extra.forEach(builder::withProperty);
        return builder.build();
    }

    public String getCode() {
        return code;
    }
}
