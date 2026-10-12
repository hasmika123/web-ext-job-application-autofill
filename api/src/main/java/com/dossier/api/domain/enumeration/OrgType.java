package com.dossier.api.domain.enumeration;

/**
 * What kind of organization a tenant is (docs/design/org/tenant-model.md section 2.1). Stored by name in
 * {@code organization.type}. {@link #COACH} is reserved: the service layer rejects it until a flag enables it.
 */
public enum OrgType {
    COMPANY,
    SCHOOL,
    BOOTCAMP,
    OUTPLACEMENT,
    CONSULTANCY,
    /** Reserved (tenant-model.md decision 10): no table, no code path. */
    COACH;

    /** True for a value the product does not accept yet. */
    public boolean isReserved() {
        return this == COACH;
    }
}
