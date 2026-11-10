package com.dossier.api.service.inbox;

import java.time.Instant;
import java.util.List;

/**
 * What one classified mail means, as the parser hands it to the decision seam ({@link InboxDecisionPolicy}).
 * Immutable and free of personal data beyond what the mail itself already holds: the category, how sure
 * the reading is (0..100), how the application was found, who else it could have been, the interview it
 * announced, and a short evidence snippet. Never the full body, never an address.
 *
 * <p>{@code confidence} is the one number a policy compares to its threshold: the lower of the reading's and
 * the match's confidence when an application was matched, else the reading's own. {@code matchedApplicationId}
 * is null when nothing matched, or when two candidates were too close to choose between ({@link MatchKind#AMBIGUOUS})
 * - the candidates are then listed so a person can pick.
 *
 * @param messageId                the stored {@code inbox_message} row
 * @param confidence               0..100, overall
 * @param classificationConfidence 0..100, how sure the category is
 * @param matchConfidence          0..100, how sure the application is (0 when none)
 * @param candidates               ranked best first, at most {@link #MAX_CANDIDATES}
 * @param interview                the schedule the mail carries, or null
 * @param evidence                 a snippet of the mail that decided the category, at most {@link #MAX_EVIDENCE} characters
 */
public record MailEvent(
    Long messageId,
    MailClassifier.Category category,
    int confidence,
    int classificationConfidence,
    int matchConfidence,
    MatchKind matchKind,
    Long matchedApplicationId,
    List<Candidate> candidates,
    InterviewDetails interview,
    String evidence
) {
    public static final int MAX_EVIDENCE = 200;
    public static final int MAX_CANDIDATES = 5;

    /** How the application was found, strongest evidence first. */
    public enum MatchKind {
        /** The mail carries the ATS application or requisition id the application was saved with. */
        ATS_ID,
        /** A job link in the mail is the application's job link. */
        JOB_LINK,
        /** A reply to a mail already linked to the application. */
        THREAD,
        /** Company and role both agree. */
        COMPANY_ROLE,
        /** Only the company agrees. */
        COMPANY,
        /** Two or more candidates were too close: nothing was chosen. */
        AMBIGUOUS,
        NONE,
    }

    /** One application the mail could be about, with why (a fixed reason code and a plain sentence). */
    public record Candidate(Long applicationId, int score, MatchKind kind, String reason, String company, String role) {
        public Candidate {
            score = clamp(score);
        }

        public Candidate(Long applicationId, int score, MatchKind kind, String reason) {
            this(applicationId, score, kind, reason, null, null);
        }
    }

    /** A schedule read from the mail: instants are exact (zone and DST resolved), {@code tz} is the IANA zone the mail named. Fields not in the mail are null. */
    public record InterviewDetails(
        Instant startsAt,
        Instant endsAt,
        String tz,
        String kind,
        String location,
        String meetingUrl,
        String uid,
        boolean cancelled,
        boolean rescheduled
    ) {}

    public MailEvent {
        confidence = clamp(confidence);
        classificationConfidence = clamp(classificationConfidence);
        matchConfidence = clamp(matchConfidence);
        candidates = candidates == null ? List.of() : List.copyOf(candidates.size() > MAX_CANDIDATES ? candidates.subList(0, MAX_CANDIDATES) : candidates);
        evidence = evidence == null ? "" : (evidence.length() > MAX_EVIDENCE ? evidence.substring(0, MAX_EVIDENCE) : evidence);
        if (matchKind == null) matchKind = MatchKind.NONE;
    }

    /** True when two or more applications were too close to choose between (nothing was chosen). */
    public boolean ambiguous() {
        return matchKind == MatchKind.AMBIGUOUS || (matchedApplicationId == null && candidates.size() > 1);
    }

    private static int clamp(int v) {
        return Math.max(0, Math.min(100, v));
    }
}
