package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.BillingDrift;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code billing_drift}. */
public interface BillingDriftRepository extends Repository<BillingDrift, Long> {
    <S extends BillingDrift> S save(S entity);

    long count();

    Optional<BillingDrift> findById(Long id);

    @Query("select d from BillingDrift d where d.kind = :kind and d.resolvedAt is null order by d.id")
    List<BillingDrift> findOpen(@Param("kind") String kind);

    @Query("select d from BillingDrift d where d.kind = :kind and d.code = :code and d.subject = :subject and d.resolvedAt is null")
    Optional<BillingDrift> findOpenOne(@Param("kind") String kind, @Param("code") String code, @Param("subject") String subject);
}
