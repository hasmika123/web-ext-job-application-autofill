package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.OrgResumeExperience;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * The Marketing Resumes page's own org-scoped queries over {@code org_resume} (the shared talent repositories are left alone).
 * Every method takes the organization id first.
 */
public interface MktResumeRepository extends JpaRepository<OrgResume, Long> {

    @Query("select r from OrgResume r where r.orgId = :orgId and r.id = :id")
    Optional<OrgResume> byId(@Param("orgId") Long orgId, @Param("id") Long id);

    @Query("select r from OrgResume r where r.orgId = :orgId")
    List<OrgResume> all(@Param("orgId") Long orgId);

    @Query("select r from OrgResume r where r.orgId = :orgId and r.consultantId in :consultantIds")
    List<OrgResume> forConsultants(@Param("orgId") Long orgId, @Param("consultantIds") Collection<Long> consultantIds);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<ConsultantProfile> consultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select c from ConsultantProfile c where c.orgId = :orgId")
    List<ConsultantProfile> allConsultants(@Param("orgId") Long orgId);

    @Query("select s from ConsultantSkill s where s.orgId = :orgId and s.consultantId in :ids order by s.sortOrder asc, s.id asc")
    List<ConsultantSkill> skills(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    @Query("select s from ConsultantSkill s where s.orgId = :orgId order by s.sortOrder asc, s.id asc")
    List<ConsultantSkill> allSkills(@Param("orgId") Long orgId);

    @Query("select x from OrgResumeExperience x where x.orgId = :orgId and x.resumeId = :resumeId order by x.sortOrder asc, x.id asc")
    List<OrgResumeExperience> experience(@Param("orgId") Long orgId, @Param("resumeId") Long resumeId);
}
