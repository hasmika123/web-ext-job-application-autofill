package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.TalentApplication;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Marketing workspace (Job Matches) read access to {@code talent_application} (client history): every method takes the organization id first. */
public interface MktMatchApplicationRepository extends Repository<TalentApplication, Long> {
    List<TalentApplication> findByOrgIdAndConsultantIdIn(Long orgId, Collection<Long> consultantIds);
}
