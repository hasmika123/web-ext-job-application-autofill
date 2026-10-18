package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ResumeKind;
import com.dossier.api.domain.enumeration.ResumeRole;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * A DTO for the {@link com.dossier.api.domain.Resume} entity.
 */
@SuppressWarnings("common-java:DuplicatedBlocks")
public class ResumeDTO implements Serializable {

    private Long id;

    @NotNull
    @Size(max = 200)
    private String label;

    @NotNull
    @Size(max = 500)
    private String r2ObjectKey;

    @Lob
    private String parsedJson;

    @NotNull
    private ResumeStatus status;

    @NotNull
    private Instant createdAt;

    private Boolean archived;

    private Boolean starred;

    private Boolean defaultResume;

    // Resume Builder (R0.1): optional, so existing clients that never send them are unaffected.
    // ProfileVersion does not hash either field. templateId is only known for BUILT resumes.
    private ResumeKind kind;

    private String templateId;

    // Export state of a BUILT resume (R0.6): the list shows "PDF out of date" when
    // exportedHash differs from contentHash. Not hashed by ProfileVersion.
    private String contentHash;

    private String exportedHash;

    private Instant exportedAt;

    // State of the stored PDF of a BUILT resume (R3.7, DESIGN 8.5): the list chips and the extension
    // ("PDF updating - attach in a moment") read it. Not hashed by ProfileVersion.
    private ResumePdfDTO pdf;

    // The render hash the card thumbnail shows (R3.13, DESIGN 8.10); null = none yet. The list builds the image address
    // from it ({@code /thumbnail?v=<hash>}), so a new render is a new URL. Not hashed by ProfileVersion.
    private String thumbHash;

    private Integer score;

    private UserDTO user;

    // Resume metadata (R3.9, DESIGN 8.6/8.8). All additive and none is hashed by ProfileVersion, so the
    // extension's mirror ignores them. `primary` is the web's word for `defaultResume` (same value).
    private Instant updatedAt;

    private String target;

    private List<String> tags;

    private ResumeRole role;

    private ResumeActorDTO createdBy;

    private ResumeActorDTO updatedBy;

    /** Derived (DESIGN 8.10): ARCHIVED | DRAFT | ACTIVE. Never stored. */
    private String lifecycle;

    /** Read-only here (changed through PATCH .../meta): excluded from org FULL sharing when false. */
    private Boolean shareWithOrg;

    public Boolean getShareWithOrg() {
        return shareWithOrg;
    }

    public void setShareWithOrg(Boolean shareWithOrg) {
        this.shareWithOrg = shareWithOrg;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }

    /** Same value as {@link #getDefaultResume()}; read-only. */
    @JsonProperty(value = "primary", access = JsonProperty.Access.READ_ONLY)
    public Boolean getPrimary() {
        return defaultResume;
    }

    public String getTarget() {
        return target;
    }

    public void setTarget(String target) {
        this.target = target;
    }

    public List<String> getTags() {
        return tags;
    }

    public void setTags(List<String> tags) {
        this.tags = tags;
    }

    public ResumeRole getRole() {
        return role;
    }

    public void setRole(ResumeRole role) {
        this.role = role;
    }

    public ResumeActorDTO getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(ResumeActorDTO createdBy) {
        this.createdBy = createdBy;
    }

    public ResumeActorDTO getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(ResumeActorDTO updatedBy) {
        this.updatedBy = updatedBy;
    }

    public String getLifecycle() {
        return lifecycle;
    }

    public void setLifecycle(String lifecycle) {
        this.lifecycle = lifecycle;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public String getr2ObjectKey() {
        return r2ObjectKey;
    }

    public void setr2ObjectKey(String r2ObjectKey) {
        this.r2ObjectKey = r2ObjectKey;
    }

    public String getParsedJson() {
        return parsedJson;
    }

    public void setParsedJson(String parsedJson) {
        this.parsedJson = parsedJson;
    }

    public ResumeStatus getStatus() {
        return status;
    }

    public void setStatus(ResumeStatus status) {
        this.status = status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Boolean getArchived() {
        return archived;
    }

    public void setArchived(Boolean archived) {
        this.archived = archived;
    }

    public Boolean getStarred() {
        return starred;
    }

    public void setStarred(Boolean starred) {
        this.starred = starred;
    }

    public Boolean getDefaultResume() {
        return defaultResume;
    }

    public void setDefaultResume(Boolean defaultResume) {
        this.defaultResume = defaultResume;
    }

    public ResumeKind getKind() {
        return kind;
    }

    public void setKind(ResumeKind kind) {
        this.kind = kind;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public String getExportedHash() {
        return exportedHash;
    }

    public void setExportedHash(String exportedHash) {
        this.exportedHash = exportedHash;
    }

    public Instant getExportedAt() {
        return exportedAt;
    }

    public void setExportedAt(Instant exportedAt) {
        this.exportedAt = exportedAt;
    }

    public ResumePdfDTO getPdf() {
        return pdf;
    }

    public void setPdf(ResumePdfDTO pdf) {
        this.pdf = pdf;
    }

    public String getThumbHash() {
        return thumbHash;
    }

    public void setThumbHash(String thumbHash) {
        this.thumbHash = thumbHash;
    }

    /** The last Resume Score (0-100) of a BUILT resume, for the list badge (DESIGN 11.5); null when never scored. Not hashed by ProfileVersion. */
    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }

    public UserDTO getUser() {
        return user;
    }

    public void setUser(UserDTO user) {
        this.user = user;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) {
            return true;
        }
        if (!(o instanceof ResumeDTO)) {
            return false;
        }

        ResumeDTO resumeDTO = (ResumeDTO) o;
        if (this.id == null) {
            return false;
        }
        return Objects.equals(this.id, resumeDTO.id);
    }

    @Override
    public int hashCode() {
        return Objects.hash(this.id);
    }

    // prettier-ignore
    @Override
    public String toString() {
        return "ResumeDTO{" +
            "id=" + getId() +
            ", label='" + getLabel() + "'" +
            ", r2ObjectKey='" + getr2ObjectKey() + "'" +
            ", parsedJson='" + getParsedJson() + "'" +
            ", status='" + getStatus() + "'" +
            ", createdAt='" + getCreatedAt() + "'" +
            ", archived='" + getArchived() + "'" +
            ", starred='" + getStarred() + "'" +
            ", defaultResume='" + getDefaultResume() + "'" +
            ", kind='" + getKind() + "'" +
            ", templateId='" + getTemplateId() + "'" +
            ", user=" + getUser() +
            "}";
    }
}
