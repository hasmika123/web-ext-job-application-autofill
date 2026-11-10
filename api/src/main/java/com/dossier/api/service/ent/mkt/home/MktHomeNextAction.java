package com.dossier.api.service.ent.mkt.home;

import com.dossier.api.service.ent.mkt.home.MktHomeDto.Chip;

/**
 * THE one place where a consultant's "Next Action" chip on the Home board is decided. First rule that applies wins:
 *
 * <pre>
 *   1. resume needs an update                          -> "Request Resume"     red     (the Resumes page records the request)
 *   2. available now AND has an ASSIGNED opportunity   -> "Submit to Job"      blue    (only OPENS the page; the consultant submits: E1)
 *   3. has SUGGESTED matches                           -> "Review Matches"     blue
 *   4. has an upcoming SCHEDULED interview             -> "Schedule Interview" blue
 *   5. has a follow-up due today or overdue            -> "Follow Up"          violet
 *   6. nothing applies                                 -> "No action"          blue
 * </pre>
 * Every label is a navigation or a record request; none submits anything for the consultant.
 */
public final class MktHomeNextAction {

    private MktHomeNextAction() {}

    public record Facts(boolean resumeNeedsUpdate, boolean availableNow, int assignedOpportunities, int suggestedMatches, boolean upcomingInterview, boolean followupDue) {}

    public static Chip of(Facts f) {
        if (f.resumeNeedsUpdate()) return new Chip("Request Resume", "red");
        if (f.availableNow() && f.assignedOpportunities() > 0) return new Chip("Submit to Job", "blue");
        if (f.suggestedMatches() > 0) return new Chip("Review Matches", "blue");
        if (f.upcomingInterview()) return new Chip("Schedule Interview", "blue");
        if (f.followupDue()) return new Chip("Follow Up", "violet");
        return new Chip("No action", "blue");
    }
}
