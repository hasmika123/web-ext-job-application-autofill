package com.dossier.api.domain.enumeration;

/**
 * The workplace mode of a tracked job (where the role is performed). Stored as a string
 * (see {@link ApplicationStatus}); a fixed, strictly-validated enum. {@code ON_SITE} is
 * "in-person". {@code OTHER} is the catch-all for anything that doesn't map to a named value.
 */
public enum JobMode {
    ON_SITE,
    HYBRID,
    REMOTE,
    OTHER,
}
