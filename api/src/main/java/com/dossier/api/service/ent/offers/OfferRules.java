package com.dossier.api.service.ent.offers;

import com.dossier.api.domain.ent.consultantws.CwsOffer;
import java.time.LocalDate;
import java.util.Map;
import java.util.Set;

/**
 * The pure rules of an offer (docs/enterprise-v2/page-accounts-offers.md). No database. The org speaks of seven states; the stored column keeps the
 * consultant-side names the Offers page shipped with, so DRAFT, PENDING_REVIEW (EXTENDED), NEGOTIATION (NEGOTIATING), ACCEPTED, DECLINED, EXPIRED and
 * WITHDRAWN are all valid stored values and nothing already stored changes meaning.
 *
 * <pre>
 *   DRAFT -> EXTENDED        the org records that the client extended it          (org)
 *   EXTENDED -> NEGOTIATING  the consultant asks to talk                           (consultant)
 *   EXTENDED | NEGOTIATING -> ACCEPTED | DECLINED                                  (consultant ONLY: consent)
 *   DRAFT | EXTENDED | NEGOTIATING -> WITHDRAWN                                    (org)
 *   EXTENDED | NEGOTIATING -> EXPIRED                                              (nightly job, deadline passed)
 *   NEGOTIATING -> EXTENDED  the org revised the terms, the consultant sees them    (org, "terms updated")
 * </pre>
 */
public final class OfferRules {

    private OfferRules() {}

    public static final String DRAFT = "DRAFT";
    public static final String EXTENDED = "EXTENDED";
    public static final String NEGOTIATING = "NEGOTIATING";
    public static final String ACCEPTED = "ACCEPTED";
    public static final String DECLINED = "DECLINED";
    public static final String EXPIRED = "EXPIRED";
    public static final String WITHDRAWN = "WITHDRAWN";

    public static final Set<String> RATE_PERIODS = Set.of("HOUR", "DAY", "MONTH", "YEAR");
    public static final Set<String> WORK_MODES = Set.of("REMOTE", "HYBRID", "ONSITE");

    private static final Map<String, String> LABEL = Map.of(
        DRAFT, "Draft", EXTENDED, "Extended", NEGOTIATING, "Negotiating", ACCEPTED, "Accepted", DECLINED, "Declined", EXPIRED, "Expired", WITHDRAWN, "Withdrawn"
    );

    /** The org-side state of a stored status, with the deadline applied: an open offer past its deadline day reads EXPIRED even before the job runs. */
    public static String state(String stored, LocalDate deadline, LocalDate today) {
        String s = switch (stored == null ? "" : stored) {
            case CwsOffer.DRAFT -> DRAFT;
            case CwsOffer.PENDING_REVIEW -> EXTENDED;
            case CwsOffer.NEGOTIATION -> NEGOTIATING;
            case CwsOffer.ACCEPTED -> ACCEPTED;
            case CwsOffer.DECLINED -> DECLINED;
            case CwsOffer.WITHDRAWN -> WITHDRAWN;
            default -> EXPIRED;
        };
        return isOpen(s) && deadline != null && deadline.isBefore(today) ? EXPIRED : s;
    }

    public static String label(String state) {
        return LABEL.getOrDefault(state, state);
    }

    /** Waiting on the consultant. */
    public static boolean isOpen(String state) {
        return EXTENDED.equals(state) || NEGOTIATING.equals(state);
    }

    /** The org may revise the terms of a draft or of an open offer (not of one the consultant already answered, and not of a closed one). */
    public static boolean canEdit(String state) {
        return DRAFT.equals(state) || isOpen(state);
    }

    public static boolean canWithdraw(String state) {
        return DRAFT.equals(state) || isOpen(state);
    }

    public static boolean canExtend(String state) {
        return DRAFT.equals(state);
    }

    /** Stored statuses an expiry sweep may close. */
    public static final java.util.List<String> OPEN_STORED = java.util.List.of(CwsOffer.PENDING_REVIEW, CwsOffer.NEGOTIATION);
}
