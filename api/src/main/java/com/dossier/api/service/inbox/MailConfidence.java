package com.dossier.api.service.inbox;

import com.dossier.api.service.inbox.MailEvent.MatchKind;

/**
 * How sure the inbox is about one mail, 0..100, from explicit signals. Every weight lives in this one class.
 *
 * <p>Two numbers, and the final confidence is the lower of them (a wrong guess in either is a wrong change):
 * <ul>
 *   <li><b>Reading</b> ({@link #reading}): is the category right? A base for how it was read (rules settled it, or
 *       the model did) plus points for a known hiring-system or company sender, a subject that says it on its own,
 *       and a body that says it on its own.</li>
 *   <li><b>Match</b> ({@link #match}): is it this application? Each signal that points at the application is an
 *       independent chance, combined as {@code 1 - (1-a)(1-b)...}, so two agreeing signals beat one and no
 *       pile of signals passes 100.</li>
 * </ul>
 * The thresholds ({@code inbox.apply_min_confidence}, {@code inbox.suggest_min_confidence}) are admin settings, not here.
 */
public final class MailConfidence {

    // ---- reading weights (points; sum is capped at 100) ----
    static final int READ_BASE_RULES = 60;
    static final int READ_BASE_AI = 62;
    /** The sender is a known hiring system, or the company's own domain. */
    static final int READ_SENDER = 20;
    /** The subject alone, read by the rules, gives the same category. */
    static final int READ_SUBJECT = 12;
    /** The body alone, read by the rules, gives the same category. */
    static final int READ_BODY = 8;
    /** The rules had a hint but could not settle it (and no model settled it either). */
    static final int READ_RULES_UNSURE_CAP = 55;

    // ---- match weights (percent chance each signal alone is right) ----
    public static final int W_ATS_ID = 92;
    public static final int W_JOB_LINK = 88;
    public static final int W_THREAD = 88;
    /** The company the mail names (or its sender domain / display name) is the application's company. */
    public static final int W_COMPANY = 80;
    /** The company shows only inside the subject line. */
    public static final int W_COMPANY_SUBJECT_ONLY = 70;
    /** The role the mail names is the application's role. */
    public static final int W_ROLE = 70;
    /** Extra: the sender's own domain is the company's. */
    public static final int W_SENDER_IS_COMPANY = 40;

    /** Two best candidates this close (points) are never chosen between. */
    public static final int AMBIGUOUS_GAP = 10;

    private MailConfidence() {}

    /** The signals about how the category was read. */
    public record ReadingSignals(boolean byAi, boolean rulesUnsure, boolean senderKnown, boolean subjectStrong, boolean bodyStrong) {}

    public static int reading(ReadingSignals s) {
        int v = s.byAi() ? READ_BASE_AI : READ_BASE_RULES;
        if (s.senderKnown()) v += READ_SENDER;
        if (s.subjectStrong()) v += READ_SUBJECT;
        if (s.bodyStrong()) v += READ_BODY;
        if (s.rulesUnsure() && !s.byAi()) v = Math.min(v, READ_RULES_UNSURE_CAP);
        return Math.max(0, Math.min(100, v));
    }

    /** One candidate application's evidence. */
    public record MatchSignals(
        boolean atsId,
        boolean jobLink,
        boolean thread,
        boolean company,
        boolean companySubjectOnly,
        boolean role,
        boolean senderIsCompany
    ) {}

    public static int match(MatchSignals s) {
        double miss = 1.0;
        if (s.atsId()) miss *= 1 - W_ATS_ID / 100.0;
        if (s.jobLink()) miss *= 1 - W_JOB_LINK / 100.0;
        if (s.thread()) miss *= 1 - W_THREAD / 100.0;
        if (s.company()) miss *= 1 - W_COMPANY / 100.0;
        else if (s.companySubjectOnly()) miss *= 1 - W_COMPANY_SUBJECT_ONLY / 100.0;
        boolean anchored = s.company() || s.companySubjectOnly() || s.atsId() || s.jobLink() || s.thread();
        if (s.role() && anchored) miss *= 1 - W_ROLE / 100.0;
        if (s.senderIsCompany()) miss *= 1 - W_SENDER_IS_COMPANY / 100.0;
        return (int) Math.round((1 - miss) * 100);
    }

    /** The strongest signal names the kind. */
    public static MatchKind kind(MatchSignals s) {
        if (s.atsId()) return MatchKind.ATS_ID;
        if (s.jobLink()) return MatchKind.JOB_LINK;
        if (s.thread()) return MatchKind.THREAD;
        boolean company = s.company() || s.companySubjectOnly();
        if (company && s.role()) return MatchKind.COMPANY_ROLE;
        if (company) return MatchKind.COMPANY;
        return MatchKind.NONE;
    }

    /** The final score: the lower of the reading and the match; the reading alone when nothing matched. */
    public static int combine(int reading, int match, boolean matched) {
        return matched ? Math.min(reading, match) : reading;
    }
}
