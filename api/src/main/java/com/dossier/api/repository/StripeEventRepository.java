package com.dossier.api.repository;

import com.dossier.api.domain.StripeEvent;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/**
 * Spring Data repository for received Stripe webhook events (Phase 12).
 * Keyed by the Stripe event id, which is what makes replays idempotent.
 */
@Repository
public interface StripeEventRepository extends JpaRepository<StripeEvent, String> {
    /**
     * One person's billing history (9.C1), newest first: events tied to the user, or to their
     * Stripe customer when the user wasn't known yet. Null customer = user only (a derived query
     * would turn a null into IS NULL and pull in every unattributed event).
     */
    @Query(
        "select e from StripeEvent e where e.userId = :userId or (:customerId is not null and e.customerId = :customerId) " +
        "order by coalesce(e.occurredAt, e.receivedAt) desc"
    )
    List<StripeEvent> findTimeline(@Param("userId") Long userId, @Param("customerId") String customerId, Pageable pageable);

    /** Total paid per Stripe customer (9.C1): the sum of {@code invoice.paid} amounts. */
    @Query(
        "select e.customerId, sum(e.amountCents), max(e.currency) from StripeEvent e " +
        "where e.type = 'invoice.paid' and e.customerId in :customerIds and e.amountCents is not null group by e.customerId"
    )
    List<Object[]> sumPaidByCustomer(@Param("customerIds") Collection<String> customerIds);

    /** Account deletion: the events stay as Stripe's record, but no longer point at the person. */
    @Modifying
    @Query("update StripeEvent e set e.userId = null, e.customerId = null where e.userId = :userId or (:customerId is not null and e.customerId = :customerId)")
    int forget(@Param("userId") Long userId, @Param("customerId") String customerId);
}
