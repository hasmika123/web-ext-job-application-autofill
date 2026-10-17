package com.dossier.api.repository.privacy;

import com.dossier.api.domain.privacy.AccountDeletionReport;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface AccountDeletionReportRepository extends JpaRepository<AccountDeletionReport, Long> {
    List<AccountDeletionReport> findAllByOrderByIdDesc(Pageable page);

    long countByExecutedAtBefore(Instant cutoff);

    @Query("select r.id from AccountDeletionReport r where r.executedAt < :cutoff order by r.id")
    List<Long> purgeableIds(@Param("cutoff") Instant cutoff, Pageable page);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AccountDeletionReport r where r.id in :ids")
    int deleteByIdIn(@Param("ids") List<Long> ids);
}
