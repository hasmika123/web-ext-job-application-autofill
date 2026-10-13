package com.dossier.api.service;

import java.util.Map;

/**
 * A resume-metadata operation the server refused (R3.9). Rendered by the same problem handler as
 * {@link ResumeDocException}; clients branch on {@code code}:
 *
 * <ul>
 *   <li>{@code META_INVALID} (422) - a field is wrong (blank or too long name, a bad tag list, a wrong type);
 *       {@code path} and {@code message} name it.</li>
 *   <li>{@code PRIMARY_REQUIRED} (409) - the change would leave the user without a primary resume
 *       (unsetting it, or archiving it while other live resumes exist): promote another one first.</li>
 *   <li>{@code NOT_TAILORED} (409) - detach asked of a resume that is not a tailored copy.</li>
 * </ul>
 */
public class ResumeMetaException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_META_INVALID = "META_INVALID";
    public static final String CODE_PRIMARY_REQUIRED = "PRIMARY_REQUIRED";
    public static final String CODE_NOT_TAILORED = "NOT_TAILORED";

    private ResumeMetaException(int status, String code, String message, Map<String, Object> extra) {
        super(status, code, message, extra);
    }

    public static ResumeMetaException invalid(String path, String message) {
        return new ResumeMetaException(422, CODE_META_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    public static ResumeMetaException primaryRequired(String message) {
        return new ResumeMetaException(409, CODE_PRIMARY_REQUIRED, message, Map.of());
    }

    public static ResumeMetaException notTailored() {
        return new ResumeMetaException(409, CODE_NOT_TAILORED, "This resume is not a tailored copy", Map.of());
    }
}
