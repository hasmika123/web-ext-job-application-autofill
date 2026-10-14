package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.util.Collection;
import java.util.List;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing "My Assigned Talent" drawer: job titles by id. Every method takes the organization id first. */
public interface MktTalentJobRepository extends Repository<ClientRequirement, Long> {

    @Query("select j from ClientRequirement j where j.orgId = :orgId and j.id in :ids")
    List<ClientRequirement> findByIds(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
