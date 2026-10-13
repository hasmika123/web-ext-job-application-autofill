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
 * {@link ScopeDirectory} over what exists before X4: a member's one {@code group_id} is their TEAM when that group's kind is TEAM
 * and their DEPARTMENT when it is DEPARTMENT (a COHORT is neither). There are no leads and no group tree yet, so
 * {@link #teamsLedBy}, {@link #departmentsLedBy} and {@link #teamsUnder} are empty: this is a strict subset of the final TEAM and
 * DEPARTMENT rules (the final ones only add leads, hierarchy and the separate team/department links), so it can only
 * under-grant. X4.5/X4.3 replace it.
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
        Long team = kind == OrgGroupKind.TEAM ? groupId : null;
        Long department = kind == OrgGroupKind.DEPARTMENT ? groupId : null;
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
    public Set<Long> teamsUnder(Long orgId, Collection<Long> departmentGroupIds) {
        return Set.of();
    }

    @Override
    @Transactional(readOnly = true)
    public Set<Long> memberIdsInTeams(Long orgId, Collection<Long> teamGroupIds) {
        if (orgId == null || teamGroupIds == null || teamGroupIds.isEmpty()) return Set.of();
        return new HashSet<>(repository.findLiveMemberIdsInGroups(orgId, teamGroupIds));
    }
}
