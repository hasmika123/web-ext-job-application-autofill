package com.dossier.api.service.ent.authz;

/** What kind of operation is being authorized: it decides what a PAST_DUE / SUSPENDED / CLOSED organization still allows and whether a wide scope may skip the assignment of step 9. */
public enum AuthzOperation {
    READ,
    WRITE;

    /** GET, HEAD and OPTIONS read; everything else writes (an unknown verb is a write: the stricter rule). */
    public static AuthzOperation ofHttpMethod(String method) {
        if (method == null) return WRITE;
        return switch (method.toUpperCase(java.util.Locale.ROOT)) {
            case "GET", "HEAD", "OPTIONS" -> READ;
            default -> WRITE;
        };
    }
}
