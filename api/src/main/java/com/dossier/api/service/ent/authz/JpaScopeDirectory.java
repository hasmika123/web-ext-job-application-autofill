package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.repository.ent.OrgScopeRepository;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link ScopeDirectory} over {@code org_member.team_group_id / department_group_id} (X4.3) with the pre-X4 single {@code group_id} as
 * the fallback for a member nobody has placed yet (their TEAM when that group's kind is TEAM, their DEPARTMENT when it is DEPARTMENT; a
 * COHORT is neither), and the department tree {@code org_group.parent_group_id} for {@link #teamsUnder}. There are no leads yet
 * ({@link #teamsLedBy} and {@link #departmentsLedBy} stay empty until X4.5 adds {@code lead_member_id}), so this can only
 * under-grant compared with the final rules.
 */
@Component
public class JpaScopeDirectory implements ScopeDirectory {

    private final OrgScopeRepository repository;

    public JpaScopeDirectory(OrgScopeRepository repository) {
        this.repository = repository;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<MemberFacts> member(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return Optional.empty();
        List<Object[]> rows = repository.findMemberFacts(orgId, memberId);
        if (rows.isEmpty()) return Optional.empty();
        Object[] r = rows.get(0);
        if (r[1] == com.dossier.api.domain.enumeration.OrgMemberStatus.ERASED) return Optional.empty(); // anonymised: nothing of them is in any scope
        Long groupId = (Long) r[2];
        OrgGroupKind kind = (OrgGroupKind) r[3];
        Long linkedTeam = r.length > 4 ? (Long) r[4] : null;
        Long linkedDepartment = r.length > 5 ? (Long) r[5] : null;
        // X4.3: the separate team and department links win; the legacy single group is the fallback for a member nobody has placed yet.
        Long team = linkedTeam != null ? linkedTeam : kind == OrgGroupKind.TEAM ? groupId : null;
        Long department = linkedDepartment != null ? linkedDepartment : kind == OrgGroupKind.DEPARTMENT ? groupId : null;
        return Optional.of(new MemberFacts(memberId, team, department));
    }

    @Override
    public Set<Long> teamsLedBy(Long orgId, Long memberId) {
        return Set.of();
    }

    @Override
    public Set<Long> departmentsLedBy(Long orgId, Long memberId) {
        return Set.of();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> teamsUnder(Long orgId, Collection<Long> departmentGroupIds) {
        if (orgId == null || departmentGroupIds == null || departmentGroupIds.isEmpty()) return Set.of();
        return new HashSet<>(repository.findTeamIdsUnder(orgId, departmentGroupIds));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> memberIdsInTeams(Long orgId, Collection<Long> teamGroupIds) {
        if (orgId == null || teamGroupIds == null || teamGroupIds.isEmpty()) return Set.of();
        return new HashSet<>(repository.findLiveMemberIdsInGroups(orgId, teamGroupIds));
    }
}
