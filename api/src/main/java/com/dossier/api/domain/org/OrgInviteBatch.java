package com.dossier.api.domain.org;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One CSV, paste or link import (tenant-model.md section 2.4), so admins can see "38 of 60 joined". Invalid rows
 * are returned in the response and never stored.
 */
@Entity
@Table(name = "org_invite_batch")
public class OrgInviteBatch implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String SOURCE_CSV = "CSV";
    public static final String SOURCE_PASTE = "PASTE";
    public static final String SOURCE_LINK = "LINK";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "source", length = 20, nullable = false)
    private String source;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "row_count", nullable = false)
    private int rowCount;

    @Column(name = "invalid_count", nullable = false)
    private int invalidCount;

    @Column(name = "accepted_count", nullable = false)
    private int acceptedCount;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }
    public int getRowCount() { return rowCount; }
    public void setRowCount(int rowCount) { this.rowCount = rowCount; }
    public int getInvalidCount() { return invalidCount; }
    public void setInvalidCount(int invalidCount) { this.invalidCount = invalidCount; }
    public int getAcceptedCount() { return acceptedCount; }
    public void setAcceptedCount(int acceptedCount) { this.acceptedCount = acceptedCount; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
