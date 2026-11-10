package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.org.OrgMembership;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** In-memory stand-ins for the authorization collaborators, so the evaluation order is proven without a database. */
final class AuthzFakes {

    private AuthzFakes() {}

    /** A directory of one organization. Anything not registered does not exist in it. */
    static final class Directory implements ScopeDirectory {

        final Map<Long, MemberFacts> members = new HashMap<>();
        final Map<Long, Set<Long>> teamsLed = new HashMap<>();
        final Map<Long, Set<Long>> departmentsLed = new HashMap<>();
        final Map<Long, Set<Long>> teamsUnderDepartment = new HashMap<>();

        Directory member(long id, Long team, Long department) {
            members.put(id, new MemberFacts(id, team, department));
            return this;
        }

        Directory leadsTeam(long memberId, long team) {
            teamsLed.computeIfAbsent(memberId, k -> new HashSet<>()).add(team);
            return this;
        }

        Directory leadsDepartment(long memberId, long department) {
            departmentsLed.computeIfAbsent(memberId, k -> new HashSet<>()).add(department);
            return this;
        }

        Directory teamUnder(long department, long team) {
            teamsUnderDepartment.computeIfAbsent(department, k -> new HashSet<>()).add(team);
            return this;
        }

        @Override
        public Optional<MemberFacts> member(Long orgId, Long memberId) {
            return Optional.ofNullable(members.get(memberId));
        }

        @Override
        public Set<Long> teamsLedBy(Long orgId, Long memberId) {
            return teamsLed.getOrDefault(memberId, Set.of());
        }

        @Override
        public Set<Long> departmentsLedBy(Long orgId, Long memberId) {
            return departmentsLed.getOrDefault(memberId, Set.of());
        }

        @Override
        public Set<Long> teamsUnder(Long orgId, Collection<Long> departmentGroupIds) {
            Set<Long> out = new HashSet<>();
            for (Long d : departmentGroupIds) out.addAll(teamsUnderDepartment.getOrDefault(d, Set.of()));
            return out;
        }

        @Override
        public Set<Long> memberIdsInTeams(Long orgId, Collection<Long> teamGroupIds) {
            Set<Long> out = new HashSet<>();
            for (MemberFacts f : members.values()) if (f.teamGroupId() != null && teamGroupIds.contains(f.teamGroupId())) out.add(f.memberId());
            return out;
        }
    }

    /** Effective assignments only (the real repository filters start, end and health). */
    static final class Assignments extends OrgAssignments {

        record Row(long assignee, long consultant, AssignmentKind kind) {}

        final List<Row> effective = new java.util.ArrayList<>();

        Assignments() {
            super(null);
        }

        Assignments add(long assignee, long consultant, AssignmentKind kind) {
            effective.add(new Row(assignee, consultant, kind));
            return this;
        }

        @Override
        public boolean isAssignedToAny(Long orgId, Collection<Long> assigneeMemberIds, Long consultantMemberId, Collection<AssignmentKind> kinds) {
            if (assigneeMemberIds == null || consultantMemberId == null || kinds == null) return false;
            return effective.stream().anyMatch(r -> r.consultant == consultantMemberId && assigneeMemberIds.contains(r.assignee) && kinds.contains(r.kind));
        }
    }

    static OrgMembership membership(long orgId, long memberId, OrgRole mirror, OrgStatus orgStatus, Map<String, PermissionScope> grants) {
        return new OrgMembership(
            orgId, memberId, 1000 + memberId, "u" + memberId, mirror, OrgMemberStatus.ACTIVE, orgStatus,
            List.of(new OrgMembership.RoleRef(1L, "R", "R", true)), new LinkedHashMap<>(grants)
        );
    }

    static OrgMembership membership(long orgId, long memberId, Map<String, PermissionScope> grants) {
        return membership(orgId, memberId, OrgRole.MARKETER, OrgStatus.ACTIVE, grants);
    }
}
