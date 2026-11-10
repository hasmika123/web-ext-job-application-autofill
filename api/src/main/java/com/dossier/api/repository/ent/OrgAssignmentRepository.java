package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.enumeration.AssignmentKind;
import java.time.Instant;
import java.util.Collection;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Consultant assignments (X1.7 reads; X4.7 writes). The one question authorization asks is "is there an EFFECTIVE assignment
 * of this consultant to one of these assignees, of one of these kinds, at this instant": started, not ended, health OK
 * (17-consultant-assignments.md section 2). Every method names the organization first, so an assignment of another
 * organization can never satisfy the question.
 */
public interface OrgAssignmentRepository extends Repository<OrgAssignment, Long> {
    <S extends OrgAssignment> S save(S assignment);

    <S extends OrgAssignment> S saveAndFlush(S assignment);

    @Query(
        "select count(a) from OrgAssignment a where a.orgId = :orgId and a.consultantMemberId = :consultantMemberId " +
        "and a.assigneeMemberId in :assigneeMemberIds and a.kind in :kinds and a.startsAt <= :now " +
        "and (a.endsAt is null or a.endsAt > :now) and a.health = com.dossier.api.domain.enumeration.AssignmentHealth.OK"
    )
    long countEffective(
        @Param("orgId") Long orgId,
        @Param("consultantMemberId") Long consultantMemberId,
        @Param("assigneeMemberIds") Collection<Long> assigneeMemberIds,
        @Param("kinds") Collection<AssignmentKind> kinds,
        @Param("now") Instant now
    );

    long countByOrgId(Long orgId);

    /** The open rows (no end date) of one kind for one consultant seat: what the marketer assignment lifecycle ends or keeps. */
    @Query("select a from OrgAssignment a where a.orgId = :orgId and a.consultantMemberId = :consultantMemberId and a.kind = :kind and a.endsAt is null order by a.id")
    java.util.List<OrgAssignment> findOpenByConsultantAndKind(
        @Param("orgId") Long orgId,
        @Param("consultantMemberId") Long consultantMemberId,
        @Param("kind") AssignmentKind kind
    );

    /** The whole chain of one consultant seat, newest first (history). */
    @Query("select a from OrgAssignment a where a.orgId = :orgId and a.consultantMemberId = :consultantMemberId order by a.id desc")
    java.util.List<OrgAssignment> findByConsultant(@Param("orgId") Long orgId, @Param("consultantMemberId") Long consultantMemberId);
}
