package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentPlacement;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Performance board reads of {@code talent_placement}. Every method takes the organization id first; the scoped one takes the caller's visible consultants as
 * {@code all} (ORG scope) plus {@code ids} (never empty: callers pass a sentinel list).
 */
public interface MktPerformancePlacementRepository extends Repository<TalentPlacement, Long> {

    /** Placements that started on or after {@code from}. */
    @Query("select p from TalentPlacement p where p.orgId = :orgId and (:all = true or p.consultantId in :ids) and p.startDate >= :from")
    List<TalentPlacement> findStartedSince(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") LocalDate from);
}
