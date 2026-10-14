package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_opportunity_response}: every method takes the organization id first. */
public interface CwsOpportunityResponseRepository extends Repository<CwsOpportunityResponse, Long> {
    <S extends CwsOpportunityResponse> S save(S entity);

    <S extends CwsOpportunityResponse> S saveAndFlush(S entity);

    void flush();

    <S extends CwsOpportunityResponse> List<S> saveAll(Iterable<S> entities);

    void delete(CwsOpportunityResponse entity);

    List<CwsOpportunityResponse> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsOpportunityResponse> findByOrgIdAndConsultantIdAndRequirementId(Long orgId, Long consultantId, Long requirementId);
}
