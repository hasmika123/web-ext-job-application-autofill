package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;

/** Batch lookup of client requirements (the job an application is for) by id for the Applications board (org first, always). */
public interface MktApplicationRequirementRepository extends Repository<ClientRequirement, Long> {
    List<ClientRequirement> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
