package com.dossier.api.service.dto.org;

import com.dossier.api.domain.enumeration.OrgRole;
import java.util.List;

/**
 * Body of {@code POST /api/orgs/{orgId}/members/invite} and {@code POST /api/orgs/{orgId}/invitations}
 * (15-employees-and-teams.md section 2; 40-api-specs.md): up to the admin-configured number of addresses (default 200), the SAME roles
 * and placement for all of them. Each entry is an address or {@code Name <address>}.
 *
 * <p>Roles: {@code roleIds} (first = primary) are org_role ids, a system template or one of the organization's own. A missing list
 * falls back to the legacy {@code role} enum (kept so existing callers work), then to the organization's default: CONSULTANT for a
 * consultancy-type organization, else the {@code defaultRole} setting. Placement: {@code departmentGroupId} / {@code teamGroupId} are
 * org_group ids of that kind, {@code managerMemberId} an active member; {@code groupId} and {@code supportOwnerMemberId} are the legacy
 * cohort and staff-support fields. {@code fullName} names a SINGLE-address invitation (ignored for several); {@code message} is a short
 * plain-text note shown on the join card and in the email.
 */
public record OrgInviteRequest(
    List<String> emails,
    OrgRole role,
    Long groupId,
    Long supportOwnerMemberId,
    List<Long> roleIds,
    Long departmentGroupId,
    Long teamGroupId,
    Long managerMemberId,
    String fullName,
    String message
) {
    /** The legacy four-field shape (role enum, cohort, support owner): the roles and placement default. */
    public OrgInviteRequest(List<String> emails, OrgRole role, Long groupId, Long supportOwnerMemberId) {
        this(emails, role, groupId, supportOwnerMemberId, null, null, null, null, null, null);
    }
}
