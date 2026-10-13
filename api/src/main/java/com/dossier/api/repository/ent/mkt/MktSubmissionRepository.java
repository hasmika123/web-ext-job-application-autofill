package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped access to {@code mkt_submission}: EVERY method takes the organization id first. The {@code @Query} lookups read the talent
 * entities (consultant, job, client, resume) by id inside the same organization, so this page never touches the talent repositories.
 */
public interface MktSubmissionRepository extends JpaRepository<MktSubmission, Long> {
    Optional<MktSubmission> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    boolean existsByOrgIdAndCode(Long orgId, String code);

    /** Live rows (a withdrawn draft has {@code archived_at}). */
    List<MktSubmission> findByOrgIdAndArchivedAtIsNull(Long orgId);

    List<MktSubmission> findByOrgIdAndConsultantIdInAndArchivedAtIsNull(Long orgId, Collection<Long> consultantIds);

    boolean existsByOrgIdAndConsultantIdAndRequirementIdAndArchivedAtIsNull(Long orgId, Long consultantId, Long requirementId);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<ConsultantProfile> findConsultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' order by c.displayName")
    List<ConsultantProfile> findActiveConsultants(@Param("orgId") Long orgId);

    @Query("select r from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN' order by r.title")
    List<ClientRequirement> findOpenRequirements(@Param("orgId") Long orgId);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id = :id")
    Optional<ConsultantProfile> findConsultant(@Param("orgId") Long orgId, @Param("id") Long id);

    @Query("select r from ClientRequirement r where r.orgId = :orgId and r.id in :ids")
    List<ClientRequirement> findRequirements(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select r from ClientRequirement r where r.orgId = :orgId and r.id = :id")
    Optional<ClientRequirement> findRequirement(@Param("orgId") Long orgId, @Param("id") Long id);

    @Query("select a from ClientAccount a where a.orgId = :orgId and a.id in :ids")
    List<ClientAccount> findClients(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select r from OrgResume r where r.orgId = :orgId and r.id = :id")
    Optional<OrgResume> findResume(@Param("orgId") Long orgId, @Param("id") Long id);

    @Query("select r from OrgResume r where r.orgId = :orgId and r.consultantId = :consultantId and r.primaryForOrg = true")
    Optional<OrgResume> findPrimaryResume(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
