package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one helper behind "does the actor have an open assignment to this consultant" (17-consultant-assignments.md section 2):
 * {@code ScopeEvaluator}'s ASSIGNED scope and {@code AuthorizationService} step 9 both ask exactly this, so they can never disagree
 * about what "open and effective" means (started, not ended, health OK, at this instant, in this organization).
 */
@Service
public class OrgAssignments {

    private final OrgAssignmentRepository repository;
    private final Clock clock;

    @Autowired
    public OrgAssignments(OrgAssignmentRepository repository) {
        this(repository, Clock.systemUTC());
    }

    OrgAssignments(OrgAssignmentRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    /** True when {@code assigneeMemberId} has an effective assignment of one of {@code kinds} to {@code consultantMemberId} now. */
    public boolean isActingFor(Long orgId, Long assigneeMemberId, Long consultantMemberId, Collection<AssignmentKind> kinds) {
        if (assigneeMemberId == null) return false;
        return isAssignedToAny(orgId, List.of(assigneeMemberId), consultantMemberId, kinds);
    }

    /** True when any of these assignees has such an assignment (a team's members holding the consultant). */
    @Transactional(readOnly = true)
    public boolean isAssignedToAny(Long orgId, Collection<Long> assigneeMemberIds, Long consultantMemberId, Collection<AssignmentKind> kinds) {
        if (orgId == null || consultantMemberId == null || assigneeMemberIds == null || assigneeMemberIds.isEmpty() || kinds == null || kinds.isEmpty()) return false;
        return repository.countEffective(orgId, consultantMemberId, assigneeMemberIds, kinds, Instant.now(clock)) > 0;
    }
}
