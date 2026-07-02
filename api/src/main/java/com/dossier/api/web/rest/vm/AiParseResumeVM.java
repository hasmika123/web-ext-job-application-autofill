package com.dossier.api.web.rest.vm;

/**
 * Request body for {@code POST /api/ai/parse-resume}: either the extracted resume
 * {@code text} (the cheap path) or the original file as {@code fileBase64} +
 * {@code fileMimeType} (PDF only — used when text extraction shredded the layout or
 * the PDF is scanned), plus the user's explicit {@code consent} to send it to the
 * configured AI provider. Exactly one of text/file must be present (validated in the
 * controller, not by annotations, since it's a cross-field rule).
 */
public class AiParseResumeVM {

    /** Extracted (and client-side cleaned) resume text. */
    private String text;

    /** Original file bytes, base64 (no data: prefix). PDF only. */
    private String fileBase64;

    /** MIME type for {@link #fileBase64}; only {@code application/pdf} is accepted. */
    private String fileMimeType;

    /** Must be true — the user opted into server-side AI parsing. */
    private boolean consent;

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public String getFileBase64() {
        return fileBase64;
    }

    public void setFileBase64(String fileBase64) {
        this.fileBase64 = fileBase64;
    }

    public String getFileMimeType() {
        return fileMimeType;
    }

    public void setFileMimeType(String fileMimeType) {
        this.fileMimeType = fileMimeType;
    }

    public boolean isConsent() {
        return consent;
    }

    public void setConsent(boolean consent) {
        this.consent = consent;
    }
}
