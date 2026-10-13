package com.dossier.api.domain.ent.mkt;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** An alert or warning about a stream (Stream Alerts &amp; Warnings card). Open while {@code resolvedAt} is null. Table {@code mkt_stream_alert}. */
@Entity
@Table(name = "mkt_stream_alert")
public class MktStreamAlert implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ERROR = "ERROR";
    public static final String WARNING = "WARNING";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "stream_id")
    private Long streamId;

    @Column(name = "severity", length = 10, nullable = false)
    private String severity = WARNING;

    @Column(name = "title", length = 200, nullable = false)
    private String title;

    @Column(name = "detail", length = 400)
    private String detail;

    @Column(name = "raised_at", nullable = false)
    private Instant raisedAt = Instant.now();

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getStreamId() { return streamId; }
    public void setStreamId(Long streamId) { this.streamId = streamId; }
    public String getSeverity() { return severity; }
    public void setSeverity(String severity) { this.severity = severity; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getDetail() { return detail; }
    public void setDetail(String detail) { this.detail = detail; }
    public Instant getRaisedAt() { return raisedAt; }
    public void setRaisedAt(Instant raisedAt) { this.raisedAt = raisedAt; }
    public Instant getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(Instant resolvedAt) { this.resolvedAt = resolvedAt; }
}
