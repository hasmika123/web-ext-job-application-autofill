package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.ent.ops.HrOnboardingItem;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code hr_onboarding_item}: every method takes the organization id first (OpsSchemaIT and EntRepositoryContractTest enforce it). */
public interface HrOnboardingItemRepository extends Repository<HrOnboardingItem, Long> {
    <S extends HrOnboardingItem> S save(S entity);

    <S extends HrOnboardingItem> S saveAndFlush(S entity);

    void flush();

    <S extends HrOnboardingItem> List<S> saveAll(Iterable<S> entities);

    <S extends HrOnboardingItem> List<S> saveAllAndFlush(Iterable<S> entities);

    Optional<HrOnboardingItem> findByOrgIdAndId(Long orgId, Long id);

    List<HrOnboardingItem> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    List<HrOnboardingItem> findByOrgIdAndEmployeeIdOrderBySortOrderAsc(Long orgId, Long employeeId);

    long countByOrgIdAndEmployeeIdAndDone(Long orgId, Long employeeId, boolean done);

    long countByOrgIdAndDone(Long orgId, boolean done);
}
