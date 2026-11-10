package com.dossier.api.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import java.util.List;
import java.time.Instant;
import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.enumeration.BugStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for bug reports (Phase 9.A5). */
@Repository
public interface BugReportRepository extends JpaRepository<BugReport, Long> {
    Page<BugReport> findAllByStatus(BugStatus status, Pageable pageable);

    long countByStatus(BugStatus status);

    // ---- retention (T1.4): read by the retention sweep only; nothing else deletes these rows in bulk ----

    @Query("select count(b) from BugReport b where b.createdDate < :cutoff and b.status in (com.dossier.api.domain.enumeration.BugStatus.RESOLVED, com.dossier.api.domain.enumeration.BugStatus.WONTFIX)")
    long countPurgeable(@Param("cutoff") Instant cutoff);

    @Query("select b.id from BugReport b where b.createdDate < :cutoff and b.status in (com.dossier.api.domain.enumeration.BugStatus.RESOLVED, com.dossier.api.domain.enumeration.BugStatus.WONTFIX) order by b.id")
    List<Long> purgeableIds(@Param("cutoff") Instant cutoff, Pageable page);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from BugReport b where b.id in :ids")
    int deleteByIdIn(@Param("ids") List<Long> ids);

    /** Account erasure: removes everything keyed by this login. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from BugReport b where b.userLogin = :v")
    int deleteByUserLogin(@Param("v") String v);

    /** The reports/inquiries this login sent, oldest first (the account export). */
    List<BugReport> findByUserLoginOrderByIdAsc(String userLogin);
}
