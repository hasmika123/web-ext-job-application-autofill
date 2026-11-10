package com.dossier.api.repository.ent;

import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.org.OrgMember;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The reads behind "who changed this, and in what relation to the consultant it is about" (docs/change-audit/README.md section 2.5): the seats
 * that appear as actors, the consultants' own seats, and who is assigned to them. Every method names the organization first and every join stays
 * inside it, so a member id of another organization contributes nothing (it renders "a member", never a name).
 */
public interface EntChangeActorRepository extends Repository<OrgMember, Long> {
    @Query("select m from OrgMember m where m.orgId = :orgId and m.id in :ids")
    List<OrgMember> seats(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {@code [consultantProfileId, memberId]}: the seat a consultant profile belongs to (memberId may be null: a profile without a seat). */
    @Query("select c.id, c.memberId from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<Object[]> consultantSeats(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {@code [consultantProfileId, marketerMemberId, backupMemberId]} of the active marketer assignments of these consultant profiles. */
    @Query(
        "select a.consultantId, a.marketerMemberId, a.backupMemberId from MarketerAssignment a " +
        "where a.orgId = :orgId and a.consultantId in :ids and a.status = 'ACTIVE'"
    )
    List<Object[]> marketerAssignments(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {@code [consultantMemberId, assigneeMemberId]} of the assignments in effect at {@code now} (started, not ended) of these consultant seats. */
    @Query(
        "select a.consultantMemberId, a.assigneeMemberId from OrgAssignment a where a.orgId = :orgId and a.consultantMemberId in :ids " +
        "and a.kind in :kinds and a.startsAt <= :now and (a.endsAt is null or a.endsAt > :now)"
    )
    List<Object[]> effectiveAssignees(
        @Param("orgId") Long orgId,
        @Param("ids") Collection<Long> consultantMemberIds,
        @Param("kinds") Collection<AssignmentKind> kinds,
        @Param("now") Instant now
    );
}
