package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.JobLease;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** The lease rows behind {@code JobLeaseService}. Every write is one atomic statement, so two instances racing for a job cannot both win. */
@Repository
public interface JobLeaseRepository extends JpaRepository<JobLease, String> {
    /** Makes sure the row exists (a no-op when it does). */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = "insert ignore into job_lease (name) values (:name)", nativeQuery = true)
    int ensure(@Param("name") String name);

    /** Takes the lease when it is free or expired; returns 1 for the winner and 0 for everyone else. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value = "update job_lease set locked_until = :until, locked_by = :by where name = :name and (locked_until is null or locked_until < :now)",
        nativeQuery = true
    )
    int acquire(@Param("name") String name, @Param("by") String by, @Param("now") Instant now, @Param("until") Instant until);

    /** Lets go of the lease (only the holder can) and records what the run did. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        value = "update job_lease set locked_until = null, locked_by = null, last_run_at = :now, last_summary = :summary where name = :name and locked_by = :by",
        nativeQuery = true
    )
    int release(@Param("name") String name, @Param("by") String by, @Param("now") Instant now, @Param("summary") String summary);
}
