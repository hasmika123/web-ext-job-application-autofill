package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgType;

/**
 * Service-layer value rules for the organization tables that the schema cannot express. Today: the reserved
 * {@code COACH} values (tenant-model.md decision 10). Every service that assigns a type or a role goes through
 * here, so a reserved value can never be stored.
 */
public final class OrgRules {

    private OrgRules() {}

    /** Returns {@code type} when it may be stored; throws a 422 {@code RESERVED_VALUE} for COACH. */
    public static OrgType requireAssignable(OrgType type) {
        if (type == null) throw OrgException.invalid("type", "is required");
        if (type.isReserved()) throw OrgException.reserved("type", type.name());
        return type;
    }

    /** Returns {@code role} when it may be stored; throws a 422 {@code RESERVED_VALUE} for COACH. */
    public static OrgRole requireAssignable(OrgRole role) {
        if (role == null) throw OrgException.invalid("role", "is required");
        if (role.isReserved()) throw OrgException.reserved("role", role.name());
        return role;
    }
}
