package com.dossier.api.repository.sub;

import com.dossier.api.domain.sub.SubscriptionQuote;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Access to {@code subscription_quote}. */
public interface SubscriptionQuoteRepository extends Repository<SubscriptionQuote, Long> {
    <S extends SubscriptionQuote> S save(S entity);

    <S extends SubscriptionQuote> S saveAndFlush(S entity);

    long count();

    Optional<SubscriptionQuote> findById(Long id);

    /** The quote row locked for update: two confirms of one quote cannot both apply it. */
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from SubscriptionQuote q where q.id = :id")
    Optional<SubscriptionQuote> lockById(@Param("id") Long id);

    /** An OPEN quote past its time becomes EXPIRED (housekeeping; reads also expire lazily). */
    @Modifying
    @Query("update SubscriptionQuote q set q.status = 'EXPIRED' where q.status = 'OPEN' and q.expiresAt < :now")
    int expireOpenBefore(@Param("now") Instant now);
}
