package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import java.util.List;
import java.util.Optional;

/**
 * The resolved caller of an org endpoint: their seat in one organization and what the role allows. Produced only
 * by {@link OrgAccessService}; an endpoint that holds one has already been through the 404 gate.
 *
 * @param orgId     the organization the check was made against
 * @param memberId  the caller's {@code org_member} row
 * @param userId    the caller's account id
 * @param login     the caller's login (the audit trail is keyed by it)
 * @param role      the role in this org
 * @param status    the seat state; only ACTIVE seats are ever resolved
 * @param orgStatus the organization's lifecycle state (a CLOSED org is read-only)
 */
public record OrgMembership(Long orgId, Long memberId, Long userId, String login, OrgRole role, OrgMemberStatus status, OrgStatus orgStatus) {
    public boolean can(OrgPermission permission) {
        return role.can(permission);
    }

    /** The narrowing the service must apply when it uses {@code permission}; empty when the role does not hold it. */
    public Optional<OrgScope> scopeOf(OrgPermission permission) {
        return role.scopeOf(permission);
    }

    /** Wire form of every permission the role holds, in declaration order (the web gates its UI on this list). */
    public List<String> permissionKeys() {
        return role.permissions().stream().map(OrgPermission::key).toList();
    }
}
