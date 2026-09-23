package com.dossier.api.repository;

import com.dossier.api.domain.JobSource;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Job boards read for daily job matches (Phase 13.6a). */
@Repository
public interface JobSourceRepository extends JpaRepository<JobSource, Long> {
    Optional<JobSource> findOneByAtsAndBoardTokenIgnoreCase(String ats, String boardToken);

    List<JobSource> findAllByEnabledTrueOrderByIdAsc();

    List<JobSource> findAllByOrderByCompanyNameAsc();
}
