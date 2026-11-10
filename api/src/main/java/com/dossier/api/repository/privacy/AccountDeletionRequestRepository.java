package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.AccountDeletionRequest;
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
public interface AccountDeletionRequestRepository extends JpaRepository<AccountDeletionRequest, Long> {
    Optional<AccountDeletionRequest> findByUserId(Long userId);

    List<AccountDeletionRequest> findByStatusOrderByPurgeAfter(String status, Pageable page);

    /**
     * Locks up to {@code limit} requests that are due: PENDING past their undo window, or RUNNING with an expired lease (a worker that died),
     * skipping rows another instance has locked. Must run inside the claiming transaction.
     */
    @Query(
        value = "select id from account_deletion_request where (status = 'PENDING' and purge_after <= :now) or (status = 'RUNNING' and lease_until < :now) " +
        "order by purge_after limit :limit for update skip locked",
        nativeQuery = true
    )
    List<Long> lockDue(@Param("now") Instant now, @Param("limit") int limit);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AccountDeletionRequest r set r.status = 'RUNNING', r.leaseUntil = :leaseUntil, r.attempts = r.attempts + 1 where r.id in :ids")
    int lease(@Param("ids") List<Long> ids, @Param("leaseUntil") Instant leaseUntil);

    /** A failed run goes back to PENDING (retried by the next sweep) with a short reason. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update AccountDeletionRequest r set r.status = 'PENDING', r.leaseUntil = null, r.lastError = :error where r.id = :id")
    int fail(@Param("id") Long id, @Param("error") String error);
}
