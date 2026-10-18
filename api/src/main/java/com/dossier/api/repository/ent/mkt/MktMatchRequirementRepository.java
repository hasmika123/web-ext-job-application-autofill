package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.repository.Repository;

/** Marketing workspace (Job Matches) read access to {@code client_requirement}: every method takes the organization id first. */
public interface MktMatchRequirementRepository extends Repository<ClientRequirement, Long> {
    List<ClientRequirement> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);

    Optional<ClientRequirement> findByOrgIdAndId(Long orgId, Long id);
}
