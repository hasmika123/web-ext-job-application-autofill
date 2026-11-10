package com.dossier.api.web.rest.errors;

import com.dossier.api.service.org.OrgException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of an {@link OrgException}: status, {@code code} and the extra properties come straight from
 * the service exception. For the 404 the body is generic on purpose: no "forbidden", no hint that the org exists.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class OrgProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public OrgProblemException(OrgException cause) {
        super(HttpStatus.valueOf(cause.getStatus()), build(cause), cause);
    }

    private static org.springframework.http.ProblemDetail build(OrgException cause) {
        var builder = ProblemDetailWithCauseBuilder.instance()
            .withStatus(cause.getStatus())
            .withType(ErrorConstants.DEFAULT_TYPE)
            .withTitle(cause.getMessage())
            .withProperty("code", cause.getCode())
            .withProperty("message", "error.org");
        cause.getExtra().forEach(builder::withProperty);
        return builder.build();
    }
}
