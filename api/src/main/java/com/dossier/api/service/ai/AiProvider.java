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

    /** The shared resume-parsing system prompt. The output shape itself is enforced by the
     *  provider's structured-output mechanism (a JSON schema), so this focuses on the
     *  classification rules that heuristics get wrong. */
    String PARSE_SYSTEM_PROMPT =
        "You parse a candidate's resume into structured JSON. Rules: " +
        "Put each job's title and company in SEPARATE fields (never combine them). " +
        "Split date ranges into startDate and endDate; set current=true for present/ongoing roles. " +
        "Personal/side PROJECTS go in projects, NOT in experience. Technical skills/technologies listed under a " +
        "project belong in skills, not in the project. Keep each experience and project bullet as a separate bullets entry. " +
        "The school field is the institution NAME ONLY — put the campus city/state in location and the graduation date in endDate. " +
        "Programming languages (e.g. Python, Java, C++) are skills, NOT spoken languages; only real spoken languages go in languages. " +
        "bio holds the candidate's own contact details from the resume header (name, email, phone, city/state, links). " +
        "Use empty strings/arrays when unknown. Do not invent facts not present in the resume.";

    /**
     * Parse a resume into the canonical structured-resume JSON. Exactly one of
     * {@code text} (extracted resume text) or {@code fileBase64}+{@code fileMimeType}
     * (the original file, e.g. a PDF whose text extraction failed) is provided.
     *
     * @return the structured resume as a JSON string (never null/blank on success)
     * @throws AiProviderException on any provider/transport failure or unusable output
     */
    String parseResume(String text, String fileBase64, String fileMimeType) throws AiProviderException;
}
