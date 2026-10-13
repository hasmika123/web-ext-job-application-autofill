package com.dossier.api.service;

import java.util.Map;

/**
 * A resume-sharing operation the server refused (R3.11). Rendered by the same problem handler as
 * {@link ResumeDocException}; clients branch on {@code code}:
 *
 * <ul>
 *   <li>{@code USER_NOT_FOUND} (404) - no active Kiwiply account has that email ("send them the link instead").</li>
 *   <li>{@code ALREADY_GRANTED} (409) - that person already has an active grant on the resume.</li>
 *   <li>{@code ROLE_NOT_AVAILABLE} (422) - only VIEW can be granted for now.</li>
 *   <li>{@code LIMIT} (422) - {@code resume.share.maxGrants} / {@code resume.share.maxLinks} reached.</li>
 *   <li>{@code FEATURE_DISABLED} (403) - share links are switched off ({@code feature.resume_share_links.enabled}).</li>
 *   <li>{@code NOT_SHAREABLE} (422) - only resumes built in Kiwiply can be shared (an uploaded file has no page to show).</li>
 *   <li>{@code ACCESS_INVALID} (422) - a bad email, expiry in the past, over-long label, or an attempt to share with yourself.</li>
 *   <li>{@code PDF_NOT_READY} (409) - the stored PDF is not current yet; the page says "PDF being prepared".</li>
 * </ul>
 */
public class ResumeAccessException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_USER_NOT_FOUND = "USER_NOT_FOUND";
    public static final String CODE_ALREADY_GRANTED = "ALREADY_GRANTED";
    public static final String CODE_ROLE_NOT_AVAILABLE = "ROLE_NOT_AVAILABLE";
    public static final String CODE_LIMIT = "LIMIT";
    public static final String CODE_FEATURE_DISABLED = "FEATURE_DISABLED";
    public static final String CODE_NOT_SHAREABLE = "NOT_SHAREABLE";
    public static final String CODE_ACCESS_INVALID = "ACCESS_INVALID";
    public static final String CODE_PDF_NOT_READY = "PDF_NOT_READY";

    private ResumeAccessException(int status, String code, String message, Map<String, Object> extra) {
        super(status, code, message, extra);
    }

    public static ResumeAccessException userNotFound() {
        return new ResumeAccessException(404, CODE_USER_NOT_FOUND, "They need a Kiwiply account - send them the link instead", Map.of());
    }

    public static ResumeAccessException alreadyGranted() {
        return new ResumeAccessException(409, CODE_ALREADY_GRANTED, "That person can already see this resume", Map.of());
    }

    public static ResumeAccessException roleNotAvailable() {
        return new ResumeAccessException(422, CODE_ROLE_NOT_AVAILABLE, "Only view access can be shared for now", Map.of());
    }

    public static ResumeAccessException limit(String what, int max) {
        return new ResumeAccessException(422, CODE_LIMIT, "You can share a resume with at most " + max + " " + what, Map.of("max", max));
    }

    public static ResumeAccessException featureDisabled() {
        return new ResumeAccessException(403, CODE_FEATURE_DISABLED, "Share links are switched off right now", Map.of());
    }

    public static ResumeAccessException notShareable() {
        return new ResumeAccessException(422, CODE_NOT_SHAREABLE, "Only resumes built in Kiwiply can be shared", Map.of());
    }

    public static ResumeAccessException invalid(String path, String message) {
        return new ResumeAccessException(422, CODE_ACCESS_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static ResumeAccessException pdfNotReady() {
        return new ResumeAccessException(409, CODE_PDF_NOT_READY, "The PDF is being prepared", Map.of());
    }
}
