package com.dossier.api.service.billing;

/** Anything Stripe refused, or a webhook signature that didn't verify (Phase 12). Carries a coarse {@link Kind} so callers decide retry vs. surface without importing Stripe types (K8.2 error mapping). */
public class StripeGatewayException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    /** Coarse failure class. {@code RATE_LIMITED}, {@code CONNECTION} and {@code SERVER} are safe to retry with the same idempotency key. */
    public enum Kind {
        /** Billing is off (blank key) or the operation is refused in this mode (live key and a test clock). */
        NOT_ENABLED(false),
        INVALID_REQUEST(false),
        CARD_DECLINED(false),
        AUTHENTICATION(false),
        PERMISSION(false),
        RATE_LIMITED(true),
        CONNECTION(true),
        SERVER(true),
        /** The same idempotency key is in flight or was used with different parameters. */
        IDEMPOTENCY_CONFLICT(false),
        OTHER(false);

        private final boolean retryable;

        Kind(boolean retryable) {
            this.retryable = retryable;
        }

        public boolean isRetryable() {
            return retryable;
        }
    }

    private final Kind kind;
    private final String stripeCode;

    public StripeGatewayException(String message) {
        this(message, Kind.OTHER, null, null);
    }

    public StripeGatewayException(String message, Throwable cause) {
        this(message, Kind.OTHER, null, cause);
    }

    public StripeGatewayException(String message, Kind kind, String stripeCode, Throwable cause) {
        super(message, cause);
        this.kind = kind == null ? Kind.OTHER : kind;
        this.stripeCode = stripeCode;
    }

    public Kind getKind() {
        return kind;
    }

    /** Stripe's error code (for example {@code resource_missing}), when it sent one. Never a secret. */
    public String getStripeCode() {
        return stripeCode;
    }

    public boolean isRetryable() {
        return kind.isRetryable();
    }
}
