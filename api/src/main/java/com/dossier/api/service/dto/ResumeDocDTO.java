package com.dossier.api.service.dto;

import com.dossier.api.domain.enumeration.ResumeKind;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;

/**
 * The builder document of a resume as the web editor sees it (Resume Builder DESIGN 6.2).
 * {@code doc} is the canonical {@code ResumeDocument} (schema v2) and {@code theme} the free-form
 * theme object, both as JSON values rather than strings. The same {@code docVersion} travels in
 * the {@code ETag} header.
 */
public class ResumeDocDTO {

    private Long resumeId;
    private String label;
    private ResumeKind kind;

    @Schema(type = "object", description = "The ResumeDocument (schema v2; a stored v1 document is upgraded on read).")
    private JsonNode doc;

    @Schema(description = "The schema of 'doc' - always 2 (the current ResumeDocument schema).")
    private int schemaVersion = 2;

    private String templateId;

    @Schema(type = "object", description = "Theme overrides (colors, font, spacing); {} for the template defaults.")
    private JsonNode theme;

    private int docVersion;
    private String contentHash;
    private Instant profileSyncedAt;
    private Instant exportedAt;
    private String exportedHash;
    private Instant updatedAt;

    public Long getResumeId() {
        return resumeId;
    }

    public void setResumeId(Long resumeId) {
        this.resumeId = resumeId;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public ResumeKind getKind() {
        return kind;
    }

    public void setKind(ResumeKind kind) {
        this.kind = kind;
    }

    public JsonNode getDoc() {
        return doc;
    }

    public void setDoc(JsonNode doc) {
        this.doc = doc;
    }

    public int getSchemaVersion() {
        return schemaVersion;
    }

    public void setSchemaVersion(int schemaVersion) {
        this.schemaVersion = schemaVersion;
    }

    public String getTemplateId() {
        return templateId;
    }

    public void setTemplateId(String templateId) {
        this.templateId = templateId;
    }

    public JsonNode getTheme() {
        return theme;
    }

    public void setTheme(JsonNode theme) {
        this.theme = theme;
    }

    public int getDocVersion() {
        return docVersion;
    }

    public void setDocVersion(int docVersion) {
        this.docVersion = docVersion;
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

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
