package com.dossier.api.web.rest.errors;

import com.dossier.api.service.BillingException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of a {@link BillingException} (Phase 12.3) — status and
 * {@code code} come straight from the service exception, so there is one list of billing
 * failure codes rather than a web copy that drifts from it.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class BillingProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public BillingProblemException(BillingException cause) {
        super(
            HttpStatus.valueOf(cause.getStatus()),
            ProblemDetailWithCauseBuilder.instance()
                .withStatus(cause.getStatus())
                .withType(ErrorConstants.DEFAULT_TYPE)
                .withTitle(cause.getMessage())
                .withProperty("code", cause.getCode())
                .withProperty("message", "error.billing")
                .build(),
            cause
        );
    }
}
