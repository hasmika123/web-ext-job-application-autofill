package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Batch lookup of client requirements (the job an application is for) by id for the Applications board (org first, always). */
public interface MktApplicationRequirementRepository extends JpaRepository<ClientRequirement, Long> {
    List<ClientRequirement> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
