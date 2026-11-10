package com.dossier.api.service;

/**
 * A demo-account rule the server enforced (phase demo): either the demo accounts are switched off,
 * or a demo account tried to change something it may not.
 *
 * <p>Service-layer exception rendered as a 403 ProblemDetail by {@code ExceptionTranslator} (the
 * service layer may not depend on the web layer — see {@code TechnicalStructureTest}). Clients
 * branch on {@link #getCode()}, never on the message:
 *
 * <ul>
 *   <li>{@code DEMO_DISABLED} — the demo switch is off, so demo logins are refused.</li>
 *   <li>{@code DEMO_READ_ONLY} — a demo account attempted a change that is not saved.</li>
 * </ul>
 */
public class DemoException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_DEMO_DISABLED = "DEMO_DISABLED";
    public static final String CODE_DEMO_READ_ONLY = "DEMO_READ_ONLY";

    private final String code;

    public DemoException(String code, String message) {
        super(message);
        this.code = code;
    }

    public static DemoException disabled() {
        return new DemoException(CODE_DEMO_DISABLED, "Demo accounts are currently disabled");
    }

    public static DemoException readOnly() {
        return new DemoException(CODE_DEMO_READ_ONLY, "This is a demo account — changes aren't saved");
    }

    public String getCode() {
        return code;
    }
}
