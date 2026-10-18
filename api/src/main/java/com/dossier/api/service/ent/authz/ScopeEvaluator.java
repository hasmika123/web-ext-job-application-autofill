package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.OrgMembership;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

/**
 * "Is this member inside the actor's scope for this permission?" (05-permission-model.md section 4). A scope says WHICH rows;
 * consent says which fields of them. Wider scopes include the narrower ones (OWN is always inside ASSIGNED, and so on up to ORG),
 * and a target that is not a member of the actor's own organization is outside every scope, ORG included: a scope never leaves
 * the tenant.
 *
 * <ul>
 *   <li>OWN: the actor themself.</li>
 *   <li>ASSIGNED: a consultant with an effective {@code org_assignment} (PRIMARY, BACKUP or DELEGATE unless the caller narrows
 *       the kinds) to the actor. A MANAGER assignment is a different relationship (approvals) and does not count.</li>
 *   <li>TEAM: a member of a team the actor belongs to or leads, and a consultant assigned to one of those team members.</li>
 *   <li>DEPARTMENT: a member of a department the actor belongs to or leads, of a team under such a department, or anyone TEAM reaches.</li>
 *   <li>ORG: every member of the organization.</li>
 * </ul>
 *
 * It fails closed: a null scope, a null target, an unknown member and a directory that knows nothing all answer {@code false}.
 */
@Service
public class ScopeEvaluator {

    private final ScopeDirectory directory;
    private final OrgAssignments assignments;

    public ScopeEvaluator(ScopeDirectory directory, OrgAssignments assignments) {
        this.directory = directory;
        this.assignments = assignments;
    }

    /** {@link #inScope(OrgMembership, PermissionScope, Long, Set)} with the default kinds (PRIMARY, BACKUP, DELEGATE). */
    public boolean inScope(OrgMembership actor, PermissionScope scope, Long targetMemberId) {
        return inScope(actor, scope, targetMemberId, AssignmentKind.ACTING);
    }

    /** True when {@code targetMemberId} is inside {@code scope} for {@code actor}; {@code assignedKinds} narrows what ASSIGNED (and the assignments of TEAM) accept. */
    public boolean inScope(OrgMembership actor, PermissionScope scope, Long targetMemberId, Set<AssignmentKind> assignedKinds) {
        if (actor == null || scope == null || targetMemberId == null) return false;
        Long orgId = actor.orgId();
        Long actorId = actor.memberId();
        if (orgId == null || actorId == null) return false;

        if (scope == PermissionScope.OWN) return actorId.equals(targetMemberId);
        if (actorId.equals(targetMemberId)) return directory.member(orgId, targetMemberId).isPresent(); // your own record, while your seat exists
        Optional<ScopeDirectory.MemberFacts> target = directory.member(orgId, targetMemberId);
        if (target.isEmpty()) return false; // not a member of THIS organization: outside every scope, ORG included
        if (scope == PermissionScope.ORG) return true;
        if (scope == PermissionScope.ASSIGNED) return assignments.isActingFor(orgId, actorId, targetMemberId, assignedKinds);

        Optional<ScopeDirectory.MemberFacts> me = directory.member(orgId, actorId);
        if (me.isEmpty()) return false;
        Set<Long> myTeams = new HashSet<>(directory.teamsLedBy(orgId, actorId));
        if (me.get().teamGroupId() != null) myTeams.add(me.get().teamGroupId());
        if (inTeamScope(orgId, myTeams, target.get(), targetMemberId, assignedKinds)) return true;
        if (scope == PermissionScope.TEAM) return false;

        // DEPARTMENT
        Set<Long> myDepartments = new HashSet<>(directory.departmentsLedBy(orgId, actorId));
        if (me.get().departmentGroupId() != null) myDepartments.add(me.get().departmentGroupId());
        if (myDepartments.isEmpty()) return false;
        if (target.get().departmentGroupId() != null && myDepartments.contains(target.get().departmentGroupId())) return true;
        if (!java.util.Collections.disjoint(myDepartments, directory.departmentsLedBy(orgId, targetMemberId))) return true; // the department's lead counts as a member of it
        Set<Long> teamsInMyDepartments = directory.teamsUnder(orgId, myDepartments);
        if (target.get().teamGroupId() != null && teamsInMyDepartments.contains(target.get().teamGroupId())) return true;
        // consultants assigned to anyone in those teams are the department's too
        return inTeamScope(orgId, teamsInMyDepartments, target.get(), targetMemberId, assignedKinds);
    }

    private boolean inTeamScope(Long orgId, Set<Long> teams, ScopeDirectory.MemberFacts target, Long targetMemberId, Set<AssignmentKind> kinds) {
        if (teams.isEmpty()) return false;
        if (target.teamGroupId() != null && teams.contains(target.teamGroupId())) return true;
        if (!java.util.Collections.disjoint(teams, directory.teamsLedBy(orgId, targetMemberId))) return true; // a team's lead counts as a member of it (05 section 4)
        Set<Long> teammates = directory.memberIdsInTeams(orgId, teams);
        return assignments.isAssignedToAny(orgId, teammates, targetMemberId, kinds);
    }
}
