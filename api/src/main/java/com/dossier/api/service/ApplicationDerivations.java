package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.dto.ApplicationDTO;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

/**
 * Things the tracker shows that are worked out, never stored (applications-inbox.md section 2):
 * "ghosted" and the "next step". Pure functions, so the boundaries are unit-tested without a database.
 */
public final class ApplicationDerivations {

    private ApplicationDerivations() {}

    /**
     * Applied or in review, not archived, and nothing has happened for more than {@code days} days.
     * Strictly more: an application whose last event was exactly {@code days} days ago is not ghosted yet.
     * Terminal and early states (DRAFT, SAVED, INTERVIEW, OFFER, REJECTED, WITHDRAWN) are never ghosted.
     *
     * @param lastEventAt the newest event; {@code fallback} (the row's last update) stands in when none was recorded
     */
    public static boolean isGhosted(
        ApplicationStatus status,
        boolean archived,
        Instant lastEventAt,
        Instant fallback,
        Instant now,
        int days
    ) {
        if (archived || (status != ApplicationStatus.APPLIED && status != ApplicationStatus.IN_REVIEW)) return false;
        Instant last = lastEventAt != null ? lastEventAt : fallback;
        if (last == null) return false;
        return last.isBefore(now.minus(Duration.ofDays(days)));
    }

    public static boolean isGhosted(Application a, Instant now, int days) {
        return isGhosted(a.getStatus(), Boolean.TRUE.equals(a.getArchived()), a.getLastEventAt(), a.getUpdatedAt(), now, days);
    }

    /** The label an interview shows as the next step ("Video interview"). */
    public static String interviewLabel(String kind) {
        if (kind == null) return "Interview";
        return switch (kind.toUpperCase(Locale.ROOT)) {
            case "PHONE" -> "Phone interview";
            case "VIDEO" -> "Video interview";
            case "ONSITE" -> "Onsite interview";
            case "TECHNICAL" -> "Technical interview";
            case "BEHAVIORAL" -> "Behavioral interview";
            case "PANEL" -> "Panel interview";
            default -> "Interview";
        };
    }

    /**
     * What happens next: the soonest future interview; an OFFER's "Review offer"; the user's own next
     * action; otherwise nothing (the UI shows a dash). In that order.
     *
     * @param nextInterviewAt   start of the soonest interview at or after now, or null
     * @param nextInterviewKind its kind
     */
    public static ApplicationDTO.NextStep nextStep(
        ApplicationStatus status,
        String nextAction,
        Instant nextActionAt,
        Instant nextInterviewAt,
        String nextInterviewKind
    ) {
        if (nextInterviewAt != null) return new ApplicationDTO.NextStep(interviewLabel(nextInterviewKind), nextInterviewAt);
        if (status == ApplicationStatus.OFFER) return new ApplicationDTO.NextStep("Review offer", null);
        if (nextAction != null && !nextAction.isBlank()) return new ApplicationDTO.NextStep(nextAction.trim(), nextActionAt);
        return null;
    }

    /** Plain words for a status, for timeline summaries. */
    public static String statusLabel(ApplicationStatus s) {
        if (s == null) return "";
        return switch (s) {
            case DRAFT -> "Draft";
            case SAVED -> "Saved";
            case APPLIED -> "Applied";
            case IN_REVIEW -> "In review";
            case INTERVIEW -> "Interview";
            case OFFER -> "Offer";
            case REJECTED -> "Rejected";
            case WITHDRAWN -> "Withdrawn";
        };
    }
}
