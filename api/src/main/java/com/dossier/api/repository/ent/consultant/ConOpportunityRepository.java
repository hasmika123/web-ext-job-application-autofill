package com.dossier.api.repository.ent.consultant;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktPipelineApplicationLink;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The consultant's view of {@code mkt_opportunity} (doc 60 section 4): every query takes the organization FIRST and the CONSULTANT second, and only
 * sees pairs whose {@code requirement_match} is ASSIGNED. The consultant id is never a request value: {@code ConScope} resolves it from the caller's seat.
 * Someone else's opportunity id therefore finds nothing, exactly like one that does not exist.
 */
public interface ConOpportunityRepository extends Repository<MktOpportunity, Long> {

    String ROW =
        "select new com.dossier.api.repository.ent.consultant.ConOpportunityRow("
            + "o.id, m.id, m.consultantId, r.id, o.state, o.marketerNote, o.priority, o.dueOn, o.infoRequest, o.infoAnswer, o.appliedAt, o.version, "
            + "m.assignedAt, m.assignedByMemberId, r.title, c.name, r.location, r.workMode, r.employmentLabel, r.payLabel, r.jobUrl, r.atsPlatform, "
            + "r.externalJobId, r.postedOn, r.status) "
            + "from MktOpportunity o "
            + "join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "join ClientRequirement r on r.orgId = m.orgId and r.id = m.requirementId "
            + "join ClientAccount c on c.orgId = r.orgId and c.id = r.clientId "
            + "where o.orgId = :orgId and m.consultantId = :consultantId and m.status = 'ASSIGNED'";

    String ORDER = " order by m.assignedAt desc, o.id desc";

    /** One page of the consultant's opportunities in the given states (never an empty collection), newest assignment first. */
    @Query(ROW + " and o.state in :states" + ORDER)
    List<ConOpportunityRow> findRows(
        @Param("orgId") Long orgId,
        @Param("consultantId") Long consultantId,
        @Param("states") Collection<String> states,
        Pageable page
    );

    @Query(
        "select count(o) from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where o.orgId = :orgId and m.consultantId = :consultantId and m.status = 'ASSIGNED' and o.state in :states"
    )
    long countRows(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("states") Collection<String> states);

    @Query(ROW + " and o.id = :id")
    Optional<ConOpportunityRow> findRow(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("id") Long id);

    /** The opportunity entity itself (to change it), only when it is this consultant's. */
    @Query(
        "select o from MktOpportunity o join RequirementMatch m on m.orgId = o.orgId and m.id = o.matchId "
            + "where o.orgId = :orgId and m.consultantId = :consultantId and m.status = 'ASSIGNED' and o.id = :id"
    )
    Optional<MktOpportunity> findOwned(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("id") Long id);

    // ---- matching a page the consultant is on (the extension's ?match=, and the application linker) -----------------------------

    @Query(ROW + " and r.urlKeyHash = :urlKeyHash" + ORDER)
    List<ConOpportunityRow> findByUrlKeyHash(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("urlKeyHash") String urlKeyHash);

    @Query(ROW + " and r.atsPlatform = :atsPlatform and r.externalJobId = :externalJobId" + ORDER)
    List<ConOpportunityRow> findByAtsAndExternalId(
        @Param("orgId") Long orgId,
        @Param("consultantId") Long consultantId,
        @Param("atsPlatform") String atsPlatform,
        @Param("externalJobId") String externalJobId
    );

    /** Every opportunity of the consultant NOT in the given states (the open ones): the linker's company-and-title suggestion reads these. */
    @Query(ROW + " and o.state not in :excluded" + ORDER)
    List<ConOpportunityRow> findNotIn(@Param("orgId") Long orgId, @Param("consultantId") Long consultantId, @Param("excluded") Collection<String> excluded);

    // ---- links ---------------------------------------------------------------------------------------------------------------

    /** The live (not unlinked) links of these opportunities of this consultant. */
    @Query(
        "select l from MktPipelineApplicationLink l where l.orgId = :orgId and l.consultantId = :consultantId and l.unlinkedAt is null "
            + "and l.opportunityId in :opportunityIds"
    )
    List<MktPipelineApplicationLink> findLiveLinks(
        @Param("orgId") Long orgId,
        @Param("consultantId") Long consultantId,
        @Param("opportunityIds") Collection<Long> opportunityIds
    );
}
