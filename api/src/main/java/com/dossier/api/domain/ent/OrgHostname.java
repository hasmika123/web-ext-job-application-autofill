package com.dossier.api.domain.ent;

import com.dossier.api.domain.enumeration.HostnameCertState;
import com.dossier.api.domain.enumeration.HostnameVerificationMethod;
import com.dossier.api.domain.enumeration.OrgHostnameKind;
import com.dossier.api.domain.enumeration.OrgHostnameStatus;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A hostname that reaches exactly one organization (ADR-003, 03-domain-model.md section 2.1): either a Kiwiply
 * subdomain ({@code acme.kiwiply.com}) or a customer's own domain ({@code careers.acme.com}). The name is stored in
 * canonical form ({@link HostNames}: lower-case, punycode, no port). Only an {@code ACTIVE} row resolves; the database
 * holds two rules the application cannot break: a name has at most one live (non-REMOVED) claim across all
 * organizations, and an organization has at most one live primary hostname (generated, unique-indexed columns).
 * No sensitive data lives here: the verification token proves DNS ownership and is useless once the row is VERIFIED.
 */
@Entity
@Table(name = "org_hostname")
public class OrgHostname implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "hostname", length = 253, nullable = false)
    private String hostname;

    @Enumerated(EnumType.STRING)
    @Column(name = "kind", length = 20, nullable = false)
    private OrgHostnameKind kind = OrgHostnameKind.CUSTOM;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", length = 20, nullable = false)
    private OrgHostnameStatus status = OrgHostnameStatus.PENDING;

    @Column(name = "is_primary", nullable = false)
    private boolean primary;

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_method", length = 20)
    private HostnameVerificationMethod verificationMethod;

    @Column(name = "verification_token", length = 32, columnDefinition = "char(32)")
    private String verificationToken;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "activated_at")
    private Instant activatedAt;

    @Column(name = "suspended_at")
    private Instant suspendedAt;

    @Column(name = "removed_at")
    private Instant removedAt;

    @Column(name = "last_check_at")
    private Instant lastCheckAt;

    @Column(name = "last_check_result", length = 200)
    private String lastCheckResult;

    @Enumerated(EnumType.STRING)
    @Column(name = "cert_state", length = 20, nullable = false)
    private HostnameCertState certState = HostnameCertState.NONE;

    /** Nullable: set to NULL if the member row ever goes away. */
    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PrePersist
    @PreUpdate
    void canonicalise() {
        String canonical = HostNames.normalise(hostname);
        if (canonical == null) throw new IllegalStateException("org_hostname.hostname is not a valid hostname");
        hostname = canonical;
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getHostname() { return hostname; }
    /** Stores the canonical form; a value that is not a single valid hostname is refused. */
    public void setHostname(String hostname) {
        String canonical = HostNames.normalise(hostname);
        if (canonical == null) throw new IllegalArgumentException("not a valid hostname");
        this.hostname = canonical;
    }
    public OrgHostnameKind getKind() { return kind; }
    public void setKind(OrgHostnameKind kind) { this.kind = kind; }
    public OrgHostnameStatus getStatus() { return status; }
    public void setStatus(OrgHostnameStatus status) { this.status = status; }
    public boolean isPrimary() { return primary; }
    public void setPrimary(boolean primary) { this.primary = primary; }
    public HostnameVerificationMethod getVerificationMethod() { return verificationMethod; }
    public void setVerificationMethod(HostnameVerificationMethod verificationMethod) { this.verificationMethod = verificationMethod; }
    public String getVerificationToken() { return verificationToken; }
    public void setVerificationToken(String verificationToken) { this.verificationToken = verificationToken; }
    public Instant getVerifiedAt() { return verifiedAt; }
    public void setVerifiedAt(Instant verifiedAt) { this.verifiedAt = verifiedAt; }
    public Instant getActivatedAt() { return activatedAt; }
    public void setActivatedAt(Instant activatedAt) { this.activatedAt = activatedAt; }
    public Instant getSuspendedAt() { return suspendedAt; }
    public void setSuspendedAt(Instant suspendedAt) { this.suspendedAt = suspendedAt; }
    public Instant getRemovedAt() { return removedAt; }
    public void setRemovedAt(Instant removedAt) { this.removedAt = removedAt; }
    public Instant getLastCheckAt() { return lastCheckAt; }
    public void setLastCheckAt(Instant lastCheckAt) { this.lastCheckAt = lastCheckAt; }
    public String getLastCheckResult() { return lastCheckResult; }
    public void setLastCheckResult(String lastCheckResult) { this.lastCheckResult = lastCheckResult; }
    public HostnameCertState getCertState() { return certState; }
    public void setCertState(HostnameCertState certState) { this.certState = certState; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
