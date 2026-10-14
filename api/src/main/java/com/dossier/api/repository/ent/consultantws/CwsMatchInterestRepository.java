package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsMatchInterest;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_match_interest}: every method takes the organization id first. */
public interface CwsMatchInterestRepository extends JpaRepository<CwsMatchInterest, Long> {
    List<CwsMatchInterest> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsMatchInterest> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
