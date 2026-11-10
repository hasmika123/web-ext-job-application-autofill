package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrOffboardingTask;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code hr_offboarding_task}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrOffboardingTaskRepository extends Repository<HrOffboardingTask, Long> {
    <S extends HrOffboardingTask> S save(S entity);

    <S extends HrOffboardingTask> S saveAndFlush(S entity);

    void flush();

    <S extends HrOffboardingTask> List<S> saveAll(Iterable<S> entities);

    <S extends HrOffboardingTask> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrOffboardingTask> findByOrgIdAndId(Long orgId, Long id);

    List<HrOffboardingTask> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrOffboardingTask> findByOrgIdAndEmployeeIdOrderByDueDateAsc(Long orgId, Long employeeId);

    long countByOrgIdAndDone(Long orgId, boolean done);

    /** Open at an instant: created by then and not done by then ("Offboarding Tasks" now and at T-30). */
    @Query("select count(t) from HrOffboardingTask t where t.orgId = :orgId and t.createdAt <= :at and (t.doneAt is null or t.doneAt > :at)")
    long countOpenAt(@Param("orgId") Long orgId, @Param("at") Instant at);
}
