package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.LicenseChange;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code license_change}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface LicenseChangeRepository extends Repository<LicenseChange, Long> {
    <S extends LicenseChange> S save(S entity);
    <S extends LicenseChange> S saveAndFlush(S entity);
    void flush();
    <S extends LicenseChange> List<S> saveAll(Iterable<S> entities);
    <S extends LicenseChange> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<LicenseChange> findByOrgIdAndId(Long orgId, Long id);
    List<LicenseChange> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<LicenseChange> findByOrgIdAndLicenseIdOrderByCreatedAtDesc(Long orgId, Long licenseId);
    Page<LicenseChange> findByOrgIdAndStatusOrderByEffectiveAtAsc(Long orgId, String status, Pageable pageable);
    long countByOrgIdAndStatus(Long orgId, String status);
    List<LicenseChange> findByOrgIdAndStatus(Long orgId, String status);
}
