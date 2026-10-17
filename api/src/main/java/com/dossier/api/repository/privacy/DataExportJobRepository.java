package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.DataExportJob;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface DataExportJobRepository extends JpaRepository<DataExportJob, Long> {
    /** The account's own job by id: a job of another account is simply absent (the generic 404). */
    Optional<DataExportJob> findByIdAndUserId(Long id, Long userId);

    List<DataExportJob> findByUserIdOrderByIdDesc(Long userId, Pageable page);

    long countByUserIdAndRequestedAtAfter(Long userId, Instant since);

    boolean existsByUserIdAndStatusIn(Long userId, List<String> statuses);

    /** Locks up to {@code limit} jobs that can be worked on: QUEUED, or RUNNING with an expired lease. Must run inside the claiming transaction. */
    @Query(
        value = "select id from data_export_job where status = 'QUEUED' or (status = 'RUNNING' and lease_until < :now) order by requested_at limit :limit for update skip locked",
        nativeQuery = true
    )
    List<Long> lockClaimable(@Param("now") Instant now, @Param("limit") int limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update DataExportJob j set j.status = 'RUNNING', j.worker = :worker, j.leaseUntil = :leaseUntil, j.startedAt = :now, j.attempts = j.attempts + 1 where j.id in :ids")
    int lease(@Param("ids") List<Long> ids, @Param("worker") String worker, @Param("now") Instant now, @Param("leaseUntil") Instant leaseUntil);

    /** Jobs whose file is past its expiry and still held: the sweep removes the file and marks the row EXPIRED. */
    @Query("select j from DataExportJob j where j.status = 'READY' and j.expiresAt < :now order by j.id")
    List<DataExportJob> findExpiredReady(@Param("now") Instant now, Pageable page);

    long countByStatusAndExpiresAtBefore(String status, Instant now);
}
