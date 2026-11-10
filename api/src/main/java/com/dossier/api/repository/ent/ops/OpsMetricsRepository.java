package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Cross-table aggregates behind the Reports overview (and any page that needs the same number). Query-only: it owns no table (the entity type is
 * only the anchor Spring Data needs). Every method takes the organization id first and filters every joined table by it. Dates are UTC.
 */
public interface OpsMetricsRepository extends Repository<TalentApplication, Long> {

    /** Applications by source label in a window: {@code [source_label, count]}, biggest first ("Applications by Source" donut). */
    @Query("select coalesce(a.sourceLabel, 'Other'), count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn between :from and :to group by coalesce(a.sourceLabel, 'Other') order by count(a) desc")
    List<Object[]> applicationsBySource(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Placements started in a window by the client's industry: {@code [industry, count]}, biggest first ("Placements by Department" bar chart, industry reading). */
    @Query("select coalesce(c.industry, 'Other'), count(p) from TalentPlacement p, ClientAccount c where p.orgId = :orgId and c.orgId = :orgId and c.id = p.clientId and p.startDate between :from and :to group by coalesce(c.industry, 'Other') order by count(p) desc")
    List<Object[]> placementsByClientIndustry(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Placements started in a window by the consultant's department: {@code [department name, count]}, biggest first (same chart, department reading). */
    @Query("select coalesce(g.name, 'Unassigned'), count(p) from TalentPlacement p, ConsultantProfile k left join OrgGroup g on g.id = k.departmentGroupId and g.orgId = :orgId where p.orgId = :orgId and k.orgId = :orgId and k.id = p.consultantId and p.startDate between :from and :to group by coalesce(g.name, 'Unassigned') order by count(p) desc")
    List<Object[]> placementsByConsultantDepartment(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);

    /** Distinct applications that entered a stage in a window (interview conversion numerator: stage INTERVIEWING). */
    @Query("select count(distinct e.applicationId) from TalentApplicationEvent e where e.orgId = :orgId and e.toStage = :stage and e.occurredAt >= :from and e.occurredAt < :to")
    long countApplicationsEnteringStage(@Param("orgId") Long orgId, @Param("stage") String stage, @Param("from") Instant from, @Param("to") Instant to);

    /** Distinct applications created in a window (interview conversion denominator). */
    @Query("select count(a) from TalentApplication a where a.orgId = :orgId and a.createdAt >= :from and a.createdAt < :to")
    long countApplicationsCreated(@Param("orgId") Long orgId, @Param("from") Instant from, @Param("to") Instant to);

    /** Applications per calendar month: {@code [year, month, count]} oldest first ("Applications Trend"). */
    @Query("select year(a.appliedOn), month(a.appliedOn), count(a) from TalentApplication a where a.orgId = :orgId and a.appliedOn between :from and :to group by year(a.appliedOn), month(a.appliedOn) order by year(a.appliedOn), month(a.appliedOn)")
    List<Object[]> applicationsPerMonth(@Param("orgId") Long orgId, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
