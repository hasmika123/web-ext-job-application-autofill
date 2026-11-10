package com.dossier.api.domain.enumeration;

/**
 * A resume's place in a master-to-tailored family (DESIGN 8.9). Every uploaded, built, copied or
 * imported resume is a MASTER; only {@code tailor-copy} creates a TAILORED one. Stored by name.
 */
public enum ResumeRole {
    MASTER,
    TAILORED,
}
