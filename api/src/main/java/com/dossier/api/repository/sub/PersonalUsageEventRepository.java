package com.dossier.api.repository.sub;

import com.dossier.api.domain.usage.PersonalUsageEvent;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The personal usage ledger's events (story K7.5): organization usage lives in other tables and never appears here. */
public interface PersonalUsageEventRepository extends Repository<PersonalUsageEvent, Long> {
    <S extends PersonalUsageEvent> S save(S entity);

    long count();

    Optional<PersonalUsageEvent> findById(Long id);

    Optional<PersonalUsageEvent> findByIdempotencyKey(String idempotencyKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select e from PersonalUsageEvent e where e.id = :id")
    Optional<PersonalUsageEvent> findByIdForUpdate(@Param("id") Long id);

    @Query("select e from PersonalUsageEvent e where e.status = 'RESERVED' and e.expiresAt is not null and e.expiresAt < :now order by e.expiresAt")
    List<PersonalUsageEvent> findExpired(@Param("now") Instant now, Pageable page);
}
