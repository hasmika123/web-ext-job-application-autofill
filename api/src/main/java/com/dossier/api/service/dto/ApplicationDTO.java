package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.fasterxml.jackson.annotation.JsonInclude;
import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.Objects;

/**
 * A DTO for the {@link com.dossier.api.domain.Application} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ApplicationDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(max = 200)
    private String company;

    @NotNull
    @Size(max = 200)
    private String roleTitle;

    @Size(max = 1000)
    private String jobUrl;

    @Size(max = 200)
    private String location;

    private JobType jobType;

    private JobMode jobMode;

    @Size(max = 254)
    private String email;

    @Size(max = 100)
    private String salary;

    private Boolean starred;

    private Boolean archived;

    @Size(max = 200)
    private String externalJobId;

    private Boolean submissionConfirmed;

    @Size(max = 100)
    private String atsPlatform;

    @Lob
    private String jobDescription;

    @NotNull
    private ApplicationStatus status;

    @Size(max = 100)
    private String source;

    private Instant appliedAt;

    @NotNull
    private Instant createdAt;

    @NotNull
    private Instant updatedAt;

    private UserDTO user;

    private ResumeDTO resume;

    // Filename of the one-off PDF attached to this application (the file actually submitted),
    // when "just attach the file" was used instead of a library resume. Null = no attachment.
    @Size(max = 255)
    private String attachmentFilename;

    // ---- Tracker memory (APP-E2E U6.1/U6.2). All additive; the extension neither sends nor needs them,
    // and the derived ones are only filled by the v2 list / detail / patch endpoints (NON_NULL keeps the
    // legacy payload exactly as it was when they are not).

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Instant lastEventAt;

    @Size(max = 160)
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String nextAction;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Instant nextActionAt;

    /** ACCEPTED or DECLINED once an offer is resolved. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private String outcome;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Instant acceptedAt;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Long postingId;

    /** What happens next, derived: the soonest interview, "Review offer", or the user's own next action. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private NextStep nextStep;

    /** Derived, never stored: applied or in review with no event for the configured number of days. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Boolean ghosted;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Integer interviewsCount;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Integer notesCount;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private Integer mailCount;

    /** Who added this application, and who changed it last (docs/change-audit/README.md); resolved by the tracker's list and detail reads, never client-set. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    private ChangeActorDTO createdBy;

    @JsonInclude(JsonInclude.Include.NON_NULL)
    private ChangeActorDTO updatedBy;

    /** {@code label} is plain words ("Video interview"); {@code at} is when, when there is a date. */
    public record NextStep(String label, Instant at) implements Serializable {}

    public Instant getLastEventAt() {
        return lastEventAt;
    }

    public void setLastEventAt(Instant lastEventAt) {
        this.lastEventAt = lastEventAt;
    }

    public String getNextAction() {
        return nextAction;
    }

    public void setNextAction(String nextAction) {
        this.nextAction = nextAction;
    }

    public Instant getNextActionAt() {
        return nextActionAt;
    }

    public void setNextActionAt(Instant nextActionAt) {
        this.nextActionAt = nextActionAt;
    }

    public String getOutcome() {
        return outcome;
    }

    public void setOutcome(String outcome) {
        this.outcome = outcome;
    }

    public Instant getAcceptedAt() {
        return acceptedAt;
    }

    public void setAcceptedAt(Instant acceptedAt) {
        this.acceptedAt = acceptedAt;
    }

    public Long getPostingId() {
        return postingId;
    }

    public void setPostingId(Long postingId) {
        this.postingId = postingId;
    }

    public NextStep getNextStep() {
        return nextStep;
    }

    public void setNextStep(NextStep nextStep) {
        this.nextStep = nextStep;
    }

    public ChangeActorDTO getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(ChangeActorDTO createdBy) {
        this.createdBy = createdBy;
    }

    public ChangeActorDTO getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(ChangeActorDTO updatedBy) {
        this.updatedBy = updatedBy;
    }

    public Boolean getGhosted() {
        return ghosted;
    }

    public void setGhosted(Boolean ghosted) {
        this.ghosted = ghosted;
    }

    public Integer getInterviewsCount() {
        return interviewsCount;
    }

    public void setInterviewsCount(Integer interviewsCount) {
        this.interviewsCount = interviewsCount;
    }

    public Integer getNotesCount() {
        return notesCount;
    }

    public void setNotesCount(Integer notesCount) {
        this.notesCount = notesCount;
    }

    public Integer getMailCount() {
        return mailCount;
    }

    public void setMailCount(Integer mailCount) {
        this.mailCount = mailCount;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCompany() {
        return company;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getRoleTitle() {
        return roleTitle;
    }

    public void setRoleTitle(String roleTitle) {
        this.roleTitle = roleTitle;
    }

    public String getJobUrl() {
        return jobUrl;
    }

    public void setJobUrl(String jobUrl) {
        this.jobUrl = jobUrl;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public JobType getJobType() {
        return jobType;
    }

    public void setJobType(JobType jobType) {
        this.jobType = jobType;
    }

    public JobMode getJobMode() {
        return jobMode;
    }

    public void setJobMode(JobMode jobMode) {
        this.jobMode = jobMode;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getSalary() {
        return salary;
    }

    public void setSalary(String salary) {
        this.salary = salary;
    }

    public Boolean getStarred() {
        return starred;
    }

    public void setStarred(Boolean starred) {
        this.starred = starred;
    }

    public Boolean getArchived() {
        return archived;
    }

    public void setArchived(Boolean archived) {
        this.archived = archived;
    }

    public String getExternalJobId() {
        return externalJobId;
    }

    public void setExternalJobId(String externalJobId) {
        this.externalJobId = externalJobId;
    }

    public Boolean getSubmissionConfirmed() {
        return submissionConfirmed;
    }

    public void setSubmissionConfirmed(Boolean submissionConfirmed) {
        this.submissionConfirmed = submissionConfirmed;
    }

    public String getAtsPlatform() {
        return atsPlatform;
    }

    public void setAtsPlatform(String atsPlatform) {
        this.atsPlatform = atsPlatform;
    }

    public String getJobDescription() {
        return jobDescription;
    }

    public void setJobDescription(String jobDescription) {
        this.jobDescription = jobDescription;
    }

    public ApplicationStatus getStatus() {
        return status;
    }

    public void setStatus(ApplicationStatus status) {
        this.status = status;
    }

    public String getSource() {
        return source;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getAppliedAt() {
        return appliedAt;
    }

    public void setAppliedAt(Instant appliedAt) {
        this.appliedAt = appliedAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public UserDTO getUser() {
        return user;
    }

    public void setUser(UserDTO user) {
        this.user = user;
    }

    public ResumeDTO getResume() {
        return resume;
    }

    public void setResume(ResumeDTO resume) {
        this.resume = resume;
    }

    public String getAttachmentFilename() {
        return attachmentFilename;
    }

    public void setAttachmentFilename(String attachmentFilename) {
        this.attachmentFilename = attachmentFilename;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ApplicationDTO)) {
            return false;
        }

        ApplicationDTO applicationDTO = (ApplicationDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, applicationDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "ApplicationDTO{" +
            "id=" + getId() +
            ", company='" + getCompany() + "'" +
            ", roleTitle='" + getRoleTitle() + "'" +
            ", jobUrl='" + getJobUrl() + "'" +
            ", location='" + getLocation() + "'" +
            ", jobType='" + getJobType() + "'" +
            ", jobMode='" + getJobMode() + "'" +
            ", email='" + getEmail() + "'" +
            ", salary='" + getSalary() + "'" +
            ", starred='" + getStarred() + "'" +
            ", archived='" + getArchived() + "'" +
            ", externalJobId='" + getExternalJobId() + "'" +
            ", submissionConfirmed='" + getSubmissionConfirmed() + "'" +
            ", atsPlatform='" + getAtsPlatform() + "'" +
            ", jobDescription='" + getJobDescription() + "'" +
            ", status='" + getStatus() + "'" +
            ", source='" + getSource() + "'" +
            ", appliedAt='" + getAppliedAt() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", updatedAt='" + getUpdatedAt() + "'" +
            ", user=" + getUser() +
            ", resume=" + getResume() +
            ", attachmentFilename='" + getAttachmentFilename() + "'" +
            "}";
    }
}
