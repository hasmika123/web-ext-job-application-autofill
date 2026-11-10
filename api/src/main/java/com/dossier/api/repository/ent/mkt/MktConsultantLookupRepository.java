package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** The Marketing workspace's own read of consultant rows (names for the follow-up lists), so the talent repository stays untouched. Org id first. */
public interface MktConsultantLookupRepository extends Repository<ConsultantProfile, Long> {

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<ConsultantProfile> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
