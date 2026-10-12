package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * The canonical builder document of a resume (Resume Builder, DESIGN 5.4), 1:1 with {@link Resume}
 * and keyed by it. Web-only: the extension's mirror reads {@code resume.parsedJson}, a projection
 * of {@code docJson}. {@code docVersion} is the optimistic lock (the ETag); {@code contentHash}
 * pins AI proposals. See the changelog.
 */
@Entity
@Table(name = "resume_doc")
public class ResumeDoc implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @Column(name = "resume_id")
    private Long resumeId;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @MapsId
    @JoinColumn(name = "resume_id")
    private Resume resume;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "doc_json", nullable = false, columnDefinition = "json")
    private String docJson;

    @Column(name = "template_id", nullable = false, length = 40)
    private String templateId = "modern";

    @Column(name = "theme_json", nullable = false, columnDefinition = "json")
    private String themeJson;

    // Starts at 1 (the column default) so a client never sees a falsy "0" ETag.
    @Version
    @Column(name = "doc_version", nullable = false)
    private int docVersion = 1;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(name = "profile_synced_at")
    private Instant profileSyncedAt;

    @Column(name = "exported_at")
    private Instant exportedAt;

    @Column(name = "exported_hash", length = 64)
    private String exportedHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public Long getResumeId() {
        return resumeId;
    }

    public Resume getResume() {
        return resume;
    }

    public void setResume(Resume resume) {
        this.resume = resume;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public String getDocJson() {
        return docJson;
    }

    public void setDocJson(String docJson) {
        this.docJson = docJson;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public String getThemeJson() {
        return themeJson;
    }

    public void setThemeJson(String themeJson) {
        this.themeJson = themeJson;
    }

    public int getDocVersion() {
        return docVersion;
    }

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public Instant getProfileSyncedAt() {
        return profileSyncedAt;
    }

    public void setProfileSyncedAt(Instant profileSyncedAt) {
        this.profileSyncedAt = profileSyncedAt;
    }

    public Instant getExportedAt() {
        return exportedAt;
    }

    public void setExportedAt(Instant exportedAt) {
        this.exportedAt = exportedAt;
    }

    public String getExportedHash() {
        return exportedHash;
    }

    public void setExportedHash(String exportedHash) {
        this.exportedHash = exportedHash;
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

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ResumeDoc)) return false;
        return resumeId != null && resumeId.equals(((ResumeDoc) o).resumeId);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
