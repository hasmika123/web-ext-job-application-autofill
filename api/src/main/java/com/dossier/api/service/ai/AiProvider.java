package com.dossier.api.service.ai;

/**
 * The one seam to an LLM provider for server-side answer drafting (Phase 5.1). A
 * concrete provider (Gemini today; Anthropic/OpenAI later) implements this; selecting
 * one is config, not a code change. Pure data in / text out — no quota or auth logic
 * here (that lives in {@code AiDraftService}).
 */
public interface AiProvider {
    /** The shared drafting system prompt — grounded, concise, no invented facts. */
    String SYSTEM_PROMPT =
        "You write concise, professional, first-person answers to job application questions, " +
        "grounded ONLY in the candidate background provided. 2-4 sentences. No preamble, no markdown, " +
        "no placeholders, and do not invent employers or facts not present in the background.";

    /** True when a key/model are configured and the provider can actually be called. */
    boolean isConfigured();

    /**
     * Draft an answer to {@code question} grounded in {@code context}.
     *
     * @return the answer text (never null/blank on success)
     * @throws AiProviderException on any provider/transport failure
     */
    String draft(String question, String context) throws AiProviderException;
}
