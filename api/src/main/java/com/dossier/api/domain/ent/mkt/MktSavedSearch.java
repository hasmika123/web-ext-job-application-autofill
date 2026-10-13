package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** A marketer's saved job search: a name plus its filter criteria as JSON text. "N new" is computed from {@code lastSeenAt}, never stored. Table {@code mkt_saved_search}. */
@Entity
@Table(name = "mkt_saved_search")
public class MktSavedSearch implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "owner_member_id", nullable = false)
    private Long ownerMemberId;

    @Column(name = "name", length = 80, nullable = false)
    private String name;

    @Column(name = "criteria", length = 2000, nullable = false)
    private String criteria;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "last_seen_at")
    private Instant lastSeenAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCriteria() { return criteria; }
    public void setCriteria(String criteria) { this.criteria = criteria; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
}
