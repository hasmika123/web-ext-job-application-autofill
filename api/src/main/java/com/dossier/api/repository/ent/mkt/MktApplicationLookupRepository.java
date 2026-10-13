package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

/** Batch lookup of consultants by id for the Applications board (org first, always). */
public interface MktApplicationLookupRepository extends JpaRepository<ConsultantProfile, Long> {
    List<ConsultantProfile> findByOrgIdAndIdIn(Long orgId, Collection<Long> ids);
}
