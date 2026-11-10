package com.dossier.api.domain.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * A personal comp/referral/service grant (docs/subscriptions/06-entitlements-and-enforcement.md section 7): "plan version X for this user until Y".
 * Narrowed on purpose: the sources are ADMIN_COMP, REFERRAL and SERVICE_ORDER only. A Stripe subscription or an organization assignment is never a
 * grant (the subscription row and the licenses are the truth); {@code GrantWriterGuard} refuses those sources. Only personal accounts hold grants.
 */
@Entity
@Table(name = "entitlement_grant")
public class EntitlementGrant implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String ADMIN_COMP = "ADMIN_COMP";
    public static final String REFERRAL = "REFERRAL";
    public static final String SERVICE_ORDER = "SERVICE_ORDER";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "plan_version_id", nullable = false)
    private Long planVersionId;

    @Column(name = "source", length = 20, nullable = false)
    private String source;

    @Column(name = "source_ref", length = 255)
    private String sourceRef;

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "granted_by", length = 50)
    private String grantedBy;

    @Column(name = "reason", length = 500)
    private String reason;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "revoked_by", length = 50)
    private String revokedBy;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getPlanVersionId() { return planVersionId; }
    public void setPlanVersionId(Long planVersionId) { this.planVersionId = planVersionId; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getSourceRef() { return sourceRef; }
    public void setSourceRef(String sourceRef) { this.sourceRef = sourceRef; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public String getGrantedBy() { return grantedBy; }
    public void setGrantedBy(String grantedBy) { this.grantedBy = grantedBy; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public String getRevokedBy() { return revokedBy; }
    public void setRevokedBy(String revokedBy) { this.revokedBy = revokedBy; }
}
