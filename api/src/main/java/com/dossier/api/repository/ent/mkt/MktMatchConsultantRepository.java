package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Marketing workspace (Job Matches) read access to {@code consultant_profile}: every method takes the organization id first. */
public interface MktMatchConsultantRepository extends Repository<ConsultantProfile, Long> {
    List<ConsultantProfile> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
