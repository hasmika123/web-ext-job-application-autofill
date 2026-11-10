package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One sync run of a stream (Sync Activity card, Openings Captured chart, Sync Health). Table {@code mkt_stream_sync_log}; written by {@code MktStreamsService.recordSync}. */
@Entity
@Table(name = "mkt_stream_sync_log")
public class MktStreamSyncLog implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String OK = "OK";
    public static final String FAILED = "FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "stream_id", nullable = false)
    private Long streamId;

    @Column(name = "synced_at", nullable = false)
    private Instant syncedAt = Instant.now();

    @Column(name = "openings", nullable = false)
    private Integer openings = 0;

    @Column(name = "status", length = 10, nullable = false)
    private String status = OK;

    @Column(name = "message", length = 300)
    private String message;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getStreamId() { return streamId; }
    public void setStreamId(Long streamId) { this.streamId = streamId; }
    public Instant getSyncedAt() { return syncedAt; }
    public void setSyncedAt(Instant syncedAt) { this.syncedAt = syncedAt; }
    public Integer getOpenings() { return openings; }
    public void setOpenings(Integer openings) { this.openings = openings; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
}
