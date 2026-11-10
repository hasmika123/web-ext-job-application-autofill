package com.dossier.api.domain.ent;

import com.dossier.api.domain.enumeration.PermissionScope;
import jakarta.persistence.*;
import java.io.Serializable;

/**
 * One permission a role holds, with the scope it reaches (03-domain-model.md section 2.1; unique per role and key). Two
 * optional attributes carry what the legacy {@code OrgScope} said beyond "everyone": {@code ceilingRoleKey} (a STAFF may only
 * invite people who become MEMBERs; an ORG_ADMIN may not touch OWNER or ORG_ADMIN) and {@code rowFilter} (FINANCE reads only
 * the billing and ops rows of the audit trail). Dropping them would silently widen those roles, so they are stored.
 */
@Entity
@Table(name = "org_role_permission")
public class OrgRolePermission implements Serializable {

    private static final long serialVersionUID = 1L;

    /** Narrowing attribute: the actor may act only on people whose role is MEMBER. */
    public static final String CEILING_MEMBER = "MEMBER";
    /** Narrowing attribute: the actor may act only on people below ORG_ADMIN (never OWNER or ORG_ADMIN). */
    public static final String CEILING_BELOW_ADMIN = "BELOW_ADMIN";
    public static final String ROW_FILTER_BILLING_OPS = "BILLING_OPS";
    public static final String ROW_FILTER_HR = "HR";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "permission_key", length = 60, nullable = false)
    private String permissionKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", length = 12, nullable = false)
    private PermissionScope scope;

    @Column(name = "ceiling_role_key", length = 40)
    private String ceilingRoleKey;

    @Column(name = "row_filter", length = 30)
    private String rowFilter;

    public OrgRolePermission() {}

    public OrgRolePermission(Long roleId, String permissionKey, PermissionScope scope, String ceilingRoleKey, String rowFilter) {
        this.roleId = roleId;
        this.permissionKey = permissionKey;
        this.scope = scope;
        this.ceilingRoleKey = ceilingRoleKey;
        this.rowFilter = rowFilter;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getRoleId() { return roleId; }
    public void setRoleId(Long roleId) { this.roleId = roleId; }
    public String getPermissionKey() { return permissionKey; }
    public void setPermissionKey(String permissionKey) { this.permissionKey = permissionKey; }
    public PermissionScope getScope() { return scope; }
    public void setScope(PermissionScope scope) { this.scope = scope; }
    public String getCeilingRoleKey() { return ceilingRoleKey; }
    public void setCeilingRoleKey(String ceilingRoleKey) { this.ceilingRoleKey = ceilingRoleKey; }
    public String getRowFilter() { return rowFilter; }
    public void setRowFilter(String rowFilter) { this.rowFilter = rowFilter; }
}
