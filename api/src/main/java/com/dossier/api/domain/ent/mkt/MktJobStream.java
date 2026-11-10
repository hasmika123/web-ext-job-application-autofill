package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * One configured job-source feed of an organization (the Job Streams board). Table {@code mkt_job_stream}; its columns are the
 * contract other Marketing pages read. It records configuration and the last sync result only: no credentials, no scraping.
 */
@Entity
@Table(name = "mkt_job_stream")
public class MktJobStream implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ACTIVE = "ACTIVE";
    public static final String PAUSED = "PAUSED";
    public static final String ERROR = "ERROR";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "source_label", length = 120, nullable = false)
    private String sourceLabel;

    @Column(name = "subtitle", length = 160)
    private String subtitle;

    @Column(name = "status", length = 20, nullable = false)
    private String status = ACTIVE;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "sync_every_minutes", nullable = false)
    private Integer syncEveryMinutes = 60;

    @Column(name = "keywords", columnDefinition = "text")
    private String keywords;

    @Column(name = "client_scope", length = 160)
    private String clientScope;

    @Column(name = "last_sync_at")
    private Instant lastSyncAt;

    @Column(name = "new_openings", nullable = false)
    private Integer newOpenings = 0;

    @Column(name = "openings_delta_pct", precision = 7, scale = 2)
    private BigDecimal openingsDeltaPct;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getSourceLabel() { return sourceLabel; }
    public void setSourceLabel(String sourceLabel) { this.sourceLabel = sourceLabel; }
    public String getSubtitle() { return subtitle; }
    public void setSubtitle(String subtitle) { this.subtitle = subtitle; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Integer getSyncEveryMinutes() { return syncEveryMinutes; }
    public void setSyncEveryMinutes(Integer syncEveryMinutes) { this.syncEveryMinutes = syncEveryMinutes; }
    public String getKeywords() { return keywords; }
    public void setKeywords(String keywords) { this.keywords = keywords; }
    public String getClientScope() { return clientScope; }
    public void setClientScope(String clientScope) { this.clientScope = clientScope; }
    public Instant getLastSyncAt() { return lastSyncAt; }
    public void setLastSyncAt(Instant lastSyncAt) { this.lastSyncAt = lastSyncAt; }
    public Integer getNewOpenings() { return newOpenings; }
    public void setNewOpenings(Integer newOpenings) { this.newOpenings = newOpenings; }
    public BigDecimal getOpeningsDeltaPct() { return openingsDeltaPct; }
    public void setOpeningsDeltaPct(BigDecimal openingsDeltaPct) { this.openingsDeltaPct = openingsDeltaPct; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
