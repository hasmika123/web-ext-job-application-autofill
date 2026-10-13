package com.dossier.api.repository.ent;

import com.dossier.api.domain.ent.OrgRolePermission;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * The permission rows of roles. {@link #findForRoles} only returns rows of roles the organization may use (a system template
 * or its own), whatever ids it is given. The two {@code *SystemRole*} methods are for the seeder, which maintains the
 * organization-independent templates, and are allow-listed in {@code EntRepositoryContractTest}.
 */
public interface OrgRolePermissionRepository extends Repository<OrgRolePermission, Long> {
    <S extends OrgRolePermission> S save(S permission);

    <S extends OrgRolePermission> S saveAndFlush(S permission);

    @Query(
        "select p from OrgRolePermission p where p.roleId in :roleIds " +
        "and p.roleId in (select r.id from OrgRoleDefinition r where r.orgId is null or r.orgId = :orgId) " +
        "order by p.roleId asc, p.permissionKey asc"
    )
    List<OrgRolePermission> findForRoles(@Param("orgId") Long orgId, @Param("roleIds") Collection<Long> roleIds);

    @Query(
        "select p from OrgRolePermission p where p.roleId in (select r.id from OrgRoleDefinition r where r.orgId is null) " +
        "order by p.roleId asc, p.permissionKey asc"
    )
    List<OrgRolePermission> findAllSystemRolePermissions();

    @Modifying(flushAutomatically = true)
    @Query("delete from OrgRolePermission p where p.roleId = :roleId and p.permissionKey in :keys and p.roleId in (select r.id from OrgRoleDefinition r where r.orgId is null)")
    int deleteSystemRolePermissions(@Param("roleId") Long roleId, @Param("keys") Collection<String> keys);
}
