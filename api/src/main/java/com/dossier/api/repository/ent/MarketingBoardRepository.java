package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/** Read-only aggregates for the Marketing Assignments board. Every method names the organization first. */
public interface MarketingBoardRepository extends Repository<MarketerAssignment, Long> {

    /** (consultantId, open applications): every stage but CLOSED. */
    @Query("select a.consultantId, count(a) from TalentApplication a where a.orgId = :orgId and a.stage <> 'CLOSED' group by a.consultantId")
    List<Object[]> countOpenApplicationsByConsultant(@Param("orgId") Long orgId);

    /** Consultants that have an application at the client. */
    @Query("select distinct a.consultantId from TalentApplication a where a.orgId = :orgId and a.clientId = :clientId")
    List<Long> consultantIdsWithApplicationAt(@Param("orgId") Long orgId, @Param("clientId") Long clientId);

    /** Consultants placed (any status) at the client. */
    @Query("select distinct p.consultantId from TalentPlacement p where p.orgId = :orgId and p.clientId = :clientId")
    List<Long> consultantIdsPlacedAt(@Param("orgId") Long orgId, @Param("clientId") Long clientId);

    /** Consultants with an application at a client whose name matches (lower-cased LIKE pattern). */
    @Query("select distinct a.consultantId from TalentApplication a, ClientAccount c where a.orgId = :orgId and c.orgId = :orgId and c.id = a.clientId and lower(c.name) like :pattern escape '!'")
    List<Long> consultantIdsByClientName(@Param("orgId") Long orgId, @Param("pattern") String pattern);

    /** Consultants with a skill that matches (lower-cased LIKE pattern). */
    @Query("select distinct s.consultantId from ConsultantSkill s where s.orgId = :orgId and lower(s.skill) like :pattern escape '!'")
    List<Long> consultantIdsBySkill(@Param("orgId") Long orgId, @Param("pattern") String pattern);

    /** (memberId, first name, last name, display label, invite name, title) of the given seats of the organization. */
    @Query(
        "select m.id, u.firstName, u.lastName, m.displayLabel, m.inviteName, m.title from OrgMember m left join User u on u.id = m.userId " +
        "where m.orgId = :orgId and m.id in :ids"
    )
    List<Object[]> seatNames(@Param("orgId") Long orgId, @Param("ids") Collection<Long> ids);

    /** Active seats of the organization that hold one of the roles (by role key): (memberId, first, last, display label, title). */
    @Query(
        "select distinct m.id, u.firstName, u.lastName, m.displayLabel, m.title from OrgMember m left join User u on u.id = m.userId, OrgMemberRole r, OrgRoleDefinition d " +
        "where m.orgId = :orgId and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE and r.orgId = :orgId and r.memberId = m.id and r.endsAt is null " +
        "and d.id = r.roleId and d.roleKey in :roleKeys"
    )
    List<Object[]> seatsWithRoleKeys(@Param("orgId") Long orgId, @Param("roleKeys") Collection<String> roleKeys);

    /** 1 when the seat is an ACTIVE seat of the organization holding one of the roles. */
    @Query(
        "select count(m) from OrgMember m, OrgMemberRole r, OrgRoleDefinition d where m.orgId = :orgId and m.id = :memberId " +
        "and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE and r.orgId = :orgId and r.memberId = m.id and r.endsAt is null " +
        "and d.id = r.roleId and d.roleKey in :roleKeys"
    )
    long countActiveSeatWithRoleKeys(@Param("orgId") Long orgId, @Param("memberId") Long memberId, @Param("roleKeys") Collection<String> roleKeys);
}
