package com.dossier.api.repository.sub;

import com.dossier.api.domain.Subscription;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Which subscription rows the personal reconciler looks at tonight (story K8.5). Read-only. */
public interface ReconcileSubscriptionRepository extends Repository<Subscription, Long> {
    /**
     * Rows Stripe should be billing (active, past_due, trialing, with a subscription id) whose last webhook is older than {@code cutoff} (or never came),
     * plus a daily sample: the rows whose id modulo 7 is {@code bucket}. Ordered by id so paging is stable.
     */
    @Query(
        "select s from Subscription s where s.stripeSubscriptionId is not null and lower(s.status) in ('active','past_due','trialing') and " +
        "(s.lastEventAt is null or s.lastEventAt < :cutoff or mod(s.id, 7) = :bucket) order by s.id"
    )
    List<Subscription> findDue(@Param("cutoff") Instant cutoff, @Param("bucket") int bucket, Pageable page);
}
