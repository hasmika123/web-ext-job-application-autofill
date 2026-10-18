package com.dossier.api.domain.enumeration;

import java.util.Set;

/** State of an {@code org_member} row (tenant-model.md section 2.2). */
public enum OrgMemberStatus {
    INVITED,
    ACTIVE,
    SUSPENDED,
    LEFT,
    REMOVED,
    /** The person deleted their account; the row is anonymised and kept (section 6). */
    ERASED;

    /** The states in which a row is "live": it holds the unique active_key / active_user_key slot. */
    public static final Set<OrgMemberStatus> LIVE = Set.of(INVITED, ACTIVE, SUSPENDED);
}
