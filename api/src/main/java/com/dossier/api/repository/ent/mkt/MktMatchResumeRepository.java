package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.OrgResume;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Marketing workspace (Job Matches) read access to {@code org_resume}: every method takes the organization id first. */
public interface MktMatchResumeRepository extends JpaRepository<OrgResume, Long> {
    List<OrgResume> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);
}
