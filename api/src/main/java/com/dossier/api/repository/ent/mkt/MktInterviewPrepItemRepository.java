package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.mkt.MktInterviewPrepItem;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org-scoped access to {@code mkt_interview_prep_item}; every method takes the organization id first. */
public interface MktInterviewPrepItemRepository extends Repository<MktInterviewPrepItem, Long> {
    List<MktInterviewPrepItem> findByOrgIdAndInterviewIdOrderByPositionAsc(Long orgId, Long interviewId);

    Optional<MktInterviewPrepItem> findByOrgIdAndInterviewIdAndId(Long orgId, Long interviewId, Long id);

    long countByOrgIdAndInterviewId(Long orgId, Long interviewId);

    /** The checklist read with a locking read ({@code FOR UPDATE}): it sees rows another transaction committed after this one's snapshot was taken. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from MktInterviewPrepItem p where p.orgId = :orgId and p.interviewId = :interviewId order by p.position asc")
    List<MktInterviewPrepItem> lockByOrgIdAndInterviewId(@Param("orgId") Long orgId, @Param("interviewId") Long interviewId);

    /**
     * The interview's checklist-creation lock, a MySQL named lock ({@code GET_LOCK} on {@code kiwiply-mkt-prep-<orgId>-<interviewId>}): 1 when taken,
     * 0 on timeout. Held by the connection until {@link #releaseCreateLock} (or the connection closes).
     */
    @Query(value = "select get_lock(concat('kiwiply-mkt-prep-', :orgId, '-', :interviewId), :seconds)", nativeQuery = true)
    Integer takeCreateLock(@Param("orgId") Long orgId, @Param("interviewId") Long interviewId, @Param("seconds") int seconds);

    @Query(value = "select release_lock(concat('kiwiply-mkt-prep-', :orgId, '-', :interviewId))", nativeQuery = true)
    Integer releaseCreateLock(@Param("orgId") Long orgId, @Param("interviewId") Long interviewId);

    <S extends MktInterviewPrepItem> S save(S entity);
}
