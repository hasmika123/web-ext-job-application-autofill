package com.dossier.api.web.rest.errors;

import com.dossier.api.service.DemoException;
import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Web-layer rendering of a {@link DemoException} (phase demo): HTTP <b>403 Forbidden</b> with a
 * machine-readable {@code code} ({@code DEMO_DISABLED} or {@code DEMO_READ_ONLY}) the web app turns
 * into a toast instead of a generic error.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class DemoProblemException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public DemoProblemException(DemoException cause) {
        super(
            HttpStatus.FORBIDDEN,
            ProblemDetailWithCauseBuilder.instance()
                .withStatus(HttpStatus.FORBIDDEN.value())
                .withType(ErrorConstants.DEFAULT_TYPE)
                .withTitle(cause.getMessage())
                .withProperty("code", cause.getCode())
                .withProperty("message", "error.demo")
                .build(),
            cause
        );
    }
}
