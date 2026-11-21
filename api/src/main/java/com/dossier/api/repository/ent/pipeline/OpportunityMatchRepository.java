package com.dossier.api.repository.ent.pipeline;

import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code opportunity_match}; every read names the organization first. */
public interface OpportunityMatchRepository extends Repository<OpportunityMatch, Long> {
    <S extends OpportunityMatch> S save(S entity);

    <S extends OpportunityMatch> S saveAndFlush(S entity);

    void flush();

    @Query("select m from OpportunityMatch m where m.orgId = :orgId and m.id = :id")
    Optional<OpportunityMatch> findByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    List<OpportunityMatch> findByOrgIdOrderByUpdatedAtDesc(Long orgId);

    @Query("select count(m) from OpportunityMatch m where m.orgId = :orgId")
    long countByOrgId(@Param("orgId") Long orgId);

    Optional<OpportunityMatch> findByOrgIdAndOpportunityIdAndConsultantMemberId(Long orgId, Long opportunityId, Long consultantMemberId);

    List<OpportunityMatch> findByOrgIdAndOpportunityIdOrderByScoreDesc(Long orgId, Long opportunityId);

    List<OpportunityMatch> findByOrgIdAndConsultantMemberIdAndStatusOrderByScoreDesc(Long orgId, Long consultantMemberId, String status);

    List<OpportunityMatch> findByOrgIdAndStatusOrderByScoreDesc(Long orgId, String status);
}
