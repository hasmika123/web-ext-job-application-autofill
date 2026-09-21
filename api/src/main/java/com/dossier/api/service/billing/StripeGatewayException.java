package com.dossier.api.service.billing;

/** Anything Stripe refused, or a webhook signature that didn't verify (Phase 12). */
public class StripeGatewayException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public StripeGatewayException(String message) {
        super(message);
    }

    public StripeGatewayException(String message, Throwable cause) {
        super(message, cause);
    }
}
