package com.dossier.api.service.ent.placements;

import com.dossier.api.service.dto.ent.PlacementDTO;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** The pure rules of the Placements board: the status a row shows, the Next Action pill, the engagement timeline. No database, easy to test. */
public final class PlacementRules {

    private PlacementRules() {}

    public static final String ACTIVE = "ACTIVE";
    public static final String UPCOMING = "UPCOMING";
    public static final String ENDED = "ENDED";
    /** The stored status of a placement that has not been completed. */
    public static final String STORED_ACTIVE = "ACTIVE";
    public static final String STORED_PENDING = "PENDING_START";
    public static final String STORED_ENDED = "ENDED";

    public static final Set<String> TYPES = Set.of("CONTRACT", "FTE", "C2C");
    public static final Set<String> RATE_UNITS = Set.of("HOUR", "DAY", "MONTH", "YEAR");

    public static final String EXT_REQUESTED = "REQUESTED";
    public static final String EXT_APPROVED = "APPROVED";
    public static final String EXT_DECLINED = "DECLINED";
    public static final String EXT_CANCELLED = "CANCELLED";

    /** What the row says: ENDED once completed, UPCOMING while the start date is ahead, ACTIVE otherwise (no daily job has to flip it). */
    public static String effectiveStatus(String stored, LocalDate start, LocalDate today) {
        if (STORED_ENDED.equals(stored)) return ENDED;
        return start != null && start.isAfter(today) ? UPCOMING : ACTIVE;
    }

    public static String typeLabel(String type) {
        return switch (type == null ? "" : type) {
            case "FTE" -> "Full-time";
            case "C2C" -> "Corp-to-corp";
            default -> "Contract";
        };
    }

    private static String days(String lead, long n) {
        return n == 0 ? lead + " today" : lead + " in " + n + (n == 1 ? " day" : " days");
    }

    /**
     * The Next Action pill. Ending soon (inside {@code soonDays}) wins and is red inside {@code urgentDays} (an end date already past reads
     * "Ended N days ago": the placement still has to be completed); otherwise an extension waiting for a decision reads "Schedule review";
     * an upcoming start inside {@code startingDays} reads "Starts in N days"; a completed placement in the pool says so; everything else is "No action".
     */
    public static PlacementDTO.NextAction nextAction(String effective, LocalDate start, LocalDate end, boolean inPool, boolean extensionPending, LocalDate today, int soonDays, int urgentDays, int startingDays) {
        if (ENDED.equals(effective)) {
            return inPool ? new PlacementDTO.NextAction("POOL", "In redeployment pool", "blue", null) : none();
        }
        if (UPCOMING.equals(effective)) {
            long n = ChronoUnit.DAYS.between(today, start);
            return n <= startingDays ? new PlacementDTO.NextAction("STARTS_IN", days("Starts", n), "blue", (int) n) : none();
        }
        if (end != null) {
            long left = ChronoUnit.DAYS.between(today, end);
            if (left < 0) return new PlacementDTO.NextAction("ENDED_AGO", "Ended " + (-left) + (left == -1 ? " day ago" : " days ago"), "red", (int) left);
            if (left <= soonDays) return new PlacementDTO.NextAction("ENDS_IN", days("Ends", left), left <= urgentDays ? "red" : "amber", (int) left);
        }
        if (extensionPending) return new PlacementDTO.NextAction("REVIEW", "Schedule review", "blue", null);
        return none();
    }

    public static PlacementDTO.NextAction none() {
        return new PlacementDTO.NextAction("NONE", "No action", "neutral", null);
    }

    /** Start, the day halfway between, end, and how far today is along it (0 to 100). Open-ended placements have only a start. */
    public static PlacementDTO.Engagement engagement(LocalDate start, LocalDate end, LocalDate today) {
        if (end == null || !end.isAfter(start)) return new PlacementDTO.Engagement(start, null, end, null, null, null);
        long total = ChronoUnit.DAYS.between(start, end);
        long done = ChronoUnit.DAYS.between(start, today);
        int percent = (int) Math.max(0, Math.min(100, Math.round(100.0 * done / total)));
        return new PlacementDTO.Engagement(start, start.plusDays(total / 2), end, percent, (int) ChronoUnit.DAYS.between(today, end), (int) total);
    }

    /** The day a consultant is available again: the chosen redeployment date, else the day after the end date. Null when open-ended. */
    public static LocalDate availableFrom(LocalDate redeploymentDate, LocalDate end) {
        if (redeploymentDate != null) return redeploymentDate;
        return end == null ? null : end.plusDays(1);
    }

    /** Initials for a client tile: up to two letters from the first words ("Global Media" is GM, "TechCorp" is TE). */
    public static String clientInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.strip().split("[\\s&/-]+");
        if (parts.length >= 2) return ("" + parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase(Locale.ROOT);
        return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase(Locale.ROOT);
    }

    public static final List<String> STATUS_FILTERS = List.of("ACTIVE", "ENDING_SOON", "UPCOMING", "EXTENSION_REQUESTED", "IN_POOL", "COMPLETED");

    public static String statusFilterLabel(String v) {
        return switch (v) {
            case "ACTIVE" -> "Active";
            case "ENDING_SOON" -> "Ending soon";
            case "UPCOMING" -> "Upcoming";
            case "EXTENSION_REQUESTED" -> "Extension requested";
            case "IN_POOL" -> "In redeployment pool";
            default -> "Completed";
        };
    }
}
