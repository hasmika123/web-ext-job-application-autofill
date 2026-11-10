package com.dossier.api.domain.ent.ops;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** An export record (Exports tab): metadata only, no file bytes; READY until expires_at (24 h), then EXPIRED. Table {@code report_export}; see docs/enterprise-v2/ops-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "report_export")
public class ReportExport implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "definition_id", nullable = false)
    private Long definitionId;

    @Column(name = "run_id")
    private Long runId;

    @Column(name = "format", length = 10, nullable = false)
    private String format;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "READY";

    @Column(name = "requested_by_member_id")
    private Long requestedByMemberId;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "file_name", length = 160)
    private String fileName;

    @Column(name = "size_kb")
    private Integer sizeKb;

    @Column(name = "expires_at")
    private Instant expiresAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getDefinitionId() { return definitionId; }
    public void setDefinitionId(Long definitionId) { this.definitionId = definitionId; }
    public Long getRunId() { return runId; }
    public void setRunId(Long runId) { this.runId = runId; }
    public String getFormat() { return format; }
    public void setFormat(String format) { this.format = format; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getRequestedByMemberId() { return requestedByMemberId; }
    public void setRequestedByMemberId(Long requestedByMemberId) { this.requestedByMemberId = requestedByMemberId; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public Integer getSizeKb() { return sizeKb; }
    public void setSizeKb(Integer sizeKb) { this.sizeKb = sizeKb; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
