package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktGoal;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_goal}: every method takes the organization id first. */
public interface MktGoalRepository extends Repository<MktGoal, Long> {

    long countByOrgId(Long orgId);

    /** The organization's default targets (owner null). */
    @Query("select g from MktGoal g where g.orgId = :orgId and g.ownerMemberId is null")
    List<MktGoal> findDefaults(@Param("orgId") Long orgId);

    /** One marketer's own targets. */
    List<MktGoal> findByOrgIdAndOwnerMemberId(Long orgId, Long ownerMemberId);

    <S extends MktGoal> S save(S entity);
}
