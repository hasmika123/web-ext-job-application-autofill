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

    @Column(name = "sort_order", nullable = false)
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    /** The department a TEAM sits under (X4.5); null for a department, a cohort and a team with no department. */
    @Column(name = "parent_group_id")
    private Long parentGroupId;

    /** The member who leads the group (X4.5); counts as a member of it for TEAM / DEPARTMENT scope. */
    @Column(name = "lead_member_id")
    private Long leadMemberId;

    /** Optimistic-concurrency counter: the ETag of the group (X4.5). */
    @Version
    @Column(name = "version", nullable = false)
    private long version;

    /** ACTIVE or INACTIVE (archived). */
    @Column(name = "status", length = 12, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "icon", length = 24)
    private String icon;

    @Column(name = "color", length = 16)
    private String color;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public OrgGroupKind getKind() { return kind; }
    public void setKind(OrgGroupKind kind) { this.kind = kind; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Long getParentGroupId() { return parentGroupId; }
    public void setParentGroupId(Long parentGroupId) { this.parentGroupId = parentGroupId; }
    public Long getLeadMemberId() { return leadMemberId; }
    public void setLeadMemberId(Long leadMemberId) { this.leadMemberId = leadMemberId; }
    public long getVersion() { return version; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
}
