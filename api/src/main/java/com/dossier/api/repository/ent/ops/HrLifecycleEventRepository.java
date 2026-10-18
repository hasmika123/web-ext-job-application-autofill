package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrLifecycleEvent;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code hr_lifecycle_event}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrLifecycleEventRepository extends Repository<HrLifecycleEvent, Long> {
    <S extends HrLifecycleEvent> S save(S entity);

    <S extends HrLifecycleEvent> S saveAndFlush(S entity);

    void flush();

    <S extends HrLifecycleEvent> List<S> saveAll(Iterable<S> entities);

    <S extends HrLifecycleEvent> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrLifecycleEvent> findByOrgIdAndId(Long orgId, Long id);

    List<HrLifecycleEvent> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrLifecycleEvent> findByOrgIdAndEmployeeIdOrderByOccurredAtDesc(Long orgId, Long employeeId);

    List<HrLifecycleEvent> findTop20ByOrgIdOrderByOccurredAtDesc(Long orgId);

    long countByOrgIdAndEventTypeAndOccurredAtBetween(Long orgId, String eventType, Instant from, Instant to);
}
