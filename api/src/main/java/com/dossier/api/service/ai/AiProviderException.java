package com.dossier.api.service.ai;

/** A provider/transport failure while drafting (network error, bad response, etc.). */
public class AiProviderException extends RuntimeException {

    public AiProviderException(String message) {
        super(message);
    }

    public AiProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}
