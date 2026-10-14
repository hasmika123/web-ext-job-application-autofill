package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Marketing Home board reads of {@code client_requirement} (the job's location, which the Matches rows do not carry). Every method takes the organization id first. */
public interface MktHomeRequirementRepository extends Repository<ClientRequirement, Long> {

    /** {id, location} of the given jobs. */
    @Query("select r.id, r.location from ClientRequirement r where r.orgId = :orgId and r.id in :ids")
    List<Object[]> findLocations(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
