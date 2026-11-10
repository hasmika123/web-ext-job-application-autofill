package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The Tasks page's own read of consultant rows (names on task rows, the Add Task picker), so the talent repository stays untouched. Org id first. */
public interface MktTaskConsultantRepository extends Repository<ConsultantProfile, Long> {

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id in :ids order by c.displayName asc")
    List<ConsultantProfile> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** The first 200 consultants of the org by name: the picker of a caller whose scope is the whole organization. */
    List<ConsultantProfile> findTop200ByOrgIdOrderByDisplayNameAsc(Long orgId);
}
