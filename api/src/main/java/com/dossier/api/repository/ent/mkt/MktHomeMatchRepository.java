package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Marketing Home board reads of {@code requirement_match}. Every method takes the organization id first. */
public interface MktHomeMatchRepository extends Repository<RequirementMatch, Long> {

    /** {consultantId, count} of SUGGESTED matches for the given consultants (consultants without any are absent). */
    @Query("select m.consultantId, count(m) from RequirementMatch m where m.orgId = :orgId and m.status = 'SUGGESTED' and m.consultantId in :ids group by m.consultantId")
    List<Object[]> countSuggestedByConsultant(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
