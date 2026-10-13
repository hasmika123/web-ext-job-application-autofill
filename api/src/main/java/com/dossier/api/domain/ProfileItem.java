package com.dossier.api.domain;

import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.domain.enumeration.Provenance;
import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One structured item of the Common Profile (Resume Builder, DESIGN 5.2): a job, a school, a skill
 * group, a project... {@code dataJson} is the item in the same shape as the resume-document item of
 * that kind (minus id/hidden). Soft-deleted via {@code deletedAt}. See the changelog.
 */
@Entity
@Table(name = "profile_item")
public class ProfileItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(name = "section", nullable = false, length = 20)
    private ProfileSection section;

    @Column(name = "position", nullable = false)
    private int position;

    @Column(name = "data_json", nullable = false, columnDefinition = "json")
    private String dataJson;

    @Enumerated(EnumType.STRING)
    @Column(name = "provenance", nullable = false, length = 10)
    private Provenance provenance;

    @Column(name = "source_resume_id")
    private Long sourceResumeId;

    @Column(name = "hidden", nullable = false)
    private boolean hidden;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    public Long getId() {
        return id;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public ProfileSection getSection() {
        return section;
    }

    public void setSection(ProfileSection section) {
        this.section = section;
    }

    public int getPosition() {
        return position;
    }

    public void setPosition(int position) {
        this.position = position;
    }

    public String getDataJson() {
        return dataJson;
    }

    public void setDataJson(String dataJson) {
        this.dataJson = dataJson;
    }

    public Provenance getProvenance() {
        return provenance;
    }

    public void setProvenance(Provenance provenance) {
        this.provenance = provenance;
    }

    public Long getSourceResumeId() {
        return sourceResumeId;
    }

    public void setSourceResumeId(Long sourceResumeId) {
        this.sourceResumeId = sourceResumeId;
    }

    public boolean isHidden() {
        return hidden;
    }

    public void setHidden(boolean hidden) {
        this.hidden = hidden;
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

    public Instant getDeletedAt() {
        return deletedAt;
    }

    public void setDeletedAt(Instant deletedAt) {
        this.deletedAt = deletedAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ProfileItem)) return false;
        return id != null && id.equals(((ProfileItem) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
