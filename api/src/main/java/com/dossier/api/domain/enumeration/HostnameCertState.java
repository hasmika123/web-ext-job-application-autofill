package com.dossier.api.domain.enumeration;

/** Where the certificate for a hostname stands, as far as the "ask" endpoint hits can tell (ADR-002). */
public enum HostnameCertState {
    NONE,
    REQUESTED,
    ISSUED,
    FAILED,
}
