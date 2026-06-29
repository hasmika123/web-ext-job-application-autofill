package com.dossier.api.repository;

import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for newsletter subscribers (Phase 9.A4). */
@Repository
public interface EmailSubscriberRepository extends JpaRepository<EmailSubscriber, Long> {
    Optional<EmailSubscriber> findByEmailIgnoreCase(String email);

    Optional<EmailSubscriber> findByConfirmToken(String confirmToken);

    Optional<EmailSubscriber> findByUnsubscribeToken(String unsubscribeToken);

    // Admin list (A4 admin) — by status, paginated.
    Page<EmailSubscriber> findAllByStatus(SubscriberStatus status, Pageable pageable);

    long countByStatus(SubscriberStatus status);
}
