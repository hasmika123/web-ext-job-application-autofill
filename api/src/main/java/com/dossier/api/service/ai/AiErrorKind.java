package com.dossier.api.service.ai;

import java.io.IOException;
import java.net.http.HttpTimeoutException;

/**
 * Why an AI call failed, as a short code - the {@code error_kind} column of the {@code ai_call} ledger and
 * the {@code error.kind} the admin Test returns. Never a provider message: a message can carry a prompt or a
 * key, a code cannot. {@link #retryable()} is what lets the router try its ONE fallback provider: a timeout, a
 * 5xx, a rate limit, a transport failure, an empty answer, a provider that is off or has no key, or one that
 * cannot take the input. A 4xx, an unknown model or unparsable JSON is the request's fault and surfaces as is.
 */
public enum AiErrorKind {
    TIMEOUT(true),
    HTTP_4XX(false),
    HTTP_5XX(true),
    RATE_LIMITED(true),
    MODEL_NOT_FOUND(false),
    EMPTY(true),
    BAD_JSON(false),
    UNCONFIGURED(true),
    DISABLED(true),
    UNSUPPORTED_INPUT(true),
    TRANSPORT(true),
    UNKNOWN(false);

    private final boolean retryable;

    AiErrorKind(boolean retryable) {
        this.retryable = retryable;
    }

    public boolean retryable() {
        return retryable;
    }

    /** The kind of an HTTP error status. */
    public static AiErrorKind ofStatus(int status) {
        if (status == 429) return RATE_LIMITED;
        if (status == 404) return MODEL_NOT_FOUND;
        if (status == 408 || status == 504) return TIMEOUT;
        if (status >= 500) return HTTP_5XX;
        if (status >= 400) return HTTP_4XX;
        return UNKNOWN;
    }

    /** The kind of a provider failure: the adapter's own word if it gave one, else its HTTP status, else its cause. */
    public static AiErrorKind classify(Throwable t) {
        if (t instanceof AiProviderException e) {
            if (e.kind() != null) return e.kind();
            if (e.httpStatus() > 0) return ofStatus(e.httpStatus());
        }
        for (Throwable c = t; c != null; c = c.getCause() == c ? null : c.getCause()) {
            if (c instanceof HttpTimeoutException || c instanceof java.util.concurrent.TimeoutException) return TIMEOUT;
            if (c instanceof IOException) return TRANSPORT;
        }
        return UNKNOWN;
    }
}
