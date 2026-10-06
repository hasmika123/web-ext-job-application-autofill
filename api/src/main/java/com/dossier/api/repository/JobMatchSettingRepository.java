package com.dossier.api.repository;

import com.dossier.api.domain.JobMatchSetting;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Users' daily-job-match switches (Phase 13.6b). */
@Repository
public interface JobMatchSettingRepository extends JpaRepository<JobMatchSetting, Long> {
    List<JobMatchSetting> findAllByEnabledTrue();
}
