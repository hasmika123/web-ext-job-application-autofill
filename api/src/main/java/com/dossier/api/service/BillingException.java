package com.dossier.api.service;

/**
 * A billing operation the server refused, with a machine-readable reason (Phase 12.3).
 *
 * <p>Service-layer exception, mapped to a ProblemDetail by {@code ExceptionTranslator} — the
 * service layer may not depend on the web layer (enforced by {@code TechnicalStructureTest}),
 * the same split {@code EmailAlreadyUsedException} uses.
 *
 * <p>Clients branch on {@link #getCode()}, never on the message:
 *
 * <ul>
 *   <li>{@code BILLING_DISABLED} (503) — this server has no Stripe key. Not a user error: it is
 *       how develop, CI and a fresh clone run, so clients say "coming soon".</li>
 *   <li>{@code ALREADY_SUBSCRIBED} (409) — they're already Pro; send them to the portal instead.</li>
 *   <li>{@code NO_CUSTOMER} (404) — no Stripe customer yet, so there is no portal to open.</li>
 *   <li>{@code UNKNOWN_PRICE} (400) — the requested plan isn't one we sell.</li>
 *   <li>{@code STRIPE_ERROR} (502) — Stripe refused; the detail is safe to show.</li>
 * </ul>
 */
public class BillingException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_BILLING_DISABLED = "BILLING_DISABLED";
    public static final String CODE_ALREADY_SUBSCRIBED = "ALREADY_SUBSCRIBED";
    public static final String CODE_NO_CUSTOMER = "NO_CUSTOMER";
    public static final String CODE_UNKNOWN_PRICE = "UNKNOWN_PRICE";
    public static final String CODE_STRIPE_ERROR = "STRIPE_ERROR";

    private final int status;
    private final String code;
    private final java.util.Map<String, Object> extra;

    public BillingException(int status, String code, String message) {
        this(status, code, message, null);
    }

    /** With machine-readable details the client can act on ({@code QUOTE_STALE {reason}}, {@code QUANTITY_LIMIT {max}}, {@code PLAN_SUNSET {successor}}); additive. */
    public BillingException(int status, String code, String message, java.util.Map<String, Object> extra) {
        super(message);
        this.status = status;
        this.code = code;
        this.extra = extra == null ? java.util.Map.of() : java.util.Collections.unmodifiableMap(new java.util.LinkedHashMap<>(extra));
    }

    /** Details emitted as extra problem properties; empty for the original codes. */
    public java.util.Map<String, Object> getExtra() {
        return extra;
    }

    public static BillingException disabled() {
        return new BillingException(503, CODE_BILLING_DISABLED, "Billing is not configured on this server");
    }

    public int getStatus() {
        return status;
    }

    public String getCode() {
        return code;
    }
}
