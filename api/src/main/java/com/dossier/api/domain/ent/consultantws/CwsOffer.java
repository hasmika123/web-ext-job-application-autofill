package com.dossier.api.domain.ent.consultantws;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/**
 * A job offer made to one consultant (table {@code cws_offer}). The package is RECORD-ONLY text and minor-unit numbers: nothing here moves
 * money and there is no bank or tax column. The offer itself originates on the employer / marketer side (demo-seeded stand-ins while that side
 * is not built, {@code sampleData}); the consultant's own response (accept, decline, negotiate) is real.
 */
@Entity
@Table(name = "cws_offer")
public class CwsOffer implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String PENDING_REVIEW = "PENDING_REVIEW";
    public static final String NEGOTIATION = "NEGOTIATION";
    public static final String ACCEPTED = "ACCEPTED";
    public static final String DECLINED = "DECLINED";
    public static final String EXPIRED = "EXPIRED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "requirement_id")
    private Long requirementId;

    @Column(name = "application_id")
    private Long applicationId;

    @Column(name = "client_name", length = 160, nullable = false)
    private String clientName;

    @Column(name = "role_title", length = 200, nullable = false)
    private String roleTitle;

    @Column(name = "package_summary", length = 300)
    private String packageSummary;

    @Column(name = "benefits_summary", length = 500)
    private String benefitsSummary;

    @Column(name = "base_salary_minor")
    private Long baseSalaryMinor;

    @Column(name = "total_comp_minor")
    private Long totalCompMinor;

    @Column(name = "currency", length = 3, nullable = false)
    private String currency = "USD";

    @Column(name = "work_mode", length = 10)
    private String workMode;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "offer_deadline")
    private LocalDate offerDeadline;

    @Column(name = "status", length = 20, nullable = false)
    private String status = PENDING_REVIEW;

    @Column(name = "responded_at")
    private Instant respondedAt;

    @Column(name = "response_note", length = 300)
    private String responseNote;

    @Column(name = "sample_data", nullable = false)
    private boolean sampleData = false;

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
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public Long getApplicationId() { return applicationId; }
    public void setApplicationId(Long applicationId) { this.applicationId = applicationId; }
    public String getClientName() { return clientName; }
    public void setClientName(String clientName) { this.clientName = clientName; }
    public String getRoleTitle() { return roleTitle; }
    public void setRoleTitle(String roleTitle) { this.roleTitle = roleTitle; }
    public String getPackageSummary() { return packageSummary; }
    public void setPackageSummary(String packageSummary) { this.packageSummary = packageSummary; }
    public String getBenefitsSummary() { return benefitsSummary; }
    public void setBenefitsSummary(String benefitsSummary) { this.benefitsSummary = benefitsSummary; }
    public Long getBaseSalaryMinor() { return baseSalaryMinor; }
    public void setBaseSalaryMinor(Long baseSalaryMinor) { this.baseSalaryMinor = baseSalaryMinor; }
    public Long getTotalCompMinor() { return totalCompMinor; }
    public void setTotalCompMinor(Long totalCompMinor) { this.totalCompMinor = totalCompMinor; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getWorkMode() { return workMode; }
    public void setWorkMode(String workMode) { this.workMode = workMode; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate startDate) { this.startDate = startDate; }
    public LocalDate getOfferDeadline() { return offerDeadline; }
    public void setOfferDeadline(LocalDate offerDeadline) { this.offerDeadline = offerDeadline; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getRespondedAt() { return respondedAt; }
    public void setRespondedAt(Instant respondedAt) { this.respondedAt = respondedAt; }
    public String getResponseNote() { return responseNote; }
    public void setResponseNote(String responseNote) { this.responseNote = responseNote; }
    public boolean isSampleData() { return sampleData; }
    public void setSampleData(boolean sampleData) { this.sampleData = sampleData; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }

    // ---- the org side (X9.8): a RECORD of the offer, never a signed document ----------------------------------------

    /** Recorded by the org, not yet shown to the consultant. */
    public static final String DRAFT = "DRAFT";
    /** The org recorded that the client extended the offer ("EXTENDED" on the org side); the stored value predates the org side and is kept. */
    public static final String EXTENDED = PENDING_REVIEW;
    public static final String WITHDRAWN = "WITHDRAWN";

    @Column(name = "client_id")
    private Long clientId;
    @Column(name = "submission_id")
    private Long submissionId;
    @Column(name = "placement_id")
    private Long placementId;
    @Column(name = "placement_type", length = 20)
    private String placementType;
    @Column(name = "rate_minor")
    private Long rateMinor;
    @Column(name = "rate_period", length = 10)
    private String ratePeriod;
    @Column(name = "end_date")
    private LocalDate endDate;
    @Column(name = "term_months")
    private Integer termMonths;
    @Column(name = "notes", length = 500)
    private String notes;
    @Column(name = "extended_at")
    private Instant extendedAt;
    @Column(name = "created_by_member_id")
    private Long createdByMemberId;
    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;
    /** Who made the last change: MEMBER (an org user), CONSULTANT (the person's own answer) or SYSTEM (a job). */
    @Column(name = "updated_by_kind", length = 12, nullable = false)
    private String updatedByKind = "MEMBER";

    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getSubmissionId() { return submissionId; }
    public void setSubmissionId(Long submissionId) { this.submissionId = submissionId; }
    public Long getPlacementId() { return placementId; }
    public void setPlacementId(Long placementId) { this.placementId = placementId; }
    public String getPlacementType() { return placementType; }
    public void setPlacementType(String placementType) { this.placementType = placementType; }
    public Long getRateMinor() { return rateMinor; }
    public void setRateMinor(Long rateMinor) { this.rateMinor = rateMinor; }
    public String getRatePeriod() { return ratePeriod; }
    public void setRatePeriod(String ratePeriod) { this.ratePeriod = ratePeriod; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate endDate) { this.endDate = endDate; }
    public Integer getTermMonths() { return termMonths; }
    public void setTermMonths(Integer termMonths) { this.termMonths = termMonths; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Instant getExtendedAt() { return extendedAt; }
    public void setExtendedAt(Instant extendedAt) { this.extendedAt = extendedAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public String getUpdatedByKind() { return updatedByKind; }
    public void setUpdatedByKind(String updatedByKind) { this.updatedByKind = updatedByKind; }
}
