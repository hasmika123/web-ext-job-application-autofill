package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgRoleDefinition;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Roles as data. A role is visible to an organization when it is a system template (org_id null) or its own; every
 * org-facing method names the organization first. The two {@code findSystem*} methods are the deliberate exceptions: system
 * templates belong to no organization and are only read by the seeder and the legacy-seat sync (allow-listed in
 * {@code EntRepositoryContractTest}).
 */
public interface OrgRoleRepository extends Repository<OrgRoleDefinition, Long> {
    <S extends OrgRoleDefinition> S save(S role);

    <S extends OrgRoleDefinition> S saveAndFlush(S role);

    /** System templates first (by id), then the organization's own roles. */
    @Query("select r from OrgRoleDefinition r where r.orgId is null or r.orgId = :orgId order by r.system desc, r.id asc")
    List<OrgRoleDefinition> findVisibleToOrg(@Param("orgId") Long orgId);

    @Query("select r from OrgRoleDefinition r where r.id = :id and (r.orgId is null or r.orgId = :orgId)")
    Optional<OrgRoleDefinition> findVisibleByOrgIdAndId(@Param("orgId") Long orgId, @Param("id") Long id);

    /** The roles with these ids that this organization may use (system templates and its own); anything else is silently absent. */
    @Query("select r from OrgRoleDefinition r where r.id in :ids and (r.orgId is null or r.orgId = :orgId)")
    List<OrgRoleDefinition> findVisibleByOrgIdAndIdIn(@Param("orgId") Long orgId, @Param("ids") java.util.Collection<Long> ids);

    @Query("select r from OrgRoleDefinition r where r.orgId is null and r.roleKey = :roleKey")
    Optional<OrgRoleDefinition> findSystemByRoleKey(@Param("roleKey") String roleKey);

    @Query("select r from OrgRoleDefinition r where r.orgId is null order by r.id asc")
    List<OrgRoleDefinition> findSystemRoles();
}
