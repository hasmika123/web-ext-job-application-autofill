package com.dossier.api.domain.enumeration;

/** Where a profile item came from (Resume Builder, DESIGN 2.5 / 5.2). Stored by name. */
public enum Provenance {
    PARSED,
    USER,
    LEARNED,
    AI,
}
