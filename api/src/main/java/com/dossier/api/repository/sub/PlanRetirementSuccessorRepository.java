package com.dossier.api.repository.sub;

import com.dossier.api.domain.catalog.PlanRetirementSuccessor;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Platform access to {@code plan_retirement_successor}. */
public interface PlanRetirementSuccessorRepository extends JpaRepository<PlanRetirementSuccessor, Long> {
    List<PlanRetirementSuccessor> findByRetirementIdOrderByRankNoAsc(Long retirementId);

    @Modifying
    @Query("delete from PlanRetirementSuccessor s where s.retirementId = :retirementId")
    void deleteAllByRetirementId(@Param("retirementId") Long retirementId);
}
