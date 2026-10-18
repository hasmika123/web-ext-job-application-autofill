package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** How many consultants a marketer may carry (17 section 5 cap, per marketer). Table {@code marketer_capacity}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "marketer_capacity")
public class MarketerCapacity implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "capacity", nullable = false)
    private Integer capacity = 10;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "title_label", length = 80)
    private String titleLabel;

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
    public Integer getCapacity() { return capacity; }
    public void setCapacity(Integer capacity) { this.capacity = capacity; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getTitleLabel() { return titleLabel; }
    public void setTitleLabel(String titleLabel) { this.titleLabel = titleLabel; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
