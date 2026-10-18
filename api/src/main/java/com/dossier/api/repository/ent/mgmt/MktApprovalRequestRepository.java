package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_approval_request}: every method takes the organization id first. */
public interface MktApprovalRequestRepository extends Repository<MktApprovalRequest, Long> {

    <S extends MktApprovalRequest> S save(S entity);

    <S extends MktApprovalRequest> S saveAndFlush(S entity);

    Optional<MktApprovalRequest> findByOrgIdAndId(Long orgId, Long id);

    /** {@code SELECT ... FOR UPDATE}: a decision serialises on the row, so two managers cannot decide the same request. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from MktApprovalRequest r where r.orgId = :orgId and r.id = :id")
    Optional<MktApprovalRequest> lockByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    /** The one open request of a subject and kind (the generated active_key allows at most one). */
    Optional<MktApprovalRequest> findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(Long orgId, String subjectType, Long subjectId, String kind, String status);

    long countByOrgIdAndStatus(Long orgId, String status);

    /** PENDING requests whose expiry has passed (the expiry job closes them). */
    @Query("select r from MktApprovalRequest r where r.orgId = :orgId and r.status = 'PENDING' and r.expiresAt <= :now order by r.id")
    List<MktApprovalRequest> findExpired(@Param("orgId") Long orgId, @Param("now") Instant now);

    /** Retention: decided or closed requests untouched since {@code cutoff} that no opportunity still points at. */
    @Query(
        "select r.id from MktApprovalRequest r where r.orgId = :orgId and r.status <> 'PENDING' and r.updatedAt < :cutoff "
            + "and not exists (select 1 from MktOpportunity o where o.orgId = r.orgId and o.approvalRequestId = r.id) order by r.id"
    )
    List<Long> purgeableIds(@Param("orgId") Long orgId, @Param("cutoff") Instant cutoff, Pageable page);

    @Modifying
    @Query("delete from MktApprovalRequest r where r.orgId = :orgId and r.id in :ids")
    int deleteByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
