package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** Demand-side organizations (34 section 1). name_key (lower(name)) is added by a following changeset. Table {@code client_account}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "client_account")
public class ClientAccount implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 20, nullable = false)
    private String kind = "END_CLIENT";

    @Column(name = "name", length = 200, nullable = false)
    private String name;

    @Column(name = "website", length = 300)
    private String website;

    @Column(name = "industry", length = 80)
    private String industry;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "owner_member_id")
    private Long ownerMemberId;

    @Column(name = "notes", length = 1000)
    private String notes;

    /** Added by ent_clients: where the client is based, its size band (1-50 ... 5000+), when the relationship began and a short description. */
    @Column(name = "location", length = 120)
    private String location;

    @Column(name = "size_band", length = 20)
    private String sizeBand;

    @Column(name = "client_since")
    private java.time.LocalDate clientSince;

    @Column(name = "about", length = 1000)
    private String about;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "archived_at")
    private Instant archivedAt;

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getIndustry() { return industry; }
    public void setIndustry(String industry) { this.industry = industry; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getOwnerMemberId() { return ownerMemberId; }
    public void setOwnerMemberId(Long ownerMemberId) { this.ownerMemberId = ownerMemberId; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public String getLocation() { return location; }
    public void setLocation(String location) { this.location = location; }
    public String getSizeBand() { return sizeBand; }
    public void setSizeBand(String sizeBand) { this.sizeBand = sizeBand; }
    public java.time.LocalDate getClientSince() { return clientSince; }
    public void setClientSince(java.time.LocalDate clientSince) { this.clientSince = clientSince; }
    public String getAbout() { return about; }
    public void setAbout(String about) { this.about = about; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Instant getArchivedAt() { return archivedAt; }
    public void setArchivedAt(Instant archivedAt) { this.archivedAt = archivedAt; }
}
