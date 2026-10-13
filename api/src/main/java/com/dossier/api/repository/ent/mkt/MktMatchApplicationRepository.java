package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Marketing workspace (Job Matches) read access to {@code talent_application} (client history): every method takes the organization id first. */
public interface MktMatchApplicationRepository extends JpaRepository<TalentApplication, Long> {
    List<TalentApplication> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);
}
