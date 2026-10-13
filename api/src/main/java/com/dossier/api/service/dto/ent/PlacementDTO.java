package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The Placements board (docs/enterprise-v2/page-placements.md): table rows, KPI tiles, tab counts, the filter options and the detail drawer.
 * Every figure is read from {@code talent_placement} and its extension / note / event tables; a figure with no history behind it is {@code null},
 * never a guess. The bill rate is a RECORD (money is never moved) and is {@code null} for a caller who may not see rates. No sensitive PII appears
 * anywhere (no phone, date of birth or document numbers).
 */
public final class PlacementDTO {

    private PlacementDTO() {}

    public record PersonRef(Long id, String name, String initials, String subtitle) {}

    public record ClientRef(Long id, String name, String initials, String industry) {}

    /** An organization seat (account manager, note author, actor). */
    public record Member(Long memberId, String name, String initials) {}

    /** The "Next Action" pill: {@code kind} NONE, ENDS_IN, ENDED_AGO, STARTS_IN, REVIEW or POOL; {@code tone} neutral, amber, red or blue. */
    public record NextAction(String kind, String label, String tone, Integer days) {}

    public record Row(
        Long id,
        PersonRef consultant,
        ClientRef client,
        String roleTitle,
        String placementType,
        LocalDate startDate,
        LocalDate endDate,
        Member accountManager,
        String status,
        Long billRateMinor,
        String rateUnit,
        String currency,
        NextAction nextAction,
        boolean inPool,
        boolean extensionPending
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** One KPI tile: {@code previous} is the figure thirty days ago; null when no history reaches back that far. */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {
        public static Tile of(long value, Long previous, List<Long> series) {
            if (previous == null) return new Tile(value, null, null, null, series);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct, series);
        }
    }

    /** The four tab counts (Active, Upcoming, Completed, Extensions) and the windows the page is using (read from the organization's settings). */
    public record Tabs(long active, long upcoming, long completed, long extensions) {}

    public record Windows(int endingSoonDays, int endingUrgentDays, int startingSoonDays) {}

    public record Counts(Instant asOf, Instant seriesFrom, String scope, Tile active, Tile startingSoon, Tile endingSoon, Tile pool, Tabs tabs, Windows windows) {}

    public record Option(String value, String label) {}

    public record Filters(List<Option> clients, List<Option> roles, List<Option> managers, List<Option> types, List<Option> statuses) {}

    public record PickerItem(Long id, String label, String sub) {}

    public record Pickers(String kind, List<PickerItem> items) {}

    public record Contact(Long id, String name, String title) {}

    /** The three points of the Engagement Timeline; {@code percent} is how far today is between start and end (0 to 100); null dates mean open-ended. */
    public record Engagement(LocalDate start, LocalDate midpoint, LocalDate end, Integer percent, Integer daysLeft, Integer totalDays) {}

    public record ExtensionItem(Long id, String status, LocalDate fromEndDate, LocalDate requestedEndDate, String note, Member requestedBy, Member decidedBy, Instant createdAt, Instant decidedAt) {}

    public record EventItem(Long id, String type, Member actor, String detail, Instant at) {}

    public record NoteItem(Long id, Member author, String body, Instant createdAt) {}

    /** Post-Placement Availability: when the consultant is available again and whether they are in the redeployment pool. */
    public record Availability(boolean inPool, LocalDate availableFrom, Integer inDays, boolean onBench) {}

    /** What the caller may do with this placement (the page draws a control only when true; the API is the real gate). */
    public record Actions(boolean extend, boolean requestExtension, boolean complete, boolean redeploy, boolean addNote, boolean decideExtension) {}

    /** Present for a few minutes after the caller's own latest change: the id to send back to undo it. */
    public record UndoToken(Long eventId, Instant expiresAt, String kind) {}

    public record Detail(
        Long id,
        PersonRef consultant,
        ClientRef client,
        String roleTitle,
        String placementType,
        LocalDate startDate,
        LocalDate endDate,
        Integer endsInDays,
        Integer startsInDays,
        Member accountManager,
        Contact clientContact,
        String status,
        Long billRateMinor,
        String rateUnit,
        String currency,
        NextAction nextAction,
        Engagement engagement,
        boolean extensionPending,
        List<ExtensionItem> extensions,
        Availability availability,
        List<EventItem> timeline,
        List<NoteItem> notes,
        long notesCount,
        Actions actions,
        UndoToken undo
    ) {}

    /* ── request bodies: each one is bound strictly by the resource (an unknown property is refused) ─────────────────────── */

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record CreateRequest(
        Long consultantId,
        Long clientId,
        String roleTitle,
        String placementType,
        LocalDate startDate,
        LocalDate endDate,
        Long accountManagerMemberId,
        Long clientContactId,
        Long billRateMinor,
        String rateUnit,
        String note
    ) {}

    public record ExtendRequest(LocalDate endDate, String note) {}

    public record RequestExtensionRequest(LocalDate requestedEndDate, String note) {}

    /** {@code decision} is APPROVE (the end date moves to the requested one) or DECLINE. */
    public record DecideRequest(String decision) {}

    public record CompleteRequest(String note) {}

    /** {@code availableFrom} defaults to the day after the end date (or today when it has passed / is open-ended). */
    public record RedeployRequest(LocalDate availableFrom) {}

    public record NoteRequest(String body) {}

    public record UndoRequest(Long eventId) {}
}
