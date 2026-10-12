package com.dossier.api.web.rest.errors;

import com.dossier.api.service.ResumeDocException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of a {@link ResumeDocException} (Resume Builder R0.3): status, {@code code}
 * and the extra properties ({@code path}/{@code message}, {@code serverVersion}/{@code doc}) come
 * straight from the service exception. {@code message} defaults to an i18n-style key like the other
 * problems, but the extras win, so a 422 carries the validator's own message.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class ResumeDocProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public ResumeDocProblemException(ResumeDocException cause) {
        super(HttpStatus.valueOf(cause.getStatus()), build(cause), cause);
    }

    private static org.springframework.http.ProblemDetail build(ResumeDocException cause) {
        var builder = ProblemDetailWithCauseBuilder.instance()
            .withStatus(cause.getStatus())
            .withType(ErrorConstants.DEFAULT_TYPE)
            .withTitle(cause.getMessage())
            .withProperty("code", cause.getCode())
            .withProperty("message", "error.resumeDoc");
        cause.getExtra().forEach(builder::withProperty);
        return builder.build();
    }
}
