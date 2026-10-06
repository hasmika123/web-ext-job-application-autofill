package com.dossier.api.web.rest.errors;

import org.springframework.http.HttpStatus;
import org.springframework.web.ErrorResponseException;
import tech.jhipster.web.rest.errors.ProblemDetailWithCause.ProblemDetailWithCauseBuilder;

/**
 * Billing isn't configured on this server — HTTP <b>503</b>, {@code code=BILLING_DISABLED}
 * (Phase 12).
 *
 * <p>Not an error in the user's behaviour: {@code develop}, CI and local checkouts run without
 * Stripe secrets by design, and must still start and serve the rest of the API. Clients show
 * "coming soon" rather than a failure.
 */
@SuppressWarnings("java:S110") // Inheritance tree of classes should not be too deep
public class BillingDisabledException extends ErrorResponseException {

    private static final long serialVersionUID = 1L;

    public static final String CODE = "BILLING_DISABLED";

    public BillingDisabledException() {
        super(
            HttpStatus.SERVICE_UNAVAILABLE,
            ProblemDetailWithCauseBuilder.instance()
                .withStatus(HttpStatus.SERVICE_UNAVAILABLE.value())
                .withType(ErrorConstants.DEFAULT_TYPE)
                .withTitle("Billing is not configured on this server")
                .withProperty("code", CODE)
                .withProperty("message", "error.billingDisabled")
                .build(),
            null
        );
    }
}
