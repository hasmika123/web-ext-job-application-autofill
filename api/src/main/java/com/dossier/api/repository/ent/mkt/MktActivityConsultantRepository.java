package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The Activities page's own read of consultant rows (names for the feed, the Consultant filter and the Log Activity picker). Org id first. */
public interface MktActivityConsultantRepository extends Repository<ConsultantProfile, Long> {

    @Query("select c from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<ConsultantProfile> findByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** The consultants the caller may pick, by name ({@code all} = ORG scope, {@code ids} never empty). */
    @Query("select c from ConsultantProfile c where c.orgId = :orgId and (:all = true or c.id in :ids) order by c.displayName asc, c.id asc")
    List<ConsultantProfile> findVisible(@Param("orgId") Long orgId, @Param("all") boolean all, @Param("ids") Collection<Long> ids, Pageable page);
}
