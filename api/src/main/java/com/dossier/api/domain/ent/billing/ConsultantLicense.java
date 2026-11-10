package com.dossier.api.domain.ent.billing;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** One live license per consultant (generated key). Attached to consultant_profile because most consultants are not seats (deviation from 20 s2.1 which uses org_member). Table {@code consultant_license}; see docs/enterprise-v2/billing-data-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "consultant_license")
public class ConsultantLicense implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "member_id")
    private Long memberId;

    @Column(name = "status", length = 24, nullable = false)
    private String status;

    @Column(name = "base_product_id", nullable = false)
    private Long baseProductId;

    @Column(name = "contract_price_id")
    private Long contractPriceId;

    @Column(name = "base_amount_minor", nullable = false)
    private Long baseAmountMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "starts_at", nullable = false)
    private Instant startsAt;

    @Column(name = "renews_at")
    private Instant renewsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "paid_through_at")
    private Instant paidThroughAt;

    @Column(name = "suspended_at")
    private Instant suspendedAt;

    @Column(name = "suspend_reason", length = 200)
    private String suspendReason;

    @Column(name = "end_reason", length = 24)
    private String endReason;

    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Long getBaseProductId() { return baseProductId; }
    public void setBaseProductId(Long baseProductId) { this.baseProductId = baseProductId; }
    public Long getContractPriceId() { return contractPriceId; }
    public void setContractPriceId(Long contractPriceId) { this.contractPriceId = contractPriceId; }
    public Long getBaseAmountMinor() { return baseAmountMinor; }
    public void setBaseAmountMinor(Long baseAmountMinor) { this.baseAmountMinor = baseAmountMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getRenewsAt() { return renewsAt; }
    public void setRenewsAt(Instant renewsAt) { this.renewsAt = renewsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
    public Instant getPaidThroughAt() { return paidThroughAt; }
    public void setPaidThroughAt(Instant paidThroughAt) { this.paidThroughAt = paidThroughAt; }
    public Instant getSuspendedAt() { return suspendedAt; }
    public void setSuspendedAt(Instant suspendedAt) { this.suspendedAt = suspendedAt; }
    public String getSuspendReason() { return suspendReason; }
    public void setSuspendReason(String suspendReason) { this.suspendReason = suspendReason; }
    public String getEndReason() { return endReason; }
    public void setEndReason(String endReason) { this.endReason = endReason; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
