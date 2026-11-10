package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentPlacement;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" overview: the consultant's current placement (name facts only; the money columns are never selected into a DTO). Every method takes the organization id first. */
public interface MktTalentPlacementRepository extends Repository<TalentPlacement, Long> {

    @Query("select p from TalentPlacement p where p.orgId = :orgId and p.consultantId = :consultantId and p.status = 'ACTIVE' order by p.startDate desc")
    List<TalentPlacement> findActiveForConsultant(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
