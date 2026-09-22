package com.dossier.api.repository;

import com.dossier.api.domain.FillEvent;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

/** Fill telemetry (Phase 10.1). Rows are counts only and belong to no user. */
@Repository
public interface FillEventRepository extends JpaRepository<FillEvent, String> {
    @Query(
        "select new com.dossier.api.repository.FillQualityRow(" +
        "  f.ats, count(f), coalesce(sum(f.fieldsFound), 0L), coalesce(sum(f.fieldsFilled), 0L)," +
        "  coalesce(sum(f.fieldsFailed), 0L), coalesce(sum(f.userCorrected), 0L)," +
        "  sum(case when f.requiredLeftEmpty > 0 then 1L else 0L end)," +
        "  sum(case when f.adapter = 'generic' then 1L else 0L end)) " +
        "from FillEvent f where f.createdAt >= :since group by f.ats"
    )
    List<FillQualityRow> qualityByAtsSince(@Param("since") Instant since);

    /**
     * One more field the user changed after we filled it. Bounded twice so a stray or replayed
     * signal can't inflate the stat: only within the window after the fill, and never past the
     * number of fields that were actually filled.
     */
    // A bulk update bypasses the persistence context, so flush before and clear after — otherwise a
    // read in the same transaction can still see the old count.
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
        "update FillEvent f set f.userCorrected = f.userCorrected + 1 " +
        "where f.id = :id and f.createdAt >= :notBefore and f.userCorrected < f.fieldsFilled"
    )
    int incrementCorrection(@Param("id") String id, @Param("notBefore") Instant notBefore);
}
