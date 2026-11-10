package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** The Activities page's read of {@code marketer_assignment} (who owns a placement's consultant). Org id first. */
public interface MktActivityAssignmentRepository extends Repository<MarketerAssignment, Long> {

    @Query("select a from MarketerAssignment a where a.orgId = :orgId and a.consultantId in :ids")
    List<MarketerAssignment> findByOrgIdAndConsultantIdIn(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);
}
