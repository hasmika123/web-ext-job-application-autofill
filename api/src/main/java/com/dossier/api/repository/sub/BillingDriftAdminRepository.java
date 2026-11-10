package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.BillingDrift;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The admin's view of {@code billing_drift} (story K8.5): search, counts for the attention badge, resolve. Kept apart from {@link BillingDriftRepository}, which the reconcilers write through. */
public interface BillingDriftAdminRepository extends Repository<BillingDrift, Long> {
    <S extends BillingDrift> S save(S entity);

    Optional<BillingDrift> findById(Long id);

    /** {@code state} is {@code open}, {@code resolved} or {@code all}; {@code kind} may be null. Newest first. */
    @Query(
        "select d from BillingDrift d where (:kind is null or d.kind = :kind) and " +
        "(:state = 'all' or (:state = 'open' and d.resolvedAt is null) or (:state = 'resolved' and d.resolvedAt is not null)) order by d.id desc"
    )
    List<BillingDrift> search(@Param("kind") String kind, @Param("state") String state, Pageable page);

    @Query(
        "select count(d) from BillingDrift d where (:kind is null or d.kind = :kind) and " +
        "(:state = 'all' or (:state = 'open' and d.resolvedAt is null) or (:state = 'resolved' and d.resolvedAt is not null))"
    )
    long countSearch(@Param("kind") String kind, @Param("state") String state);

    /** Open rows per kind: the attention counts. */
    @Query("select d.kind, count(d) from BillingDrift d where d.resolvedAt is null group by d.kind")
    List<Object[]> openByKind();
}
