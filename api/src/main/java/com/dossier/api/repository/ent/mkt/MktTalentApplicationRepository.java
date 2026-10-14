package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code talent_application}. Every method takes the organization id first. */
public interface MktTalentApplicationRepository extends Repository<TalentApplication, Long> {

    @Query("select a from TalentApplication a where a.orgId = :orgId and a.consultantId in :ids and a.stage <> 'CLOSED'")
    List<TalentApplication> findOpenForConsultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select a from TalentApplication a where a.orgId = :orgId and a.consultantId = :consultantId order by a.stageChangedAt desc")
    List<TalentApplication> findForConsultant(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
