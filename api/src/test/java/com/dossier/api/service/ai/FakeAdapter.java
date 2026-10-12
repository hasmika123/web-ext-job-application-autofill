package com.dossier.api.service.ai;

import java.util.ArrayList;
import java.util.List;

/** A scriptable provider adapter for router and integration tests: records what it was asked, answers or fails on demand. */
public class FakeAdapter implements AiProvider {

    /** One call the adapter received. */
    public record Call(AiTask task, String model, int maxOutputTokens, boolean parse, boolean file) {}

    public final String id;
    public boolean configured = true;
    public String defaultModel = "fake-default";
    /** When set, every call throws it. */
    public AiProviderException failure;
    /** When set, a parse with a file throws this. */
    public AiProviderException fileFailure;
    public String text = "OK";
    public int inputTokens = 9;
    public int outputTokens = 1;
    public final List<Call> calls = new ArrayList<>();
    /** The text each call carried (question + context, or the resume text of a parse) - to prove what reached a provider. */
    public final List<String> prompts = new ArrayList<>();

    public FakeAdapter(String id) {
        this.id = id;
    }

    @Override
    public String id() {
        return id;
    }

    @Override
    public boolean isConfigured() {
        return configured;
    }

    @Override
    public String defaultModel() {
        return defaultModel;
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context) {
        return generate(task, model, question, context, 0);
    }

    @Override
    public AiResult generate(AiTask task, String model, String question, String context, int maxOutputTokens) {
        calls.add(new Call(task, model, maxOutputTokens, false, false));
        prompts.add(question + "\n" + context);
        if (failure != null) throw failure;
        return new AiResult(text, model + "-001", inputTokens, 0, outputTokens);
    }

    @Override
    public AiResult generateWithTimeout(AiTask task, String model, String question, String context, int maxOutputTokens, int timeoutMs) {
        return generate(task, model, question, context, maxOutputTokens);
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType) {
        return parseResume(model, text, fileBase64, fileMimeType, 0);
    }

    @Override
    public AiResult parseResume(String model, String text, String fileBase64, String fileMimeType, int maxOutputTokens) {
        boolean file = fileBase64 != null && !fileBase64.isBlank();
        calls.add(new Call(AiTask.PARSE, model, maxOutputTokens, true, file));
        prompts.add(text == null ? "" : text);
        if (file && fileFailure != null) throw fileFailure;
        if (failure != null) throw failure;
        return new AiResult("{\"experience\":[]}", model + "-001", inputTokens, 0, outputTokens);
    }

    /** A registry entry for this adapter. */
    public AiProviderRegistry.Entry entry() {
        return new AiProviderRegistry.Entry(id, id, "cloud", "DOSSIER_AI_" + id.toUpperCase() + "_ENV", true, configured, List.of("STRUCTURED_OUTPUT"), this);
    }
}
