package com.dossier.api.domain;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.Instant;

/**
 * One saved snapshot of a {@link ResumeDoc} (Resume Builder, DESIGN 5.5): autosave, manual, template
 * switch, AI apply, import, restore or a named version. {@code resumeId} is deliberately not a
 * foreign key (see the changelog); account deletion clears these rows by user.
 */
@Entity
@Table(name = "resume_doc_version")
public class ResumeDocVersion implements Serializable {

    private static final long serialVersionUID = 1L;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

    @Column(name = "resume_id", nullable = false)
    private Long resumeId;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "version_no", nullable = false)
    private int versionNo;

    /** AUTOSAVE | MANUAL | TEMPLATE_SWITCH | AI_APPLY | IMPORT | RESTORE | NAMED */
    @Column(name = "reason", nullable = false, length = 16)
    private String reason;

    @Column(name = "name", length = 80)
    private String name;

    @Column(name = "doc_json", nullable = false, columnDefinition = "json")
    private String docJson;

    @Column(name = "template_id", nullable = false, length = 40)
    private String templateId;

    @Column(name = "theme_json", nullable = false, columnDefinition = "json")
    private String themeJson;

    @Column(name = "content_hash", nullable = false, length = 64)
    private String contentHash;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() {
        return id;
    }

    public Long getResumeId() {
        return resumeId;
    }

    public void setResumeId(Long resumeId) {
        this.resumeId = resumeId;
    }

    public User getUser() {
        return user;
    }

    public void setUser(User user) {
        this.user = user;
    }

    public int getVersionNo() {
        return versionNo;
    }

    public void setVersionNo(int versionNo) {
        this.versionNo = versionNo;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
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

    public String getContentHash() {
        return contentHash;
    }

    public void setContentHash(String contentHash) {
        this.contentHash = contentHash;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ResumeDocVersion)) return false;
        return id != null && id.equals(((ResumeDocVersion) o).id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
