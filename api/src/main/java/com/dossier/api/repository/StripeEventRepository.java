package com.dossier.api.repository;

import com.dossier.api.domain.StripeEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/**
 * Spring Data repository for received Stripe webhook events (Phase 12).
 * Keyed by the Stripe event id, which is what makes replays idempotent.
 */
@Repository
public interface StripeEventRepository extends JpaRepository<StripeEvent, String> {}
