package com.dossier.api.service.ent.jobs;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.dto.ent.JobDTO;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.OrgStateRules;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Who may do what on the Jobs page. Jobs are the organization's demand data, so the permissions are organization-level
 * (talent-foundation.md section 4): <b>view</b> needs {@code clients.view} or {@code pipeline.view}; <b>create / edit</b> a job needs
 * {@code requirements.manage}; <b>assign</b> a consultant from Top Matches needs {@code opportunities.manage} (a caller holding it at
 * ASSIGNED scope may only assign consultants they market, as primary or backup). Everything that fails is the generic 404: not holding
 * the key, roles not read from data, a closed organization for a write, another tenant's row.
 */
@Component
public class JobAccess {

    public static final List<String> VIEW_KEYS = List.of("clients.view", "pipeline.view");
    public static final String KEY_MANAGE = "requirements.manage";
    public static final String KEY_ASSIGN = "opportunities.manage";

    private final OrgRoleService roles;
    private final MarketerAssignmentRepository assignments;

    public JobAccess(OrgRoleService roles, MarketerAssignmentRepository assignments) {
        this.roles = roles;
        this.assignments = assignments;
    }

    public void requireView(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        if (VIEW_KEYS.stream().noneMatch(me::canKey)) throw new OrgNotFoundException();
    }

    public void requireWrite(OrgMembership me, String key) {
        requireView(me);
        if (!me.canKey(key)) throw new OrgNotFoundException();
        if (!OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(key))) throw new OrgNotFoundException();
    }

    public JobDTO.Access access(OrgMembership me) {
        boolean writable = OrgStateRules.allows(me.orgStatus(), AuthzOperation.WRITE, List.of(KEY_MANAGE));
        return new JobDTO.Access(me.canKey(KEY_MANAGE) && writable, me.canKey(KEY_MANAGE) && writable, me.canKey(KEY_ASSIGN) && writable);
    }

    /** True when the caller's {@code opportunities.manage} reaches this consultant. */
    public boolean mayAssign(OrgMembership me, Long consultantId) {
        Optional<PermissionScope> scope = me.scopeFor(KEY_ASSIGN);
        if (scope.isEmpty()) return false;
        return switch (scope.get()) {
            case ORG, DEPARTMENT, TEAM -> true;
            case OWN -> false;
            case ASSIGNED -> {
                Optional<MarketerAssignment> a = assignments.findByOrgIdAndConsultantId(me.orgId(), consultantId);
                yield a.isPresent() && (Objects.equals(a.get().getMarketerMemberId(), me.memberId()) || Objects.equals(a.get().getBackupMemberId(), me.memberId()));
            }
        };
    }
}
