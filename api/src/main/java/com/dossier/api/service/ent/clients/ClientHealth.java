package com.dossier.api.service.ent.clients;

import java.time.Duration;
import java.time.Instant;

/**
 * The health badge of a client, computed from its rows (never stored, never typed in). The thresholds are organization settings
 * ({@link ClientsSettings}: {@code org.clients.healthy_days}, default 14, and {@code org.clients.at_risk_days}, default 45).
 *
 * <pre>
 *   quiet     = days since the client's last activity (the newest of: the account's own change, a requirement posted or changed,
 *               an application moving, a placement, a contact added, a relationship note)
 *   in flight = the client has an open requirement or a consultant currently placed
 *
 *   status INACTIVE or PROSPECT              -> NEUTRAL  (not being worked, nothing to judge)
 *   quiet >= at-risk days                    -> AT_RISK  (an account that went silent, whatever is open)
 *   quiet <= healthy days and in flight      -> HEALTHY
 *   anything else                            -> NEUTRAL  (quiet for a while but not yet worrying, or nothing in flight)
 * </pre>
 * Pure: pass the numbers and "now". {@code reason} is the sentence the drawer shows beside the badge.
 */
public final class ClientHealth {

    public static final String HEALTHY = "HEALTHY";
    public static final String AT_RISK = "AT_RISK";
    public static final String NEUTRAL = "NEUTRAL";

    private ClientHealth() {}

    public record Result(String level, String reason) {}

    public static Result of(String status, Instant lastActivity, long openRequirements, long activeConsultants, Instant now, ClientsSettings.Thresholds t) {
        if ("INACTIVE".equals(status)) return new Result(NEUTRAL, "Marked inactive, so it is not rated.");
        if ("PROSPECT".equals(status)) return new Result(NEUTRAL, "A prospect, so it is not rated yet.");
        long quiet = lastActivity == null ? Long.MAX_VALUE : Math.max(0, Duration.between(lastActivity, now).toDays());
        if (quiet >= t.atRiskDays()) return new Result(AT_RISK, quiet == Long.MAX_VALUE ? "No activity recorded yet." : "No activity for " + quiet + " days (at risk from " + t.atRiskDays() + ").");
        boolean inFlight = openRequirements > 0 || activeConsultants > 0;
        if (quiet <= t.healthyDays() && inFlight) return new Result(HEALTHY, "Active within " + t.healthyDays() + " days with work in flight.");
        if (!inFlight) return new Result(NEUTRAL, "Nothing open or placed right now.");
        return new Result(NEUTRAL, "Quiet for " + quiet + " days (healthy within " + t.healthyDays() + ", at risk from " + t.atRiskDays() + ").");
    }
}
