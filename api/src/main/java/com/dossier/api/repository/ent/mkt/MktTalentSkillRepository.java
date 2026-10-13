package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantSkill;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" reads of {@code consultant_skill}. Every method takes the organization id first. */
public interface MktTalentSkillRepository extends JpaRepository<ConsultantSkill, Long> {

    @Query("select s from ConsultantSkill s where s.orgId = :orgId and s.consultantId in :ids order by s.sortOrder asc")
    List<ConsultantSkill> findForConsultants(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
