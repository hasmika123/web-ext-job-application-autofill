package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.ent.OrgScopeRepository;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link ScopeDirectory} over the real organization structure (X4.5). A member's TEAM is {@code team_group_id}, falling back to the
 * legacy {@code group_id} when that group is a TEAM; their DEPARTMENT is {@code department_group_id}, then the department their
 * team sits under, then a legacy {@code group_id} that is a DEPARTMENT (a COHORT is neither). Leads come from
 * {@code org_group.lead_member_id} and the team to department tree from {@code parent_group_id}. A lead counts as a member of the
 * group they lead, so the people of a led team include the lead. Every query names the organization: an id of another organization
 * yields nothing.
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
        if (r[1] == OrgMemberStatus.ERASED) return Optional.empty(); // anonymised: nothing of them is in any scope
        Long legacyGroupId = (Long) r[2];
        OrgGroupKind legacyKind = (OrgGroupKind) r[3];
        Long department = (Long) r[4];
        Long team = (Long) r[5];
        Long teamParent = (Long) r[6];
        if (team == null && legacyKind == OrgGroupKind.TEAM) team = legacyGroupId;
        if (department == null) department = teamParent;
        if (department == null && legacyKind == OrgGroupKind.DEPARTMENT) department = legacyGroupId;
        return Optional.of(new MemberFacts(memberId, team, department));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> teamsLedBy(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return Set.of();
        return new HashSet<>(repository.findGroupIdsLedBy(orgId, memberId, OrgGroupKind.TEAM));
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> departmentsLedBy(Long orgId, Long memberId) {
        if (orgId == null || memberId == null) return Set.of();
        return new HashSet<>(repository.findGroupIdsLedBy(orgId, memberId, OrgGroupKind.DEPARTMENT));
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
        Set<Long> out = new HashSet<>(repository.findLiveMemberIdsInGroups(orgId, teamGroupIds));
        out.addAll(repository.findLeadsOf(orgId, teamGroupIds)); // a lead counts as a member of the team they lead
        return out;
    }
}
