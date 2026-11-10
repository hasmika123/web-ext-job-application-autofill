package com.dossier.api.domain.ent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/** One published snapshot of an organization's branding (append-only: a version is never edited or deleted). */
@Entity
@Table(name = "org_branding_version")
public class OrgBrandingVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    @Column(name = "snapshot_json", columnDefinition = "json", nullable = false)
    private String snapshotJson;

    @Column(name = "published_at", nullable = false)
    private Instant publishedAt = Instant.now();

    @Column(name = "published_by_member_id")
    private Long publishedByMemberId;

    public Long getId() { return id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public int getVersionNo() { return versionNo; }
    public void setVersionNo(int versionNo) { this.versionNo = versionNo; }
    public String getSnapshotJson() { return snapshotJson; }
    public void setSnapshotJson(String snapshotJson) { this.snapshotJson = snapshotJson; }
    public Instant getPublishedAt() { return publishedAt; }
    public void setPublishedAt(Instant publishedAt) { this.publishedAt = publishedAt; }
    public Long getPublishedByMemberId() { return publishedByMemberId; }
    public void setPublishedByMemberId(Long publishedByMemberId) { this.publishedByMemberId = publishedByMemberId; }
}
