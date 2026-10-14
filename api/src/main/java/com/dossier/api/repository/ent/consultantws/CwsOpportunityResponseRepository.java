package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

/** Org-scoped access to {@code cws_opportunity_response}: every method takes the organization id first. */
public interface CwsOpportunityResponseRepository extends JpaRepository<CwsOpportunityResponse, Long> {
    List<CwsOpportunityResponse> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsOpportunityResponse> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
