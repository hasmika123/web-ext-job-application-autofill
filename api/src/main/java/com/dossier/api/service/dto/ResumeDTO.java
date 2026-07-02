package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ResumeStatus;
import jakarta.persistence.Lob;
import jakarta.validation.constraints.*;
import java.io.Serializable;
import java.time.Instant;
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

    private UserDTO user;

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
            ", user=" + getUser() +
            "}";
    }
}
