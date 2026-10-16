package com.dossier.api.repository;

import com.dossier.api.domain.Subscription;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for the Stripe subscription mirror (Phase 12). One row per user. */
@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, Long> {
    Optional<Subscription> findOneByUserLogin(String login);

    Optional<Subscription> findOneByUserId(Long userId);

    /** The webhook's lookup: events carry the Stripe customer, not our user id. */
    Optional<Subscription> findOneByStripeCustomerId(String stripeCustomerId);

    Optional<Subscription> findOneByStripeSubscriptionId(String stripeSubscriptionId);

    /** K5.6: rows that still carry a Stripe schedule id although no switch is scheduled any more (cancelled, undone): the job releases them. */
    List<Subscription> findByScheduleIdIsNotNullAndScheduledAtIsNull();

    /** For the admin revenue panel (12.5). */
    List<Subscription> findAllByPlan(String plan);
}
