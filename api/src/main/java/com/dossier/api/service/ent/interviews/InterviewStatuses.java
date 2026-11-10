package com.dossier.api.service.ent.interviews;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The statuses of an interview (docs/enterprise-v2/page-interviews.md). Every status is a RECORD of what happened outside Kiwiply: nobody
 * attends or runs an interview here. SCHEDULED may be recorded as IN_PROGRESS (it started), COMPLETED or CANCELLED; IN_PROGRESS as
 * COMPLETED or CANCELLED. A cancelled interview comes back only through Reschedule (a new time, back to SCHEDULED); a mistaken change is
 * reverted by the Undo (a STATUS_REVERT event), never by a free backward move.
 */
public final class InterviewStatuses {

    private InterviewStatuses() {}

    public static final String SCHEDULED = "SCHEDULED";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String COMPLETED = "COMPLETED";
    public static final String CANCELLED = "CANCELLED";

    public static final List<String> ORDER = List.of(SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED);
    public static final Map<String, String> LABELS = Map.of(SCHEDULED, "Scheduled", IN_PROGRESS, "In Progress", COMPLETED, "Completed", CANCELLED, "Cancelled");
    public static final List<String> MODES = List.of("VIDEO", "ONSITE", "PHONE");
    public static final Map<String, String> MODE_LABELS = Map.of("VIDEO", "Video", "ONSITE", "Onsite", "PHONE", "Phone");
    public static final List<String> RECOMMENDATIONS = List.of("ADVANCE", "HOLD", "DECLINE");
    /** Event types that carry a status: the status after one of them is its {@code to_status}. */
    public static final Set<String> STATE_EVENTS = Set.of("CREATED", "STATUS", "STATUS_REVERT", "RESCHEDULE");
    /** The events of the timeline tab: what happened to the interview itself. */
    public static final Set<String> TIMELINE_EVENTS = Set.of("CREATED", "STATUS", "STATUS_REVERT", "RESCHEDULE", "REMINDER", "FEEDBACK");

    public static boolean valid(String s) {
        return s != null && ORDER.contains(s);
    }

    public static String label(String s) {
        return LABELS.getOrDefault(s, s);
    }

    /** The statuses an interview at {@code from} may be recorded as moving to. */
    public static List<String> next(String from) {
        return switch (from == null ? "" : from) {
            case SCHEDULED -> List.of(IN_PROGRESS, COMPLETED, CANCELLED);
            case IN_PROGRESS -> List.of(COMPLETED, CANCELLED);
            default -> List.of();
        };
    }

    public static boolean allowed(String from, String to) {
        return next(from).contains(to);
    }

    /** Open means it can still be rescheduled or cancelled. */
    public static boolean open(String status) {
        return SCHEDULED.equals(status) || IN_PROGRESS.equals(status);
    }

    /** The next step shown when nobody wrote one: a suggestion, not a fact. */
    public static String defaultNextStep(String status, boolean hasFeedback) {
        return switch (status == null ? "" : status) {
            case SCHEDULED -> "Send prep materials";
            case IN_PROGRESS -> "Complete feedback";
            case COMPLETED -> hasFeedback ? "Share results" : "Add feedback";
            case CANCELLED -> "Reschedule";
            default -> "";
        };
    }
}
