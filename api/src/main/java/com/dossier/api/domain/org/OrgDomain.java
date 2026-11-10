package com.dossier.api.domain.org;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A verified email domain (tenant-model.md section 2.6) that powers domain auto-join for universities. A domain
 * belongs to one organization. SSO (Phase 8.1) will hang off this table; nothing SSO-related exists yet.
 */
@Entity
@Table(name = "org_domain")
public class OrgDomain implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "domain", length = 253, nullable = false, unique = true)
    private String domain;

    @Column(name = "verification_token", length = 32, columnDefinition = "char(32)", nullable = false)
    private String verificationToken;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "auto_join", nullable = false)
    private boolean autoJoin = false;

    @Column(name = "auto_join_group_id")
    private Long autoJoinGroupId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getDomain() { return domain; }
    public void setDomain(String domain) { this.domain = domain; }
    public String getVerificationToken() { return verificationToken; }
    public void setVerificationToken(String verificationToken) { this.verificationToken = verificationToken; }
    public Instant getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(Instant verifiedAt) { this.verifiedAt = verifiedAt; }
    public boolean isAutoJoin() { return autoJoin; }
    public void setAutoJoin(boolean autoJoin) { this.autoJoin = autoJoin; }
    public Long getAutoJoinGroupId() { return autoJoinGroupId; }
    public void setAutoJoinGroupId(Long autoJoinGroupId) { this.autoJoinGroupId = autoJoinGroupId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
