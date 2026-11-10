package com.dossier.api.service.ent.applications;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The stage machine of an application (docs/enterprise-v2/32-applications.md). A stage change is a RECORD of what happened outside Kiwiply:
 * "Submitted" means the consultant submitted it, never that Kiwiply did. Moves go forward (a stage may be skipped when the record is
 * catching up) and any open stage may close with a reason; a closed application stays closed. A mistaken move is reverted by the Undo
 * (a STAGE_REVERT event), never by a free backward move.
 */
public final class ApplicationStages {

    private ApplicationStages() {}

    public static final String ASSIGNED = "ASSIGNED";
    public static final String SUBMITTED = "SUBMITTED";
    public static final String UNDER_REVIEW = "UNDER_REVIEW";
    public static final String INTERVIEWING = "INTERVIEWING";
    public static final String OFFER = "OFFER";
    public static final String CLOSED = "CLOSED";

    public static final List<String> ORDER = List.of(ASSIGNED, SUBMITTED, UNDER_REVIEW, INTERVIEWING, OFFER, CLOSED);
    public static final Set<String> CLOSE_REASONS = Set.of("HIRED", "REJECTED", "WITHDRAWN", "NO_RESPONSE");
    public static final List<String> IN_REVIEW = List.of(SUBMITTED, UNDER_REVIEW);

    /** The state-carrying event types: the stage after one of them is its {@code to_stage}. */
    public static final List<String> STATE_EVENTS = List.of("CREATED", "STAGE_CHANGE", "STAGE_REVERT");

    public static final Map<String, String> LABELS = Map.of(
        ASSIGNED, "Assigned", SUBMITTED, "Submitted", UNDER_REVIEW, "Under Review", INTERVIEWING, "Interviewing", OFFER, "Offer", CLOSED, "Closed"
    );

    public static boolean valid(String stage) {
        return stage != null && ORDER.contains(stage);
    }

    public static int index(String stage) {
        return ORDER.indexOf(stage);
    }

    /** The stages an application at {@code from} may be recorded as moving to. */
    public static List<String> next(String from) {
        int i = index(from);
        List<String> out = new ArrayList<>();
        if (i < 0 || from.equals(CLOSED)) return out;
        for (int j = i + 1; j < ORDER.size(); j++) out.add(ORDER.get(j));
        return out;
    }

    public static boolean allowed(String from, String to) {
        return next(from).contains(to);
    }

    public static String label(String stage) {
        return LABELS.getOrDefault(stage, stage);
    }
}
