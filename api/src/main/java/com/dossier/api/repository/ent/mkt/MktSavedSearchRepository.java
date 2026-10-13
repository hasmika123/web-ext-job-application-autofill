package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSavedSearch;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/**
 * Org-scoped access to {@code mkt_saved_search}: a search belongs to its owner member, so reads and deletes name the owner too.
 * A bare {@link Repository}; every method takes the organization id first (EntRepositoryContractTest).
 */
public interface MktSavedSearchRepository extends Repository<MktSavedSearch, Long> {
    MktSavedSearch save(MktSavedSearch search);

    long countByOrgId(Long orgId);

    Optional<MktSavedSearch> findByOrgIdAndOwnerMemberIdAndId(Long orgId, Long ownerMemberId, Long id);

    List<MktSavedSearch> findByOrgIdAndOwnerMemberIdOrderByCreatedAtDesc(Long orgId, Long ownerMemberId);

    long countByOrgIdAndOwnerMemberId(Long orgId, Long ownerMemberId);

    long countByOrgIdAndOwnerMemberIdAndCreatedAtLessThan(Long orgId, Long ownerMemberId, Instant before);

    long deleteByOrgIdAndOwnerMemberIdAndId(Long orgId, Long ownerMemberId, Long id);
}
