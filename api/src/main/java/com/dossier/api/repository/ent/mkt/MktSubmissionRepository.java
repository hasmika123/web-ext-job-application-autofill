package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktSubmission;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Org-scoped access to {@code mkt_submission}: EVERY method takes the organization id first. The {@code @Query} lookups read the talent
 * entities (consultant, job, client, resume) by id inside the same organization, so this page never touches the talent repositories.
 */
public interface MktSubmissionRepository extends Repository<MktSubmission, Long> {
    Optional<MktSubmission> findByOrgIdAndId(Long orgId, Long id);

    long countByOrgId(Long orgId);

    boolean existsByOrgIdAndCode(Long orgId, String code);

    /** Live rows (a withdrawn draft has {@code archived_at}). */
    List<MktSubmission> findByOrgIdAndArchivedAtIsNull(Long orgId);

    /** The canonical records visible to one consultant; withdrawn packages stay out of the consultant workspace. */
    List<MktSubmission> findByOrgIdAndConsultantIdAndArchivedAtIsNullOrderByCreatedAtDescIdDesc(Long orgId, Long consultantId);

    Optional<MktSubmission> findByOrgIdAndConsultantIdAndIdAndArchivedAtIsNull(Long orgId, Long consultantId, Long id);

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

    <S extends MktSubmission> S save(S entity);

    /** The consultant's approval is atomic so a double click cannot decide the same package twice. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        "update MktSubmission s set s.approvalState = :approval, s.status = :status, s.updatedAt = :at, s.updatedByMemberId = :actor " +
        "where s.orgId = :orgId and s.consultantId = :consultantId and s.id = :id and s.archivedAt is null and s.approvalState = 'AWAITING_APPROVAL'"
    )
    int transitionApproval(
        @Param("orgId") Long orgId,
        @Param("consultantId") Long consultantId,
        @Param("id") Long id,
        @Param("approval") String approval,
        @Param("status") String status,
        @Param("at") Instant at,
        @Param("actor") Long actorMemberId
    );
}
