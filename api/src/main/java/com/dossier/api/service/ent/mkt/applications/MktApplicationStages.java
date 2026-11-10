package com.dossier.api.service.ent.mkt.applications;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

/**
 * THE one place where the stored application stage maps to the six stages of the Applications board. Nothing else in the Marketing
 * workspace (service, DTO, web) may re-derive it; the web only mirrors the labels from the response.
 *
 * <pre>
 *   Applied            = ASSIGNED + SUBMITTED
 *   Awaiting Response  = UNDER_REVIEW
 *   Interviewing       = INTERVIEWING
 *   Offer              = OFFER
 *   Hired              = CLOSED with closed_reason HIRED
 *   Not Selected       = CLOSED with closed_reason REJECTED, NO_RESPONSE or WITHDRAWN (a CLOSED row without a reason counts here too)
 * </pre>
 */
public final class MktApplicationStages {

    private MktApplicationStages() {}

    public enum Group {
        APPLIED("applied", "Applied", 0),
        AWAITING("awaiting", "Awaiting Response", 1),
        INTERVIEWING("interviewing", "Interviewing", 2),
        OFFER("offer", "Offer", 3),
        HIRED("hired", "Hired", 4),
        NOT_SELECTED("not_selected", "Not Selected", -1);

        private final String key;
        private final String label;
        private final int rank;

        Group(String key, String label, int rank) {
            this.key = key;
            this.label = label;
            this.rank = rank;
        }

        public String key() {
            return key;
        }

        public String label() {
            return label;
        }

        /** Position in the funnel (Applied 0 .. Hired 4); Not Selected has none (-1): how far it got is read from its history. */
        public int rank() {
            return rank;
        }

        public static Optional<Group> ofKey(String key) {
            return Arrays.stream(values()).filter(g -> g.key.equals(key)).findFirst();
        }
    }

    public static final String CLOSED = "CLOSED";
    public static final Set<String> NOT_SELECTED_REASONS = Set.of("REJECTED", "NO_RESPONSE", "WITHDRAWN");

    /** The board stage of a stored (stage, closed_reason) pair. An unknown stage reads as Applied (never throws on odd data). */
    public static Group of(String stage, String closedReason) {
        if (stage == null) return Group.APPLIED;
        return switch (stage) {
            case "UNDER_REVIEW" -> Group.AWAITING;
            case "INTERVIEWING" -> Group.INTERVIEWING;
            case "OFFER" -> Group.OFFER;
            case CLOSED -> "HIRED".equals(closedReason) ? Group.HIRED : Group.NOT_SELECTED;
            default -> Group.APPLIED;
        };
    }

    /** The stored stage a RECORDED change to {@code g} writes (Applied is SUBMITTED: the consultant has submitted). */
    public static String storedStage(Group g) {
        return switch (g) {
            case APPLIED -> "SUBMITTED";
            case AWAITING -> "UNDER_REVIEW";
            case INTERVIEWING -> "INTERVIEWING";
            case OFFER -> "OFFER";
            case HIRED, NOT_SELECTED -> CLOSED;
        };
    }

    /** The funnel position a history entry (an event's to_stage; the reason is not on events) proves: open stages by name, CLOSED proves none. */
    public static int rankOfStage(String stage) {
        return switch (stage == null ? "" : stage) {
            case "UNDER_REVIEW" -> 1;
            case "INTERVIEWING" -> 2;
            case "OFFER" -> 3;
            case "ASSIGNED", "SUBMITTED" -> 0;
            default -> -1;
        };
    }
}
