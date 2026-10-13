package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.TalentPlacement;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code talent_placement}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface TalentPlacementRepository extends JpaRepository<TalentPlacement, Long> {
    Optional<TalentPlacement> findByOrgIdAndId(Long orgId, Long id);

    List<TalentPlacement> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndStartDateBetween(Long orgId, LocalDate from, LocalDate to);

    List<TalentPlacement> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    @Query("select count(p) from TalentPlacement p where p.orgId = :orgId and p.startDate <= :on and (p.endDate is null or p.endDate > :on)")
    long countActiveOn(@Param("orgId") Long orgId, @Param("on") LocalDate on);

}
