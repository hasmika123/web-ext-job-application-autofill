package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.OrgResume;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code org_resume} (batch by consultant ids). Every method takes the organization id first. */
public interface MktTalentResumeRepository extends JpaRepository<OrgResume, Long> {

    @Query("select r from OrgResume r where r.orgId = :orgId and r.consultantId in :ids")
    List<OrgResume> findForConsultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select r from OrgResume r where r.orgId = :orgId and r.consultantId = :consultantId order by r.updatedAt desc")
    List<OrgResume> findForConsultant(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId);
}
