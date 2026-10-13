package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.OrgGroupKind;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A department, cohort or team inside an organization (tenant-model.md section 2.3). Unique name per org. */
@Entity
@Table(name = "org_group")
public class OrgGroup implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 20, nullable = false)
    private OrgGroupKind kind = OrgGroupKind.TEAM;

    /** The department a TEAM belongs to (Enterprise V2, X4.3/X4.5); null for departments, cohorts and unassigned teams. */
    @Column(name = "parent_group_id")
    private Long parentGroupId;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public OrgGroupKind getKind() { return kind; }
    public void setKind(OrgGroupKind kind) { this.kind = kind; }
    public Long getParentGroupId() { return parentGroupId; }
    public void setParentGroupId(Long parentGroupId) { this.parentGroupId = parentGroupId; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
