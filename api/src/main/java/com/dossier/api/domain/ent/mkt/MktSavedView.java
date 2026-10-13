package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A marketer's own named filter set on a Marketing page ("Saved Views" on My Assigned Talent). Table {@code mkt_saved_view}; one row
 * per (member, page, name). Personal preference only: it stores filter choices, never consultant data or PII. Every query goes
 * through an org-scoped repository method.
 */
@Entity
@Table(name = "mkt_saved_view")
public class MktSavedView implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PAGE_TALENT = "TALENT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "page_key", length = 20, nullable = false)
    private String pageKey = PAGE_TALENT;

    @Column(name = "name", length = 60, nullable = false)
    private String name;

    @Column(name = "query_text", length = 120)
    private String queryText;

    @Column(name = "status_filter", length = 20)
    private String statusFilter;

    @Column(name = "skill_filter", length = 60)
    private String skillFilter;

    @Column(name = "location_filter", length = 120)
    private String locationFilter;

    @Column(name = "experience_filter", length = 10)
    private String experienceFilter;

    @Column(name = "availability_filter", length = 20)
    private String availabilityFilter;

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
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public String getPageKey() { return pageKey; }
    public void setPageKey(String pageKey) { this.pageKey = pageKey; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getQueryText() { return queryText; }
    public void setQueryText(String queryText) { this.queryText = queryText; }
    public String getStatusFilter() { return statusFilter; }
    public void setStatusFilter(String statusFilter) { this.statusFilter = statusFilter; }
    public String getSkillFilter() { return skillFilter; }
    public void setSkillFilter(String skillFilter) { this.skillFilter = skillFilter; }
    public String getLocationFilter() { return locationFilter; }
    public void setLocationFilter(String locationFilter) { this.locationFilter = locationFilter; }
    public String getExperienceFilter() { return experienceFilter; }
    public void setExperienceFilter(String experienceFilter) { this.experienceFilter = experienceFilter; }
    public String getAvailabilityFilter() { return availabilityFilter; }
    public void setAvailabilityFilter(String availabilityFilter) { this.availabilityFilter = availabilityFilter; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
