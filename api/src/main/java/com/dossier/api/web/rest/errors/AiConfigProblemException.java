package com.dossier.api.web.rest.errors;

import com.dossier.api.service.AiConfigException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of an {@link AiConfigException} (admin AI config, I1.9): status, {@code code} and
 * the extra properties (bounds, tasks, retry-after...) come straight from the service exception. The title
 * and {@code detail} are the human-readable message the admin page shows inline.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class AiConfigProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public AiConfigProblemException(AiConfigException cause) {
        super(HttpStatus.valueOf(cause.getStatus()), build(cause), cause);
    }

    private static org.springframework.http.ProblemDetail build(AiConfigException cause) {
        var builder = ProblemDetailWithCauseBuilder.instance()
            .withStatus(cause.getStatus())
            .withType(ErrorConstants.DEFAULT_TYPE)
            .withTitle(cause.getMessage())
            .withDetail(cause.getMessage())
            .withProperty("code", cause.getCode())
            .withProperty("message", "error.aiConfig");
        cause.getExtra().forEach(builder::withProperty);
        return builder.build();
    }
}
