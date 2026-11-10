package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrTraining;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code hr_training}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrTrainingRepository extends Repository<HrTraining, Long> {
    <S extends HrTraining> S save(S entity);

    <S extends HrTraining> S saveAndFlush(S entity);

    void flush();

    <S extends HrTraining> List<S> saveAll(Iterable<S> entities);

    <S extends HrTraining> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrTraining> findByOrgIdAndId(Long orgId, Long id);

    List<HrTraining> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<HrTraining> findByOrgIdAndTrainingKey(Long orgId, String trainingKey);

    List<HrTraining> findByOrgIdOrderBySortOrderAsc(Long orgId);
}
