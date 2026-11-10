package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.ReportDefinition;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code report_definition}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface ReportDefinitionRepository extends Repository<ReportDefinition, Long> {
    <S extends ReportDefinition> S save(S entity);

    <S extends ReportDefinition> S saveAndFlush(S entity);

    void flush();

    <S extends ReportDefinition> List<S> saveAll(Iterable<S> entities);

    <S extends ReportDefinition> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<ReportDefinition> findByOrgIdAndId(Long orgId, Long id);

    List<ReportDefinition> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<ReportDefinition> findByOrgIdAndName(Long orgId, String name);

    List<ReportDefinition> findByOrgIdAndStatusOrderByLastRunAtDesc(Long orgId, String status);

    List<ReportDefinition> findByOrgIdAndStatusAndScheduleFrequencyNot(Long orgId, String status, String scheduleFrequency);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndStatusAndScheduleFrequencyNot(Long orgId, String status, String scheduleFrequency);

    /** The Reports Library: every filter optional ({@code null} = no filter, {@code q} empty = all, lower case); {@code q} matches name or description. */
    @Query("select d from ReportDefinition d where d.orgId = :orgId and d.status = 'ACTIVE' and (:type is null or d.reportType = :type) and (:ownerId is null or d.ownerMemberId = :ownerId) "
        + "and (:frequency is null or d.scheduleFrequency = :frequency) and (:q = '' or lower(d.name) like concat('%', :q, '%') or lower(d.description) like concat('%', :q, '%'))")
    Page<ReportDefinition> search(@Param("orgId") Long orgId, @Param("type") String type, @Param("ownerId") Long ownerId, @Param("frequency") String frequency, @Param("q") String q, Pageable pageable);
}
