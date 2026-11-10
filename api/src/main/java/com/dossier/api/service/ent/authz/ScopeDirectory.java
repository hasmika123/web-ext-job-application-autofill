package com.dossier.api.service.ent.authz;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;

/**
 * Who sits where, as {@link ScopeEvaluator} needs it: a member's team and department, the groups someone leads, which teams
 * belong to a department and who is in a set of teams. An interface so the evaluator is proven against every relationship with
 * a table-driven test, and so X4 (which adds {@code org_member.team_group_id / department_group_id}, {@code org_group.lead_member_id}
 * and the group tree) swaps the implementation without touching the evaluator. Every method names the organization: an id of
 * another organization yields nothing.
 */
public interface ScopeDirectory {
    /** Facts about one member of the organization; empty when there is no such member in it. */
    Optional<MemberFacts> member(Long orgId, Long memberId);

    /** The teams {@code memberId} leads (a lead counts as a member of the team, 05 section 4). */
    Set<Long> teamsLedBy(Long orgId, Long memberId);

    /** The departments {@code memberId} leads. */
    Set<Long> departmentsLedBy(Long orgId, Long memberId);

    /** The teams that belong to any of these departments. */
    Set<Long> teamsUnder(Long orgId, Collection<Long> departmentGroupIds);

    /** The live members of any of these teams. */
    Set<Long> memberIdsInTeams(Long orgId, Collection<Long> teamGroupIds);

    /** A member's place. {@code teamGroupId} / {@code departmentGroupId} are null when they have none. */
    record MemberFacts(Long memberId, Long teamGroupId, Long departmentGroupId) {}
}
