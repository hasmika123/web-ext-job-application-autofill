package com.dossier.api.service.ai;

/**
 * The one seam to an LLM provider for server-side AI (Phase 5.1). A concrete provider (Gemini
 * today; Anthropic/OpenAI later) implements this; selecting one is config, not a code change.
 * Pure data in, {@link AiResult} out — no quota or auth logic here (that lives in the services).
 *
 * <p>Since 13.1a every call names its {@link AiTask} and returns what it consumed, so the
 * services can meter by cost and give each kind of request instructions written for it.
 */
public interface AiProvider {
    /** The drafting system prompt — grounded, concise, no invented facts. */
    String SYSTEM_PROMPT =
        "You write concise, professional, first-person answers to job application questions, " +
        "grounded ONLY in the candidate background provided. 2-4 sentences. No preamble, no markdown, " +
        "no placeholders, and do not invent employers or facts not present in the background.";

    /**
     * For picks, field mapping and enrichment (13.1a). The extension's prompt already says exactly
     * what to return (one option, a JSON map…); the drafting prompt's "2-4 sentences" fought that,
     * and the caller had to dig the answer out of prose. This one just asks for obedience.
     */
    String INSTRUCTION_SYSTEM_PROMPT =
        "Follow the task instructions exactly and reply ONLY in the format they ask for: no preamble, " +
        "no explanation, no markdown fences. Never invent facts about the candidate.";

    /** The system prompt a task is sent with. */
    static String systemPromptFor(AiTask task) {
        return task == AiTask.DRAFT ? SYSTEM_PROMPT : INSTRUCTION_SYSTEM_PROMPT;
    }

    /** True when a key/model are configured and the provider can actually be called. */
    boolean isConfigured();

    /**
     * Run one short task. For {@link AiTask#DRAFT} {@code question} is the application question and
     * {@code context} the candidate background; for the others {@code question} is the full
     * instruction and {@code context} is usually blank.
     *
     * @return the result (text never null/blank on success)
     * @throws AiProviderException on any provider/transport failure
     */
    AiResult generate(AiTask task, String question, String context) throws AiProviderException;

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
     * @return the result, whose text is the structured resume as a JSON string (never blank)
     * @throws AiProviderException on any provider/transport failure or unusable output
     */
    AiResult parseResume(String text, String fileBase64, String fileMimeType) throws AiProviderException;
}
