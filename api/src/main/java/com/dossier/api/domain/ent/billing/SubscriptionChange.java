package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** Recent Subscription Changes log (ADDED / UPDATED / REMOVED, who). Table {@code subscription_change}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "subscription_change")
public class SubscriptionChange implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "kind", length = 12, nullable = false)
    private String kind;

    @Column(name = "summary", length = 200, nullable = false)
    private String summary;

    @Column(name = "licenses_delta", nullable = false)
    private Integer licensesDelta = 0;

    @Column(name = "licenses_total_after")
    private Integer licensesTotalAfter;

    @Column(name = "actor_member_id")
    private Long actorMemberId;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
    public Integer getLicensesDelta() { return licensesDelta; }
    public void setLicensesDelta(Integer licensesDelta) { this.licensesDelta = licensesDelta; }
    public Integer getLicensesTotalAfter() { return licensesTotalAfter; }
    public void setLicensesTotalAfter(Integer licensesTotalAfter) { this.licensesTotalAfter = licensesTotalAfter; }
    public Long getActorMemberId() { return actorMemberId; }
    public void setActorMemberId(Long actorMemberId) { this.actorMemberId = actorMemberId; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
