package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ApplicationStatus;
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
