package com.dossier.api.repository.sub;

import com.dossier.api.domain.sub.PersonalSubscriptionChange;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Access to {@code personal_subscription_change}. */
public interface PersonalSubscriptionChangeRepository extends Repository<PersonalSubscriptionChange, Long> {
    <S extends PersonalSubscriptionChange> S save(S entity);

    <S extends PersonalSubscriptionChange> S saveAndFlush(S entity);

    long count();

    Optional<PersonalSubscriptionChange> findById(Long id);

    List<PersonalSubscriptionChange> findByBatchIdOrderByIdAsc(String batchId);

    List<PersonalSubscriptionChange> findBySubscriptionIdAndStatusInOrderByIdAsc(Long subscriptionId, Collection<String> statuses);

    List<PersonalSubscriptionChange> findByUserIdOrderByIdDesc(Long userId);

    /** FAILED changes still within the retry budget, oldest first. */
    @Query("select c from PersonalSubscriptionChange c where c.status = 'FAILED' and c.attempts < :maxAttempts order by c.id")
    List<PersonalSubscriptionChange> findRetryable(@Param("maxAttempts") int maxAttempts);

    /** Scheduled (PENDING) changes whose effective date has arrived: the settle step finishes them. */
    @Query(
        "select c from PersonalSubscriptionChange c where c.status = 'PENDING' and c.effectiveAt <= :now and c.kind in ('REMOVE_ADDON','CHANGE_QUANTITY') and c.stripeRef is not null order by c.id"
    )
    List<PersonalSubscriptionChange> findScheduledDue(@Param("now") Instant now);
}
