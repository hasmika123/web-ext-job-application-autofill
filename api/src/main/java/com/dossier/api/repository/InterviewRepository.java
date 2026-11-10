package com.dossier.api.repository;

import com.dossier.api.domain.Interview;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** The user's interviews (APP-E2E U6.1/U6.4). Every lookup by id also takes the user id: someone else's row is "not found". */
@Repository
public interface InterviewRepository extends JpaRepository<Interview, Long> {
    List<Interview> findByApplicationIdAndUserIdOrderByStartsAtAscIdAsc(Long applicationId, Long userId);

    Optional<Interview> findOneByIdAndUserId(Long id, Long userId);

    Optional<Interview> findOneByIdAndApplicationIdAndUserId(Long id, Long applicationId, Long userId);

    long countByApplicationId(Long applicationId);

    /** Interviews starting in {@code [from, to)}, soonest first, optionally of one outcome. */
    @Query(
        "select i from Interview i where i.userId = :userId and i.startsAt >= :from and i.startsAt < :to " +
        "and (:outcome is null or i.outcome = :outcome) order by i.startsAt asc, i.id asc"
    )
    List<Interview> findInRange(
        @Param("userId") Long userId,
        @Param("from") Instant from,
        @Param("to") Instant to,
        @Param("outcome") String outcome,
        Pageable page
    );

    /** Rows of {@code [applicationId, count]}. */
    @Query("select i.applicationId, count(i) from Interview i where i.applicationId in :ids group by i.applicationId")
    List<Object[]> countByApplicationIds(@Param("ids") Collection<Long> ids);

    /** Rows of {@code [applicationId, startsAt, kind]} for interviews at or after {@code now}, soonest first. */
    @Query(
        "select i.applicationId, i.startsAt, i.kind from Interview i where i.applicationId in :ids and i.startsAt >= :now " +
        "and (i.outcome is null or i.outcome <> 'CANCELLED') " +
        "order by i.startsAt asc, i.id asc"
    )
    List<Object[]> upcomingFor(@Param("ids") Collection<Long> ids, @Param("now") Instant now);

    List<Interview> findByUserIdOrderByStartsAtAscIdAsc(Long userId);

    /** The interviews an inbox mail may be about: the application's, newest first (the caller matches by calendar UID, start or "the only open one"). */
    List<Interview> findByApplicationIdAndUserIdOrderByStartsAtDescIdDesc(Long applicationId, Long userId);

    @Transactional
    @Modifying
    @Query("delete from Interview i where i.userId = :userId")
    int deleteByUser(@Param("userId") Long userId);
}
