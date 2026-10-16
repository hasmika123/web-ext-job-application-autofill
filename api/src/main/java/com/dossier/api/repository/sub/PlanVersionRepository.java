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

    void delete(PlanVersion entity);

    /** The PUBLISHED versions whose plan base is {@code productId} (at most one per plan; the catalog port reads the AI budget from it). */
    @Query("select v from PlanVersion v where v.baseProductId = :productId and v.status = 'PUBLISHED' order by v.id desc")
    List<PlanVersion> findLiveByBaseProduct(@Param("productId") Long productId);

    List<PlanVersion> findByStatusOrderByIdAsc(String status);

    @Query("select v from PlanVersion v where v.snapshotHash is not null order by v.id")
    List<PlanVersion> findHashed();

    @Query("select count(v) from PlanVersion v where v.planId = :planId and v.status = 'DRAFT'")
    long countDrafts(@Param("planId") Long planId);
}
