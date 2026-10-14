package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code pipeline_application_link}: every method takes the organization id first. */
public interface MktPipelineApplicationLinkRepository extends Repository<MktPipelineApplicationLink, Long> {

    <S extends MktPipelineApplicationLink> S save(S entity);

    <S extends MktPipelineApplicationLink> S saveAndFlush(S entity);

    Optional<MktPipelineApplicationLink> findByOrgIdAndId(Long orgId, Long id);

    /** The live (not unlinked) link of an opportunity: at most one, the database guarantees it. */
    Optional<MktPipelineApplicationLink> findByOrgIdAndOpportunityIdAndUnlinkedAtIsNull(Long orgId, Long opportunityId);

    /** The live links that point at one personal application (it can be linked to several opportunities). */
    List<MktPipelineApplicationLink> findByOrgIdAndPersonalApplicationIdAndUnlinkedAtIsNull(Long orgId, Long personalApplicationId);

    List<MktPipelineApplicationLink> findByOrgIdAndConsultantIdOrderByLinkedAtDesc(Long orgId, Long consultantId);

    List<MktPipelineApplicationLink> findByOrgIdAndOpportunityIdOrderByLinkedAtDesc(Long orgId, Long opportunityId);

    long countByOrgId(Long orgId);
}
