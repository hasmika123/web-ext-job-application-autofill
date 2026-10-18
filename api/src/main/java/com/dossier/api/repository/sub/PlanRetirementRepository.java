package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.PlanRetirement;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code plan_retirement} (no org_id: a retirement is a platform object). */
public interface PlanRetirementRepository extends JpaRepository<PlanRetirement, Long> {
    Page<PlanRetirement> findByStatusOrderByIdDesc(String status, Pageable page);

    Page<PlanRetirement> findAllByOrderByIdDesc(Pageable page);

    List<PlanRetirement> findByStatusInOrderByIdAsc(Collection<String> statuses);

    /** The retirements of a plan that are still open (DRAFT, NOTICING or COMPLETING). */
    @Query("select r from PlanRetirement r where r.planId = :planId and r.status in ('DRAFT','NOTICING','COMPLETING') order by r.id desc")
    List<PlanRetirement> findOpenByPlanId(@Param("planId") Long planId);

    /** The live (NOTICING or COMPLETING) retirements of a plan, newest first. */
    @Query("select r from PlanRetirement r where r.planId = :planId and r.status in ('NOTICING','COMPLETING') order by r.id desc")
    List<PlanRetirement> findLiveByPlanId(@Param("planId") Long planId);

    @Query("select r from PlanRetirement r where r.featureKey = :featureKey and r.kind = 'ADDON' and r.status in ('NOTICING','COMPLETING') order by r.id desc")
    List<PlanRetirement> findLiveByFeatureKey(@Param("featureKey") String featureKey);
}
