package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktJobMeta;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * Org-scoped access to {@code mkt_job_meta}. A bare {@link Repository} like the rest of {@code repository.ent}: no {@code findById},
 * and every method takes the organization id first (EntRepositoryContractTest).
 */
public interface MktJobMetaRepository extends Repository<MktJobMeta, Long> {
    MktJobMeta save(MktJobMeta meta);

    List<MktJobMeta> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    Optional<MktJobMeta> findByOrgIdAndRequirementId(Long orgId, Long requirementId);

    List<MktJobMeta> findByOrgIdAndRequirementIdIn(Long orgId, Collection<Long> requirementIds);
}
