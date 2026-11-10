package com.dossier.api.repository.ent.mgmt;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Read-only lookups the Marketing Manager pages share (names to show). Every method names the organization first. */
public interface MgmtLookupRepository extends Repository<ConsultantProfile, Long> {

    /** {@code [id, displayName]} of these consultant profiles of the organization. */
    @Query("select c.id, c.displayName from ConsultantProfile c where c.orgId = :orgId and c.id in :ids")
    List<Object[]> consultantNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
