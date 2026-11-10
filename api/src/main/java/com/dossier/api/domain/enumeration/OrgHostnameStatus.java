package com.dossier.api.domain.enumeration;

/**
 * Lifecycle of an {@code org_hostname} row (ADR-002/003). Only {@link #ACTIVE} resolves to the organization and may be
 * answered 200 by the certificate "ask" endpoint; every other state, including {@link #VERIFIED}, is an unknown host.
 * {@link #REMOVED} keeps the row for history but frees the name.
 */
public enum OrgHostnameStatus {
    PENDING,
    VERIFYING,
    VERIFIED,
    ACTIVE,
    SUSPENDED,
    REMOVED,
}
