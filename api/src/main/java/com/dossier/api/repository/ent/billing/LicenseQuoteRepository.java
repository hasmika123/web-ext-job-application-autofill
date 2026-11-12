package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.LicenseQuote;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code license_quote}: every method takes the organization id first. */
public interface LicenseQuoteRepository extends Repository<LicenseQuote, Long> {
    <S extends LicenseQuote> S save(S entity);
    <S extends LicenseQuote> S saveAndFlush(S entity);
    Optional<LicenseQuote> findByOrgIdAndId(Long orgId, Long id);
    List<LicenseQuote> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);
}
