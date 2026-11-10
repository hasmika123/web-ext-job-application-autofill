package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.MarketerAssignmentSchedule;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code marketer_assignment_schedule}: every method takes the organization id first. The cross-organization "what is due" scan lives in the scheduled job, not here. */
public interface MarketerAssignmentScheduleRepository extends Repository<MarketerAssignmentSchedule, Long> {
    <S extends MarketerAssignmentSchedule> S save(S entity);

    <S extends MarketerAssignmentSchedule> S saveAndFlush(S entity);

    Optional<MarketerAssignmentSchedule> findByOrgIdAndId(Long orgId, Long id);

    /** The plans of one consultant in these statuses, soonest first. */
    @Query("select s from MarketerAssignmentSchedule s where s.orgId = :orgId and s.consultantId = :consultantId and s.status in :statuses order by s.startsAt asc, s.id asc")
    List<MarketerAssignmentSchedule> findByConsultantAndStatus(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("statuses") Collection<String> statuses);

    /** Every plan of the organization in these statuses, soonest first. */
    @Query("select s from MarketerAssignmentSchedule s where s.orgId = :orgId and s.status in :statuses order by s.startsAt asc, s.id asc")
    List<MarketerAssignmentSchedule> findByStatus(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);

    /** Plans in these statuses that name this member as the new or the returning marketer (offboarding). */
    @Query("select s from MarketerAssignmentSchedule s where s.orgId = :orgId and s.status in :statuses and (s.newMarketerMemberId = :memberId or s.returnMarketerMemberId = :memberId) order by s.id")
    List<MarketerAssignmentSchedule> findByStatusInvolving(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses, @Param("memberId") Long memberId);

    long countByOrgId(Long orgId);
}
