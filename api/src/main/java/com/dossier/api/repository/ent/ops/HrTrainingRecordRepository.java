package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrTrainingRecord;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code hr_training_record}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrTrainingRecordRepository extends Repository<HrTrainingRecord, Long> {
    <S extends HrTrainingRecord> S save(S entity);

    <S extends HrTrainingRecord> S saveAndFlush(S entity);

    void flush();

    <S extends HrTrainingRecord> List<S> saveAll(Iterable<S> entities);

    <S extends HrTrainingRecord> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrTrainingRecord> findByOrgIdAndId(Long orgId, Long id);

    List<HrTrainingRecord> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrTrainingRecord> findByOrgIdAndEmployeeId(Long orgId, Long employeeId);

    /** Required-training records due on or before a date (the denominator of "Compliance Completion" as of that date). */
    @Query("select count(r) from HrTrainingRecord r, HrTraining t where r.orgId = :orgId and t.orgId = :orgId and t.id = r.trainingId and t.required = true and r.dueOn <= :asOf")
    long countDueOnOrBefore(@Param("orgId") Long orgId, @Param("asOf") LocalDate asOf);

    /** Of those, the ones completed on or before the same date (the numerator). */
    @Query("select count(r) from HrTrainingRecord r, HrTraining t where r.orgId = :orgId and t.orgId = :orgId and t.id = r.trainingId and t.required = true and r.dueOn <= :asOf and r.completedOn is not null and r.completedOn <= :asOf")
    long countCompletedAsOf(@Param("orgId") Long orgId, @Param("asOf") LocalDate asOf);

    long countByOrgIdAndStatus(Long orgId, String status);
}
