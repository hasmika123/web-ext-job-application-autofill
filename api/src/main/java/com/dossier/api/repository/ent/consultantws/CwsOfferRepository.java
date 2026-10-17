package com.dossier.api.repository.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.Repository;

/** Org-scoped access to {@code cws_offer}: every method takes the organization id first, then the consultant id. */
public interface CwsOfferRepository extends Repository<CwsOffer, Long> {
    <S extends CwsOffer> S save(S entity);

    <S extends CwsOffer> S saveAndFlush(S entity);

    void flush();

    <S extends CwsOffer> List<S> saveAll(Iterable<S> entities);

    void delete(CwsOffer entity);

    /** The consultant's view: an org-side DRAFT is not theirs to see until the org records it as extended. */
    @Query("select o from CwsOffer o where o.orgId = :orgId and o.consultantId = :consultantId and o.status <> 'DRAFT'")
    List<CwsOffer> findByOrgIdAndConsultantId(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);

    @Query("select o from CwsOffer o where o.orgId = :orgId and o.consultantId = :consultantId and o.id = :id and o.status <> 'DRAFT'")
    Optional<CwsOffer> findByOrgIdAndConsultantIdAndId(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("id") Long id);

    long countByOrgIdAndConsultantId(Long orgId, Long consultantId);

    /**
     * The filtered page. Empty strings mean "no filter". An open offer (pending review or negotiation) whose deadline day is before
     * {@code today} counts as EXPIRED, so the status filter uses that effective status.
     */
    @Query(
        "select o from CwsOffer o where o.orgId = :orgId and o.consultantId = :consultantId and o.status <> 'DRAFT' " +
        "and (:status = '' or (:status = 'EXPIRED' and (o.status = 'EXPIRED' or (o.status in ('PENDING_REVIEW','NEGOTIATION') and o.offerDeadline is not null and o.offerDeadline < :today))) " +
        "  or (:status <> 'EXPIRED' and o.status = :status and not (o.status in ('PENDING_REVIEW','NEGOTIATION') and o.offerDeadline is not null and o.offerDeadline < :today))) " +
        "and (:company = '' or o.clientName = :company) " +
        "and (:workMode = '' or o.workMode = :workMode) " +
        "and (:pattern = '' or lower(o.clientName) like :pattern or lower(o.roleTitle) like :pattern or lower(coalesce(o.packageSummary, '')) like :pattern)"
    )
    Page<CwsOffer> search(
        @Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("status") String status, @Param("company") String company,
        @Param("workMode") String workMode, @Param("pattern") String pattern, @Param("today") LocalDate today, Pageable pageable
    );

    /** The atomic response: only a row still in one of {@code from} (and not past its deadline) moves; 0 rows = somebody got there first. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(
        "update CwsOffer o set o.status = :to, o.respondedAt = :at, o.updatedAt = :at, o.responseNote = :note, o.updatedByKind = 'CONSULTANT', o.updatedByMemberId = null " +
        "where o.orgId = :orgId and o.consultantId = :consultantId and o.id = :id and o.status in :from " +
        "and (o.offerDeadline is null or o.offerDeadline >= :today)"
    )
    int transition(
        @Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("id") Long id, @Param("from") Collection<String> from,
        @Param("to") String to, @Param("at") Instant at, @Param("note") String note, @Param("today") LocalDate today
    );

    long countByOrgId(Long orgId);

    List<CwsOffer> findByOrgId(Long orgId);

    Optional<CwsOffer> findByOrgIdAndId(Long orgId, Long id);
}
