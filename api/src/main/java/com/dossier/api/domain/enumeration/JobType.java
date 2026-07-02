package com.dossier.api.domain.enumeration;

/**
 * The employment type of a tracked job (how the role is engaged). Stored as a string
 * (see {@link ApplicationStatus}) so the column stays human-readable and the set is a
 * fixed, strictly-validated enum. {@code OTHER} is the catch-all for anything captured
 * from a posting that doesn't map to a named value.
 */
public enum JobType {
    FULL_TIME,
    PART_TIME,
    CONTRACT,
    INTERNSHIP,
    TEMPORARY,
    OTHER,
}
