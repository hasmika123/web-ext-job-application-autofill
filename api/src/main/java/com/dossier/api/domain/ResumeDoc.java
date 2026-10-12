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

    /** The document schema this row was last written at: 1 until the first v2 write (DESIGN 3.6). */
    @Column(name = "schema_version", nullable = false)
    private int schemaVersion = 1;

    /** Mirror of {@code basics.photo.key}, for file cleanup without parsing {@code docJson}. */
    @Column(name = "photo_key", length = 255)
    private String photoKey;

    /** Tailored copies: the base resume (no foreign key; a copy outlives its base). */
    @Column(name = "parent_resume_id")
    private Long parentResumeId;

    @Column(name = "parent_hash_at_copy", length = 64)
    private String parentHashAtCopy;

    /** Where the document came from: PROFILE | UPLOAD | BLANK | COPY ... */
    @Column(name = "source_kind", nullable = false, length = 10)
    private String sourceKind = "PROFILE";

    /** The Insights score record (DESIGN 11.5); written by the score story. */
    @Column(name = "score_json", columnDefinition = "json")
    private String scoreJson;

    /** Denormalised score for the list badge and sort. */
    @Column(name = "score", columnDefinition = "smallint")
    private Integer score;

    // ---- async PDF job (R3.7, DESIGN 8.5): the row is the job ----------------------------------

    /** NONE | PENDING | RUNNING | READY | FAILED. STALE (READY with a mismatched hash) is derived, never stored. */
    @Column(name = "pdf_status", nullable = false, length = 10)
    private String pdfStatus = "NONE";

    /** When PENDING was set: the settle timer starts here and the queue is served oldest first. */
    @Column(name = "pdf_requested_at")
    private Instant pdfRequestedAt;

    @Column(name = "pdf_lease_until")
    private Instant pdfLeaseUntil;

    @Column(name = "pdf_worker", length = 64)
    private String pdfWorker;

    @Column(name = "pdf_attempts", nullable = false, columnDefinition = "smallint")
    private int pdfAttempts = 0;

    @Column(name = "pdf_next_attempt_at")
    private Instant pdfNextAttemptAt;

    @Column(name = "pdf_error", length = 200)
    private String pdfError;

    /** Card thumbnail storage key + the render hash it was made from (DESIGN 8.10; written by R3.13). */
    @Column(name = "thumb_key", length = 255)
    private String thumbKey;

    @Column(name = "thumb_hash", length = 64)
    private String thumbHash;

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

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getPhotoKey() {
        return photoKey;
    }

    public void setPhotoKey(String photoKey) {
        this.photoKey = photoKey;
    }

    public Long getParentResumeId() {
        return parentResumeId;
    }

    public void setParentResumeId(Long parentResumeId) {
        this.parentResumeId = parentResumeId;
    }

    public String getParentHashAtCopy() {
        return parentHashAtCopy;
    }

    public void setParentHashAtCopy(String parentHashAtCopy) {
        this.parentHashAtCopy = parentHashAtCopy;
    }

    public String getSourceKind() {
        return sourceKind;
    }

    public void setSourceKind(String sourceKind) {
        this.sourceKind = sourceKind;
    }

    public String getScoreJson() {
        return scoreJson;
    }

    public void setScoreJson(String scoreJson) {
        this.scoreJson = scoreJson;
    }

    public Integer getScore() {
        return score;
    }

    public void setScore(Integer score) {
        this.score = score;
    }

    public String getPdfStatus() {
        return pdfStatus;
    }

    public void setPdfStatus(String pdfStatus) {
        this.pdfStatus = pdfStatus;
    }

    public Instant getPdfRequestedAt() {
        return pdfRequestedAt;
    }

    public void setPdfRequestedAt(Instant pdfRequestedAt) {
        this.pdfRequestedAt = pdfRequestedAt;
    }

    public Instant getPdfLeaseUntil() {
        return pdfLeaseUntil;
    }

    public void setPdfLeaseUntil(Instant pdfLeaseUntil) {
        this.pdfLeaseUntil = pdfLeaseUntil;
    }

    public String getPdfWorker() {
        return pdfWorker;
    }

    public void setPdfWorker(String pdfWorker) {
        this.pdfWorker = pdfWorker;
    }

    public int getPdfAttempts() {
        return pdfAttempts;
    }

    public void setPdfAttempts(int pdfAttempts) {
        this.pdfAttempts = pdfAttempts;
    }

    public Instant getPdfNextAttemptAt() {
        return pdfNextAttemptAt;
    }

    public void setPdfNextAttemptAt(Instant pdfNextAttemptAt) {
        this.pdfNextAttemptAt = pdfNextAttemptAt;
    }

    public String getPdfError() {
        return pdfError;
    }

    public void setPdfError(String pdfError) {
        this.pdfError = pdfError;
    }

    public String getThumbKey() {
        return thumbKey;
    }

    public void setThumbKey(String thumbKey) {
        this.thumbKey = thumbKey;
    }

    public String getThumbHash() {
        return thumbHash;
    }

    public void setThumbHash(String thumbHash) {
        this.thumbHash = thumbHash;
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
