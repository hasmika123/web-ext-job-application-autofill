package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A role stored as data (03-domain-model.md section 2.1, ADR-005): either one of the twelve organization-independent
 * <b>system templates</b> ({@code orgId} null, {@code system} true, read-only) or an organization's own role (an
 * independent clone, written from X1.14). The permission rows live in {@link OrgRolePermission}. The class is named
 * {@code OrgRoleDefinition} because {@code OrgRole} is already the legacy enum this table gradually replaces; the table is
 * {@code org_role}. A generated column makes {@code (org_id, role_key)} unique even for the null-org rows.
 */
@Entity
@Table(name = "org_role")
public class OrgRoleDefinition implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    /** Null for a system template. */
    @Column(name = "org_id")
    private Long orgId;

    @Column(name = "role_key", length = 40, nullable = false)
    private String roleKey;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Column(name = "description", length = 255)
    private String description;

    /** The system template this role derives from (a template's own key for a template row). */
    @Column(name = "template_key", length = 40)
    private String templateKey;

    @Column(name = "is_system", nullable = false)
    private boolean system;

    @Column(name = "is_editable", nullable = false)
    private boolean editable = true;

    @Column(name = "workspace_key", length = 40)
    private String workspaceKey;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getRoleKey() { return roleKey; }
    public void setRoleKey(String roleKey) { this.roleKey = roleKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getTemplateKey() { return templateKey; }
    public void setTemplateKey(String templateKey) { this.templateKey = templateKey; }
    public boolean isSystem() { return system; }
    public void setSystem(boolean system) { this.system = system; }
    public boolean isEditable() { return editable; }
    public void setEditable(boolean editable) { this.editable = editable; }
    public String getWorkspaceKey() { return workspaceKey; }
    public void setWorkspaceKey(String workspaceKey) { this.workspaceKey = workspaceKey; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
