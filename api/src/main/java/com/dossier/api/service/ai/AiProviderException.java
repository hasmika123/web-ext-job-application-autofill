package com.dossier.api.service.ai;

/**
 * A provider/transport failure while drafting (network error, bad response, etc.). Carries, when the adapter
 * knows them, the HTTP status and an {@link AiErrorKind}, so the router can classify the failure (and decide
 * on a fallback) without parsing a message. The message itself must never hold a key or a prompt.
 */
public class AiProviderException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int httpStatus;
    private final AiErrorKind kind;

    public AiProviderException(String message) {
        super(message);
        this.httpStatus = 0;
        this.kind = null;
    }

    public AiProviderException(String message, Throwable cause) {
        super(message, cause);
        this.httpStatus = 0;
        this.kind = null;
    }

    public AiProviderException(String message, AiErrorKind kind) {
        super(message);
        this.httpStatus = 0;
        this.kind = kind;
    }

    public AiProviderException(String message, AiErrorKind kind, Throwable cause) {
        super(message, cause);
        this.httpStatus = 0;
        this.kind = kind;
    }

    /** A non-2xx answer from the provider. */
    public AiProviderException(String message, int httpStatus, Throwable cause) {
        super(message, cause);
        this.httpStatus = httpStatus;
        this.kind = AiErrorKind.ofStatus(httpStatus);
    }

    /** The provider's HTTP status, or 0 when the failure was not an HTTP answer. */
    public int httpStatus() {
        return httpStatus;
    }

    /** The adapter's classification, or null when it gave none (see {@link AiErrorKind#classify}). */
    public AiErrorKind kind() {
        return kind;
    }
}
