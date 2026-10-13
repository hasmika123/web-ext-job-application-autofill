package com.dossier.api.repository.ent.mkt;

import com.dossier.api.domain.ent.talent.RequirementMatch;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Marketing workspace (Job Matches) access to {@code requirement_match}: every method takes the organization id first. */
public interface MktMatchRepository extends JpaRepository<RequirementMatch, Long> {

    Optional<RequirementMatch> findByOrgIdAndId(Long orgId, Long id);

    /** The live matches of the org: the given statuses, on requirements that are still OPEN (a filled or closed job has nothing left to match). */
    @Query(
        "select m from RequirementMatch m where m.orgId = :orgId and m.status in :statuses and m.requirementId in " +
        "(select r.id from ClientRequirement r where r.orgId = :orgId and r.status = 'OPEN')"
    )
    List<RequirementMatch> findLive(@Param("orgId") Long orgId, @Param("statuses") Collection<String> statuses);
}
