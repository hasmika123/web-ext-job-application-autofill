package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.PlanVersion;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code plan_version} (no org_id). */
public interface PlanVersionRepository extends Repository<PlanVersion, Long> {
    <S extends PlanVersion> S save(S entity);

    <S extends PlanVersion> S saveAndFlush(S entity);

    long count();

    Optional<PlanVersion> findById(Long id);

    List<PlanVersion> findByPlanIdOrderByVersionDesc(Long planId);

    Optional<PlanVersion> findByPlanIdAndVersion(Long planId, Integer version);

    /** The one PUBLISHED version of a plan, if any (the generated live_key makes a second one impossible). */
    @Query("select v from PlanVersion v where v.planId = :planId and v.status = 'PUBLISHED'")
    Optional<PlanVersion> findLive(@Param("planId") Long planId);
}
