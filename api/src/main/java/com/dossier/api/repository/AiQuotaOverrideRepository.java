package com.dossier.api.repository;

import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import com.dossier.api.domain.AiQuotaOverride;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

/** Spring Data repository for per-user AI quota overrides (Phase 9.A2.2). Keyed by login. */
@Repository
public interface AiQuotaOverrideRepository extends JpaRepository<AiQuotaOverride, String> {
    /** Account erasure: removes everything keyed by this login. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from AiQuotaOverride o where o.login = :v")
    int deleteByLoginValue(@Param("v") String v);
}
