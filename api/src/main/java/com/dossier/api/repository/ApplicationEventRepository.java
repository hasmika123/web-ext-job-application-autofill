package com.dossier.api.repository;

import com.dossier.api.domain.ApplicationEvent;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * The tracker's append-only history (APP-E2E U6.1). Every query that is not "for one application the
 * caller already proved is theirs" goes through the user's applications.
 */
@Repository
public interface ApplicationEventRepository extends JpaRepository<ApplicationEvent, Long> {
    /** Newest first; the caller passes the page size (the detail view's event cap). */
    List<ApplicationEvent> findByApplicationIdOrderByCreatedAtDescIdDesc(Long applicationId, Pageable page);

    /** The newest event of each of these applications (id breaks a tie in time): who last touched them when no person is stamped on the head record. */
    @Query(
        "select e from ApplicationEvent e where e.id in " +
        "(select max(e2.id) from ApplicationEvent e2 where e2.applicationId in :ids group by e2.applicationId)"
    )
    List<ApplicationEvent> newestFor(@Param("ids") Collection<Long> ids);

    long countByApplicationId(Long applicationId);

    long countByApplicationIdAndKind(Long applicationId, String kind);

    /** When things happened to any of the user's applications since {@code since}: the dashboard's activity bars. */
    @Query(
        "select e.createdAt from ApplicationEvent e where e.createdAt >= :since and e.applicationId in " +
        "(select a.id from Application a where a.user.id = :userId)"
    )
    List<Instant> createdAtSince(@Param("userId") Long userId, @Param("since") Instant since);

    /** Every event of the user's applications (account export), oldest first within an application. */
    @Query(
        "select e from ApplicationEvent e where e.applicationId in (select a.id from Application a where a.user.id = :userId) " +
        "order by e.applicationId, e.createdAt, e.id"
    )
    List<ApplicationEvent> findAllByUser(@Param("userId") Long userId);

    /** The first time each of these applications became {@code toStatus}: rows of {@code [applicationId, firstAt]}. */
    @Query(
        "select e.applicationId, min(e.createdAt) from ApplicationEvent e where e.toStatus = :toStatus and e.applicationId in :ids " +
        "group by e.applicationId"
    )
    List<Object[]> firstBecame(@Param("toStatus") com.dossier.api.domain.enumeration.ApplicationStatus toStatus, @Param("ids") Collection<Long> ids);

    @Transactional
    @Modifying
    @Query("delete from ApplicationEvent e where e.applicationId in (select a.id from Application a where a.user.id = :userId)")
    int deleteByUser(@Param("userId") Long userId);
}
