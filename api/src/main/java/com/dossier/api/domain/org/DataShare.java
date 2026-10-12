package com.dossier.api.domain.org;

import com.dossier.api.domain.enumeration.ShareScope;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The CURRENT consent a member has given their organization (consent-data-sharing.md section 2): one row per seat.
 * Only the member changes it. {@code fullToMemberId} is the one person a FULL scope is shared with; it is null for
 * NONE and SUMMARY. Deleted on account erasure; the history lives on in the append-only {@link DataShareEvent}.
 */
@Entity
@Table(name = "data_share")
public class DataShare implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope", length = 10, nullable = false)
    private ShareScope scope = ShareScope.NONE;

    @Column(name = "full_to_member_id")
    private Long fullToMemberId;

    /** The consent text version the member saw when they last changed this, e.g. {@code org-share/v1}. */
    @Column(name = "consent_version", length = 20, nullable = false)
    private String consentVersion;

    @Column(name = "granted_at", nullable = false)
    private Instant grantedAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public ShareScope getScope() { return scope; }
    public void setScope(ShareScope scope) { this.scope = scope; }
    public Long getFullToMemberId() { return fullToMemberId; }
    public void setFullToMemberId(Long fullToMemberId) { this.fullToMemberId = fullToMemberId; }
    public String getConsentVersion() { return consentVersion; }
    public void setConsentVersion(String consentVersion) { this.consentVersion = consentVersion; }
    public Instant getGrantedAt() { return grantedAt; }
    public void setGrantedAt(Instant grantedAt) { this.grantedAt = grantedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
