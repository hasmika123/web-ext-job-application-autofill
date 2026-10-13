package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;

/**
 * Body of group create (name required) and patch (every field optional). {@code sortOrder} is 0..9999.
 *
 * <p>X4.5: {@code parentGroupId} puts a TEAM under a DEPARTMENT; {@code leadMemberId} names the lead (an ACTIVE member of the
 * organization); {@code clearParent} / {@code clearLead} remove them (JSON cannot tell an absent field from a null one in a
 * record, so clearing is explicit); {@code status} is ACTIVE or INACTIVE; {@code icon} and {@code color} come from the closed
 * picker lists. Anything else in the body (an {@code orgId}, a {@code version}, a {@code createdAt}) is ignored: the entity is
 * never bound from the request.
 */
public record OrgGroupRequest(
    String name,
    OrgGroupKind kind,
    Integer sortOrder,
    Long parentGroupId,
    Long leadMemberId,
    Boolean clearParent,
    Boolean clearLead,
    String status,
    String icon,
    String color
) {
    /** The original three-field form. */
    public OrgGroupRequest(String name, OrgGroupKind kind, Integer sortOrder) {
        this(name, kind, sortOrder, null, null, null, null, null, null, null);
    }
}
