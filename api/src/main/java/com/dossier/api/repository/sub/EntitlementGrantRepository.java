package com.dossier.api.repository.sub;

import com.dossier.api.domain.billing.EntitlementGrant;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Personal comp, referral and service grants (docs/subscriptions/08-data-model.md section 4.5, story K7.1). */
public interface EntitlementGrantRepository extends Repository<EntitlementGrant, Long> {
    <S extends EntitlementGrant> S save(S entity);

    long count();

    List<EntitlementGrant> findByUserIdOrderByStartsAtDesc(Long userId);

    /** The grants in force at {@code t}: started, not ended, not revoked. */
    @Query(
        "select g from EntitlementGrant g where g.userId = :userId and g.startsAt <= :t and (g.endsAt is null or g.endsAt > :t) and g.revokedAt is null"
    )
    List<EntitlementGrant> findActive(@Param("userId") Long userId, @Param("t") Instant t);
}
