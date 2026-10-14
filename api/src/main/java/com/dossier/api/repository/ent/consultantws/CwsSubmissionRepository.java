package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_submission}: every method takes the organization id first, then the consultant id. */
public interface CwsSubmissionRepository extends Repository<CwsSubmission, Long> {
    <S extends CwsSubmission> S save(S entity);

    <S extends CwsSubmission> S saveAndFlush(S entity);

    void flush();

    <S extends CwsSubmission> List<S> saveAll(Iterable<S> entities);

    void delete(CwsSubmission entity);

    List<CwsSubmission> findByOrgIdAndConsultantId(Long orgId, Long consultantId);

    Optional<CwsSubmission> findByOrgIdAndConsultantIdAndId(Long orgId, Long consultantId, Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    List<CwsSubmission> findByOrgIdAndConsultantIdAndStatusOrderByDueAtAscIdAsc(Long orgId, Long consultantId, String status);

    /** The past submissions (everything that is not waiting for approval), newest first. */
    @Query(
        "select s from CwsSubmission s where s.orgId = :orgId and s.consultantId = :consultantId and s.status <> 'PENDING_APPROVAL' " +
        "order by coalesce(s.submittedOn, s.decidedAt, s.createdAt) desc, s.id desc"
    )
    Page<CwsSubmission> findPast(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, Pageable pageable);

    @Query(
        "select s from CwsSubmission s where s.orgId = :orgId and s.consultantId = :consultantId and s.status = :status " +
        "order by coalesce(s.submittedOn, s.decidedAt, s.createdAt) desc, s.id desc"
    )
    Page<CwsSubmission> findPastWithStatus(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("status") String status, Pageable pageable);

    /** The atomic decision: only a row still in {@code from} moves (0 rows = somebody got there first). */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        "update CwsSubmission s set s.status = :to, s.decidedAt = :at, s.updatedAt = :at, s.declineReason = :reason " +
        "where s.orgId = :orgId and s.consultantId = :consultantId and s.id = :id and s.status = :from"
    )
    int transition(
        @Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("id") Long id, @Param("from") String from,
        @Param("to") String to, @Param("at") Instant at, @Param("reason") String reason
    );

    long countByOrgId(Long orgId);

    Optional<CwsSubmission> findByOrgIdAndId(Long orgId, Long id);
}
