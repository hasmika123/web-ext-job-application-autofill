package com.dossier.api.repository;

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
}
