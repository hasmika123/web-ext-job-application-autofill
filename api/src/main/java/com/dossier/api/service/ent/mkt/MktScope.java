package com.dossier.api.service.ent.mkt;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * The one gate every Marketing-workspace endpoint (`/api/orgs/{orgId}/mkt/**`) goes through. It answers two
 * questions: may this caller use the page at all, and WHICH consultants may it show them.
 *
 * <p>Gate (same generic 404 as an organization that does not exist, never a 403): the roles flag is on for the org, the marketing
 * module is on, and the caller holds the page's permission key (fixed authorization order of {@link AuthorizationService}).
 *
 * <p>Scope: a caller whose scope for the key is ORG sees every consultant; anyone narrower (ASSIGNED for a Marketing Specialist)
 * sees only the consultants that have a {@code marketer_assignment} row naming them as the marketer or the backup. The Marketing
 * workspace never widens beyond that, and a consultant id outside the set is answered as "not found" by {@link #require}.
 * E1: a marketer prepares, requests and records; the consultant submits. No endpoint behind this gate submits for anyone.
 */
@Service
public class MktScope {

    /** What the caller may see. {@code all} means every consultant of the org (then {@code consultantIds} is empty and unused). */
    public record View(Long orgId, Long memberId, boolean all, Set<Long> consultantIds) {
        public boolean sees(Long consultantId) {
            return all || consultantIds.contains(consultantId);
        }
    }

    private final OrgRoleService roles;
    private final TenantModules modules;
    private final AuthorizationService authorization;
    private final MarketerAssignmentRepository assignments;

    public MktScope(OrgRoleService roles, TenantModules modules, AuthorizationService authorization, MarketerAssignmentRepository assignments) {
        this.roles = roles;
        this.modules = modules;
        this.authorization = authorization;
        this.assignments = assignments;
    }

    /** Gate on {@code permissionKey} and resolve the consultants the caller may see. Throws {@link OrgNotFoundException} (404) otherwise. */
    public View resolve(OrgMembership me, String permissionKey) {
        if (me == null || !roles.rolesFromData(me.orgId()) || !modules.isOn(TenantModule.MARKETING, me.orgId())) throw new OrgNotFoundException();
        authorization.require(AuthzRequest.of(me.orgId(), List.of(permissionKey), Beneficiary.NONE, null, AuthzOperation.READ).withActor(me));
        PermissionScope scope = me.scopeFor(permissionKey).orElseThrow(OrgNotFoundException::new);
        if (scope == PermissionScope.ORG) return new View(me.orgId(), me.memberId(), true, Set.of());
        Set<Long> ids = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgIdAndMarketerMemberId(me.orgId(), me.memberId())) ids.add(a.getConsultantId());
        for (MarketerAssignment a : assignments.findByOrgIdAndBackupMemberId(me.orgId(), me.memberId())) ids.add(a.getConsultantId());
        return new View(me.orgId(), me.memberId(), false, Set.copyOf(ids));
    }

    /** A consultant id the caller may not see is the same 404 as one that does not exist. */
    public void require(View view, Long consultantId) {
        if (!view.sees(consultantId)) throw new OrgNotFoundException();
    }
}
