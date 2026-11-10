package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Performance board reads of {@code requirement_match}. Every method takes the organization id first. */
public interface MktPerformanceMatchRepository extends Repository<RequirementMatch, Long> {

    /** {consultantId, average score} over every match a consultant has that was not dismissed. */
    @Query("select m.consultantId, avg(m.score) from RequirementMatch m where m.orgId = :orgId and m.status <> 'DISMISSED' and m.consultantId in :ids group by m.consultantId")
    List<Object[]> averageScoreByConsultant(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** {consultantId, count} of SUGGESTED matches. */
    @Query("select m.consultantId, count(m) from RequirementMatch m where m.orgId = :orgId and m.status = 'SUGGESTED' and m.consultantId in :ids group by m.consultantId")
    List<Object[]> countSuggestedByConsultant(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
