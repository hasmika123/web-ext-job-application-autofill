package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code requirement_match}: ASSIGNED rows are the consultant's assigned jobs. Every method takes the organization id first. */
public interface MktTalentMatchRepository extends Repository<RequirementMatch, Long> {

    @Query("select m from RequirementMatch m where m.orgId = :orgId and m.status = 'ASSIGNED' and m.consultantId in :ids")
    List<RequirementMatch> findAssignedForConsultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select m from RequirementMatch m where m.orgId = :orgId and m.status = 'ASSIGNED' and m.consultantId = :consultantId order by m.score desc")
    List<RequirementMatch> findAssignedForConsultant(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
