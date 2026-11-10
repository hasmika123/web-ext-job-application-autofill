package com.dossier.api.service.usage;

/** A ledger call that cannot proceed; {@link #getCode()} is the machine-readable reason. */
public class UsageLedgerException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public static final String ALREADY_RELEASED = "ALREADY_RELEASED";
    public static final String ALREADY_COMMITTED = "ALREADY_COMMITTED";
    public static final String NOT_FOUND = "NOT_FOUND";
    public static final String INVALID_QUANTITY = "INVALID_QUANTITY";

    private final String code;

    public UsageLedgerException(String code, String message) {
        super(message);
        this.code = code;
    }

    public String getCode() {
        return code;
    }
}
