package com.dossier.api.domain.enumeration;

/**
 * What kind of organization a tenant is (docs/design/org/tenant-model.md section 2.1). Stored by name in
 * {@code organization.type} (VARCHAR(40) since Enterprise V2, X1.2). {@link #COACH} is reserved: the service layer rejects
 * it until a flag enables it.
 */
public enum OrgType {
    COMPANY,
    SCHOOL,
    BOOTCAMP,
    OUTPLACEMENT,
    CONSULTANCY,
    /** Enterprise V2 (X1.2): a staffing or recruiting firm that markets consultants. */
    STAFFING,
    /** Enterprise V2 (X1.2): a professional-services firm. 21 characters, hence the widened column. */
    PROFESSIONAL_SERVICES,
    /** Reserved (tenant-model.md decision 10): no table, no code path. */
    COACH;

    /** True for a value the product does not accept yet. */
    public boolean isReserved() {
        return this == COACH;
    }
}
