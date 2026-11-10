package com.dossier.api.repository.ent.billing;

import com.dossier.api.domain.ent.billing.OrgPaymentMethod;
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

/** Org-scoped access to {@code org_payment_method}: every method takes the organization id first (BillingSchemaIT and EntRepositoryContractTest enforce it). */
public interface OrgPaymentMethodRepository extends Repository<OrgPaymentMethod, Long> {
    <S extends OrgPaymentMethod> S save(S entity);
    <S extends OrgPaymentMethod> S saveAndFlush(S entity);
    void flush();
    <S extends OrgPaymentMethod> List<S> saveAll(Iterable<S> entities);
    <S extends OrgPaymentMethod> List<S> saveAllAndFlush(Iterable<S> entities);
    Optional<OrgPaymentMethod> findByOrgIdAndId(Long orgId, Long id);
    List<OrgPaymentMethod> findByOrgId(Long orgId);
    long countByOrgId(Long orgId);

    List<OrgPaymentMethod> findByOrgIdAndStatusOrderByDefaultMethodDescIdAsc(Long orgId, String status);
    Optional<OrgPaymentMethod> findFirstByOrgIdAndDefaultMethodTrueAndStatus(Long orgId, String status);
}
