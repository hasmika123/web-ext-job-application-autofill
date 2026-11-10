package com.dossier.api.repository.org;

import com.dossier.api.domain.org.Organization;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped repositories deliberately do NOT extend {@code JpaRepository}: there is no {@code findById} to
 * reach for, so every read names the organization (docs/design/org/tenant-model.md decision 4, enforced by
 * {@code OrgRepositoryContractTest}). The organization table is the tenant root, so its "scope" is its own id.
 */
public interface OrganizationRepository extends Repository<Organization, Long> {
    <S extends Organization> S save(S organization);

    <S extends Organization> S saveAndFlush(S organization);

    @Query("select o from Organization o where o.id = :orgId")
    Optional<Organization> findByOrgId(@Param("orgId") Long orgId);

    /** The organizations behind a set of memberships ({@code OrgMemberRepository#findMine}). */
    @Query("select o from Organization o where o.id in :orgIds order by o.name")
    List<Organization> findAllByOrgIdIn(@Param("orgIds") Collection<Long> orgIds);

    /** How many organizations this person created (any state): the per-person creation cap. Scoped by the person, like {@code findMine}. */
    long countByCreatedByUserId(Long userId);

    /** Every organization id: only for platform jobs that then work one organization at a time inside {@code TenantScoped} (the history retention job, X9.15). */
    @Query("select o.id from Organization o order by o.id")
    List<Long> findAllOrgIds();

    // Tenant-root lookups by the globally unique slug (the contract test allow-lists exactly these two).
    boolean existsBySlug(String slug);

    Optional<Organization> findBySlug(String slug);
}
