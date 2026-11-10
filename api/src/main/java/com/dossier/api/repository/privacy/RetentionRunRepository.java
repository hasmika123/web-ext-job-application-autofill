package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.RetentionRun;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RetentionRunRepository extends JpaRepository<RetentionRun, Long> {
    /** Newest first; the admin page asks for a page of these. */
    List<RetentionRun> findAllByOrderByIdDesc(Pageable page);

    List<RetentionRun> findByJobOrderByIdDesc(String job, Pageable page);
}
