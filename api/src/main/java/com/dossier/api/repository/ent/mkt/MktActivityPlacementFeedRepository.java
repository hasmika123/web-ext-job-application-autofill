package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentPlacement;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Activities feed read of {@code talent_placement} (a placement is "confirmed" on its start date). Every method takes the organization id first. */
public interface MktActivityPlacementFeedRepository extends Repository<TalentPlacement, Long> {

    /** {id, roleTitle, status, consultantId, clientId, startDate} with a start date in {@code [from, to)}, newest first, for the consultants in scope. */
    @Query("select p.id, p.roleTitle, p.status, p.consultantId, p.clientId, p.startDate from TalentPlacement p "
        + "where p.orgId = :orgId and (:all = true or p.consultantId in :ids) and p.startDate >= :from and p.startDate < :to order by p.startDate desc, p.id desc")
    List<Object[]> feed(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, @Param("from") LocalDate from, @Param("to") LocalDate to, Pageable page);
}
