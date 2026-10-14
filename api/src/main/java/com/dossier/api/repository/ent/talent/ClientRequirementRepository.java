package com.dossier.api.repository.ent.talent;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code client_requirement}: every method takes the organization id first (TalentSchemaIT enforces it). */
public interface ClientRequirementRepository extends Repository<ClientRequirement, Long> {
    <S extends ClientRequirement> S save(S entity);

    <S extends ClientRequirement> S saveAndFlush(S entity);

    Optional<ClientRequirement> findByOrgIdAndId(Long orgId, Long id);

    List<ClientRequirement> findByOrgId(Long orgId);

    long countByOrgId(Long orgId);

    /** The job with this normalized URL key hash ({@code UrlKeys}), if the organization already has it. */
    Optional<ClientRequirement> findByOrgIdAndUrlKeyHash(Long orgId, String urlKeyHash);

    /** The job with this ATS platform and external job id, if the organization already has it. */
    Optional<ClientRequirement> findByOrgIdAndAtsPlatformAndExternalJobId(Long orgId, String atsPlatform, String externalJobId);

    List<ClientRequirement> findByOrgIdAndStatusOrderByPostedAtDesc(Long orgId, String status);

    long countByOrgIdAndStatus(Long orgId, String status);

    long countByOrgIdAndPostedAtGreaterThanEqual(Long orgId, Instant since);

    @Query("select count(r) from ClientRequirement r where r.orgId = :orgId and r.postedAt <= :at and ((r.status = 'OPEN') or (r.status in ('FILLED','CLOSED') and r.closedAt > :at))")
    long countOpenAt(@Param("orgId") Long orgId, @Param("at") Instant at);

}
