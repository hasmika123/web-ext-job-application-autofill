package com.dossier.api.repository.ent.prepare;

import com.dossier.api.domain.ent.prepare.PrepareItem;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Org- and consultant-scoped access to {@code prepare_item}. */
public interface PrepareItemRepository extends Repository<PrepareItem, Long> {

    <S extends PrepareItem> S save(S item);

    List<PrepareItem> findByOrgIdAndConsultantIdAndSessionIdOrderByIdAsc(Long orgId, Long consultantId, Long sessionId);

    Optional<PrepareItem> findByOrgIdAndConsultantIdAndSessionIdAndMatchId(Long orgId, Long consultantId, Long sessionId, Long matchId);

    /** Items this consultant prepared since {@code since} (the daily and monthly caps count these). */
    @Query("select count(i) from PrepareItem i where i.orgId = :orgId and i.consultantId = :consultantId and i.createdAt >= :since")
    long countSince(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("since") Instant since);
}
