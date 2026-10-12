package com.dossier.api.service.ai;

/**
 * The adapter for a provider id nobody registered (a typo in {@code ai.route.<task>.provider}, or a provider
 * a later phase has not built yet): always unconfigured, so the router fails over or refuses cleanly instead of
 * failing the request with a null pointer.
 */
public class DisabledAiProvider implements AiProvider {

    private final String id;

    public DisabledAiProvider() {
        this("unknown");
    }

    public DisabledAiProvider(String id) {
        this.id = id == null || id.isBlank() ? "unknown" : id;
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public boolean isConfigured() {
        return false;
    }

    @Override
    public String defaultModel() {
        return "";
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context) {
        throw new AiProviderException("No AI provider configured", AiErrorKind.UNCONFIGURED);
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType) {
        throw new AiProviderException("No AI provider configured", AiErrorKind.UNCONFIGURED);
    }
}
