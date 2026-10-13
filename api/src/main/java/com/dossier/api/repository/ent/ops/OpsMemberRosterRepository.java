package com.dossier.api.repository.ent.ops;

import com.dossier.api.domain.org.OrgMember;
import java.util.List;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Read-only roster of an organization's seats for the HR, Finance and Reports pages (owners, recipients, managers, employees). A seam of its own so
 * these pages need no change to {@code OrgMemberRepository}. Every method takes the organization id first.
 */
public interface OpsMemberRosterRepository extends Repository<OrgMember, Long> {

    /** Every seat of the organization, any status (ACTIVE, SUSPENDED, INVITED, LEFT, ...), oldest first. */
    @Query("select m from OrgMember m where m.orgId = :orgId order by m.id")
    List<OrgMember> findRoster(@Param("orgId") Long orgId);
}
