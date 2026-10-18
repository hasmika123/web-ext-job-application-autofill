package com.dossier.api.domain.ent.talent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;
import java.time.LocalDate;

/** A consultant application to a client job (32, candidate_submission precursor); the Applications board. Table {@code talent_application}; see docs/enterprise-v2/talent-foundation.md. Every query goes through an org-scoped repository method. */
@Entity
@Table(name = "talent_application")
public class TalentApplication implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "org_id", nullable = false)
    private Long orgId;

    @Column(name = "code", length = 30, nullable = false)
    private String code;

    @Column(name = "requirement_id", nullable = false)
    private Long requirementId;

    @Column(name = "consultant_id", nullable = false)
    private Long consultantId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "resume_id")
    private Long resumeId;

    @Column(name = "marketer_member_id")
    private Long marketerMemberId;

    @Column(name = "stage", length = 20, nullable = false)
    private String stage = "ASSIGNED";

    @Column(name = "closed_reason", length = 20)
    private String closedReason;

    @Column(name = "applied_on", nullable = false)
    private LocalDate appliedOn;

    @Column(name = "source_label", length = 40)
    private String sourceLabel;

    @Column(name = "next_action", length = 120)
    private String nextAction;

    @Column(name = "next_action_due")
    private LocalDate nextActionDue;

    @Column(name = "stage_changed_at", nullable = false)
    private Instant stageChangedAt = Instant.now();

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    // Change audit (docs/change-audit/README.md section 2.2): the seat that made / last wrote this row. No foreign key: a row outlives an erased seat.
    @Column(name = "created_by_member_id")
    private Long createdByMemberId;

    @Column(name = "updated_by_member_id")
    private Long updatedByMemberId;

    @Column(name = "personal_application_id")
    private Long personalApplicationId;

    @Column(name = "entry_path", length = 20, nullable = false)
    private String entryPath = "MARKETER";

    @Column(name = "stage_source", length = 12, nullable = false)
    private String stageSource = "MARKETER";

    @Version
    @Column(name = "version", nullable = false)
    private long version;


    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getOrgId() { return orgId; }
    public void setOrgId(Long orgId) { this.orgId = orgId; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public Long getRequirementId() { return requirementId; }
    public void setRequirementId(Long requirementId) { this.requirementId = requirementId; }
    public Long getConsultantId() { return consultantId; }
    public void setConsultantId(Long consultantId) { this.consultantId = consultantId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Long getResumeId() { return resumeId; }
    public void setResumeId(Long resumeId) { this.resumeId = resumeId; }
    public Long getMarketerMemberId() { return marketerMemberId; }
    public void setMarketerMemberId(Long marketerMemberId) { this.marketerMemberId = marketerMemberId; }
    public String getStage() { return stage; }
    public void setStage(String stage) { this.stage = stage; }
    public String getClosedReason() { return closedReason; }
    public void setClosedReason(String closedReason) { this.closedReason = closedReason; }
    public LocalDate getAppliedOn() { return appliedOn; }
    public void setAppliedOn(LocalDate appliedOn) { this.appliedOn = appliedOn; }
    public String getSourceLabel() { return sourceLabel; }
    public void setSourceLabel(String sourceLabel) { this.sourceLabel = sourceLabel; }
    public String getNextAction() { return nextAction; }
    public void setNextAction(String nextAction) { this.nextAction = nextAction; }
    public LocalDate getNextActionDue() { return nextActionDue; }
    public void setNextActionDue(LocalDate nextActionDue) { this.nextActionDue = nextActionDue; }
    public Instant getStageChangedAt() { return stageChangedAt; }
    public void setStageChangedAt(Instant stageChangedAt) { this.stageChangedAt = stageChangedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
    public Long getCreatedByMemberId() { return createdByMemberId; }
    public void setCreatedByMemberId(Long createdByMemberId) { this.createdByMemberId = createdByMemberId; }
    public Long getUpdatedByMemberId() { return updatedByMemberId; }
    public void setUpdatedByMemberId(Long updatedByMemberId) { this.updatedByMemberId = updatedByMemberId; }
    public Long getPersonalApplicationId() { return personalApplicationId; }
    public void setPersonalApplicationId(Long personalApplicationId) { this.personalApplicationId = personalApplicationId; }
    public String getEntryPath() { return entryPath; }
    public void setEntryPath(String entryPath) { this.entryPath = entryPath; }
    public String getStageSource() { return stageSource; }
    public void setStageSource(String stageSource) { this.stageSource = stageSource; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }
}
