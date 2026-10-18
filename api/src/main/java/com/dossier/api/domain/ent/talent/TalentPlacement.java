package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A consultant placed at a client (35 precursor). Rates are records, never money movement. Table {@code talent_placement}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_placement")
public class TalentPlacement implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "requirement_id")
    private Long requirementId;

    @Column(name = "role_title", length = 120, nullable = false)
    private String roleTitle;

    @Column(name = "status", length = 20, nullable = false)
    private String status = "ACTIVE";

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @Column(name = "bill_rate_minor")
    private Long billRateMinor;

    @Column(name = "rate_unit", length = 10)
    private String rateUnit;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "placement_type", length = 20, nullable = false)
    private String placementType = "CONTRACT";

    @Column(name = "account_manager_member_id")
    private Long accountManagerMemberId;

    @Column(name = "client_contact_id")
    private Long clientContactId;

    @Column(name = "redeployment_pool", nullable = false)
    private boolean redeploymentPool;

    @Column(name = "redeployment_date")
    private LocalDate redeploymentDate;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public String getRoleTitle() { return roleTitle; }
    public void setRoleTitle(String roleTitle) { this.roleTitle = roleTitle; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public Long getBillRateMinor() { return billRateMinor; }
    public void setBillRateMinor(Long billRateMinor) { this.billRateMinor = billRateMinor; }
    public String getRateUnit() { return rateUnit; }
    public void setRateUnit(String rateUnit) { this.rateUnit = rateUnit; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public String getPlacementType() { return placementType; }
    public void setPlacementType(String placementType) { this.placementType = placementType; }
    public Long getAccountManagerMemberId() { return accountManagerMemberId; }
    public void setAccountManagerMemberId(Long accountManagerMemberId) { this.accountManagerMemberId = accountManagerMemberId; }
    public Long getClientContactId() { return clientContactId; }
    public void setClientContactId(Long clientContactId) { this.clientContactId = clientContactId; }
    public boolean isRedeploymentPool() { return redeploymentPool; }
    public void setRedeploymentPool(boolean redeploymentPool) { this.redeploymentPool = redeploymentPool; }
    public LocalDate getRedeploymentDate() { return redeploymentDate; }
    public void setRedeploymentDate(LocalDate redeploymentDate) { this.redeploymentDate = redeploymentDate; }
    public Instant getCompletedAt() { return completedAt; }
    public void setCompletedAt(Instant completedAt) { this.completedAt = completedAt; }

    /** How an ENDED placement ended: a normal completion (null counts as this) or a termination with a reason. */
    public static final String END_COMPLETED = "COMPLETED";
    public static final String END_TERMINATED = "TERMINATED";

    @Column(name = "end_kind", length = 12)
    private String endKind;
    @Column(name = "end_reason", length = 300)
    private String endReason;
    /** The day notice was given; set while the placement is ENDING (still working until the end date). */
    @Column(name = "notice_on")
    private LocalDate noticeOn;
    /** The offer this placement came from (cws_offer), when it was created by an accepted offer. */
    @Column(name = "offer_id")
    private Long offerId;

    public String getEndKind() { return endKind; }
    public void setEndKind(String endKind) { this.endKind = endKind; }
    public String getEndReason() { return endReason; }
    public void setEndReason(String endReason) { this.endReason = endReason; }
    public LocalDate getNoticeOn() { return noticeOn; }
    public void setNoticeOn(LocalDate noticeOn) { this.noticeOn = noticeOn; }
    public Long getOfferId() { return offerId; }
    public void setOfferId(Long offerId) { this.offerId = offerId; }
}
