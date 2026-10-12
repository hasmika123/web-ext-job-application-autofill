package com.dossier.api.service.ai;

import java.util.Locale;

/**
 * What an AI call is FOR (Phase 13.1a). Before this, drafting, option picks, field mapping and
 * job-detail enrichment all arrived at {@code POST /api/ai/draft} indistinguishable from each
 * other — so they all got the drafting instructions, and nothing could route, meter or switch
 * off one kind without the others. The extension now says which kind it is sending.
 *
 * <p>{@link #wire()} is the value on the wire and in the {@code ai_call} ledger. An absent or
 * unknown value is {@link #DRAFT}: that is what every older extension build sends.
 */
public enum AiTask {
    /** A written answer to an open-ended application question, grounded in the candidate's background. */
    DRAFT("draft"),
    /** Choose one of a question's fixed options. */
    PICK("pick"),
    /** Map form-field labels to canonical profile keys. */
    MAP("map"),
    /** Fill gaps in a captured job posting (job type, workplace, salary). */
    ENRICH("enrich"),
    /** Parse a resume into structured JSON (its own endpoint). */
    PARSE("parse"),
    /** Score the user's resumes against a job description (13.2; its own endpoints). */
    MATCH("match"),
    /** One resume against one job: match %, missing keywords, red flags (13.3; its own endpoints). */
    FIT("fit"),
    /** Rewrite a resume's existing bullets and summary for one job (13.4; its own endpoints). */
    TAILOR("tailor"),
    /** Score a night's fresh job postings for one user (13.6b; the nightly job, no endpoint). */
    JOBS("jobs"),
    /** Read job emails the rules couldn't settle (14.4a; the inbox poller, no endpoint). */
    INBOX("inbox"),
    /** Rewrite chosen resume lines in a mode: stronger, shorter, formal, plain, grammar (R4.1; Resume Builder, Pro). */
    REWRITE("rewrite"),
    /** Generate a professional summary for a built resume (R4.1; Resume Builder, Pro). */
    SUMMARY("summary"),
    /** Resume Builder AI Suggestions cards (R4.6; Pro). */
    SUGGEST("suggest"),
    /** A cover letter from a built resume and a job description (R5.3; Pro). */
    COVER("cover"),
    /** Translate a built resume into another language (R7; Pro). */
    TRANSLATE("translate");

    private final String wire;

    AiTask(String wire) {
        this.wire = wire;
    }

    public String wire() {
        return wire;
    }

    /** The task a request names; {@link #DRAFT} for anything absent or unknown. PARSE, MATCH, FIT,
     *  TAILOR, JOBS, INBOX and the Resume Builder tasks (REWRITE, SUMMARY, SUGGEST, COVER, TRANSLATE) are
     *  not reachable this way — they have their own endpoints or none. */
    public static AiTask fromWire(String value) {
        if (value == null) return DRAFT;
        String v = value.trim().toLowerCase(Locale.ROOT);
        for (AiTask t : values()) {
            if (t != PARSE && t != MATCH && t != FIT && t != TAILOR && t != JOBS && t != INBOX && !t.isResumeBuilder() && t.wire.equals(v)) return t;
        }
        return DRAFT;
    }

    /** The Resume Builder's own tasks (R4.1): checked proposals against a document, never reachable via {@link #fromWire}. */
    public boolean isResumeBuilder() {
        return this == REWRITE || this == SUMMARY || this == SUGGEST || this == COVER || this == TRANSLATE;
    }
}
