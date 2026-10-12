package com.dossier.api.service.privacy;

import com.dossier.api.service.ResumeDocException;
import java.util.Map;

/**
 * A value the product never collects was found in submitted content: 422 {@code SENSITIVE_CONTENT}
 * with {@code path} (where) and {@code class} (which kind, a {@link SensitivePatterns} code). Rendered
 * by the same problem handler as {@link ResumeDocException}, which it extends so no translator change
 * is needed; clients branch on {@code code}.
 */
public class SensitiveContentException extends ResumeDocException {

    private static final long serialVersionUID = 1L;

    public static final String CODE_SENSITIVE_CONTENT = "SENSITIVE_CONTENT";

    private final String path;
    private final String cls;

    public SensitiveContentException(String path, String cls) {
        super(
            422,
            CODE_SENSITIVE_CONTENT,
            "We never store " + SensitiveContent.label(cls) + " - please remove it (" + path + ")",
            Map.of("path", path, "class", cls)
        );
        this.path = path;
        this.cls = cls;
    }

    public String getPath() {
        return path;
    }

    /** The {@link SensitivePatterns} class code. */
    public String getSensitiveClass() {
        return cls;
    }
}
