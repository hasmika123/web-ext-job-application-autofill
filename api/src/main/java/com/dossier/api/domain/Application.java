package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import org.hibernate.annotations.Cache;
import org.hibernate.annotations.CacheConcurrencyStrategy;

/**
 * A Application.
 */
@Entity
@Table(name = "application")
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@SuppressWarnings("common-java:DuplicatedBlocks")
public class Application implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @NotNull
    @Size(max = 200)
    @Column(name = "company", length = 200, nullable = false)
    private String company;

    @NotNull
    @Size(max = 200)
    @Column(name = "role_title", length = 200, nullable = false)
    private String roleTitle;

    @Size(max = 1000)
    @Column(name = "job_url", length = 1000)
    private String jobUrl;

    @Size(max = 100)
    @Column(name = "ats_platform", length = 100)
    private String atsPlatform;

    @Lob
    @Column(name = "job_description")
    private String jobDescription;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private ApplicationStatus status;

    @Size(max = 200)
    @Column(name = "location", length = 200)
    private String location;

    // Employment type (full-time/contract/…) — strictly-validated enum, stored as varchar.
    @Enumerated(EnumType.STRING)
    @Column(name = "job_type", length = 20)
    private JobType jobType;

    // Workplace mode (in-person/hybrid/remote) — strictly-validated enum, stored as varchar.
    @Enumerated(EnumType.STRING)
    @Column(name = "job_mode", length = 20)
    private JobMode jobMode;

    // The email supplied on this application. Defaults to the user's profile email on create.
    @Size(max = 254)
    @Column(name = "email", length = 254)
    private String email;

    // User-pinned favorite.
    @Column(name = "starred")
    private Boolean starred;

    // Soft-hidden from the active board (kept, not deleted).
    @Column(name = "archived")
    private Boolean archived;

    // ATS-native job id; with job_url this is the dedup key for the tracker.
    @Size(max = 200)
    @Column(name = "external_job_id", length = 200)
    private String externalJobId;

    // True only when the extension actually observed the submission confirmation.
    @Column(name = "submission_confirmed")
    private Boolean submissionConfirmed;

    @Size(max = 100)
    @Column(name = "source", length = 100)
    private String source;

    @Column(name = "applied_at")
    private Instant appliedAt;

    @NotNull
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @NotNull
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JsonIgnoreProperties(value = { "user" }, allowSetters = true)
    private Resume resume;

    // A one-off resume PDF attached to THIS application only (the file actually submitted),
    // separate from the resume library. "Just attach the file" stores it here, not as a Resume.
    @Size(max = 500)
    @Column(name = "attachment_object_key", length = 500)
    private String attachmentObjectKey;

    @Size(max = 255)
    @Column(name = "attachment_filename", length = 255)
    private String attachmentFilename;

    // jhipster-needle-entity-add-field - JHipster will add fields here

    public Long getId() {
        return this.id;
    }

    public Application id(Long id) {
        this.setId(id);
        return this;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getCompany() {
        return this.company;
    }

    public Application company(String company) {
        this.setCompany(company);
        return this;
    }

    public void setCompany(String company) {
        this.company = company;
    }

    public String getRoleTitle() {
        return this.roleTitle;
    }

    public Application roleTitle(String roleTitle) {
        this.setRoleTitle(roleTitle);
        return this;
    }

    public void setRoleTitle(String roleTitle) {
        this.roleTitle = roleTitle;
    }

    public String getJobUrl() {
        return this.jobUrl;
    }

    public Application jobUrl(String jobUrl) {
        this.setJobUrl(jobUrl);
        return this;
    }

    public void setJobUrl(String jobUrl) {
        this.jobUrl = jobUrl;
    }

    public String getAtsPlatform() {
        return this.atsPlatform;
    }

    public Application atsPlatform(String atsPlatform) {
        this.setAtsPlatform(atsPlatform);
        return this;
    }

    public void setAtsPlatform(String atsPlatform) {
        this.atsPlatform = atsPlatform;
    }

    public String getJobDescription() {
        return this.jobDescription;
    }

    public Application jobDescription(String jobDescription) {
        this.setJobDescription(jobDescription);
        return this;
    }

    public void setJobDescription(String jobDescription) {
        this.jobDescription = jobDescription;
    }

    public ApplicationStatus getStatus() {
        return this.status;
    }

    public Application status(ApplicationStatus status) {
        this.setStatus(status);
        return this;
    }

    public void setStatus(ApplicationStatus status) {
        this.status = status;
    }

    public String getLocation() {
        return this.location;
    }

    public Application location(String location) {
        this.setLocation(location);
        return this;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public JobType getJobType() {
        return this.jobType;
    }

    public Application jobType(JobType jobType) {
        this.setJobType(jobType);
        return this;
    }

    public void setJobType(JobType jobType) {
        this.jobType = jobType;
    }

    public JobMode getJobMode() {
        return this.jobMode;
    }

    public Application jobMode(JobMode jobMode) {
        this.setJobMode(jobMode);
        return this;
    }

    public void setJobMode(JobMode jobMode) {
        this.jobMode = jobMode;
    }

    public String getEmail() {
        return this.email;
    }

    public Application email(String email) {
        this.setEmail(email);
        return this;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public Boolean getStarred() {
        return this.starred;
    }

    public Application starred(Boolean starred) {
        this.setStarred(starred);
        return this;
    }

    public void setStarred(Boolean starred) {
        this.starred = starred;
    }

    public Boolean getArchived() {
        return this.archived;
    }

    public Application archived(Boolean archived) {
        this.setArchived(archived);
        return this;
    }

    public void setArchived(Boolean archived) {
        this.archived = archived;
    }

    public String getExternalJobId() {
        return this.externalJobId;
    }

    public Application externalJobId(String externalJobId) {
        this.setExternalJobId(externalJobId);
        return this;
    }

    public void setExternalJobId(String externalJobId) {
        this.externalJobId = externalJobId;
    }

    public Boolean getSubmissionConfirmed() {
        return this.submissionConfirmed;
    }

    public Application submissionConfirmed(Boolean submissionConfirmed) {
        this.setSubmissionConfirmed(submissionConfirmed);
        return this;
    }

    public void setSubmissionConfirmed(Boolean submissionConfirmed) {
        this.submissionConfirmed = submissionConfirmed;
    }

    public String getSource() {
        return this.source;
    }

    public Application source(String source) {
        this.setSource(source);
        return this;
    }

    public void setSource(String source) {
        this.source = source;
    }

    public Instant getAppliedAt() {
        return this.appliedAt;
    }

    public Application appliedAt(Instant appliedAt) {
        this.setAppliedAt(appliedAt);
        return this;
    }

    public void setAppliedAt(Instant appliedAt) {
        this.appliedAt = appliedAt;
    }

    public Instant getCreatedAt() {
        return this.createdAt;
    }

    public Application createdAt(Instant createdAt) {
        this.setCreatedAt(createdAt);
        return this;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return this.updatedAt;
    }

    public Application updatedAt(Instant updatedAt) {
        this.setUpdatedAt(updatedAt);
        return this;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    public User getUser() {
        return this.user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public Application user(User user) {
        this.setUser(user);
        return this;
    }

    public Resume getResume() {
        return this.resume;
    }

    public void setResume(Resume resume) {
        this.resume = resume;
    }

    public Application resume(Resume resume) {
        this.setResume(resume);
        return this;
    }

    public String getAttachmentObjectKey() {
        return this.attachmentObjectKey;
    }

    public void setAttachmentObjectKey(String attachmentObjectKey) {
        this.attachmentObjectKey = attachmentObjectKey;
    }

    public String getAttachmentFilename() {
        return this.attachmentFilename;
    }

    public void setAttachmentFilename(String attachmentFilename) {
        this.attachmentFilename = attachmentFilename;
    }

    // jhipster-needle-entity-add-getters-setters - JHipster will add getters and setters here

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof Application)) {
            return false;
        }
        return getId() != null && getId().equals(((Application) o).getId());
    }

    @Override
    public int hashCode() {
        // see https://vladmihalcea.com/how-to-implement-equals-and-hashcode-using-the-jpa-entity-identifier/
        return getClass().hashCode();
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "Application{" +
            "id=" + getId() +
            ", company='" + getCompany() + "'" +
            ", roleTitle='" + getRoleTitle() + "'" +
            ", jobUrl='" + getJobUrl() + "'" +
            ", location='" + getLocation() + "'" +
            ", jobType='" + getJobType() + "'" +
            ", jobMode='" + getJobMode() + "'" +
            ", email='" + getEmail() + "'" +
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
            "}";
    }
}
