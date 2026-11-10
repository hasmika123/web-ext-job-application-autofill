package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * The read side of the Employees board (X4.3 / X4.6): the table rows, the KPI tiles and the detail sheet. Every figure comes from the
 * database; a field the caller may not see is {@code null} (summary projection), never a placeholder. No phone, no date of birth, no
 * government id and no resume or application data of a member appears here (person-owned data stays behind the member's consent).
 */
public final class MemberDTO {

    private MemberDTO() {}

    /** A department or a team. */
    public record GroupRef(Long id, String name) {}

    /** A person: a manager, or the actor of an audit row. */
    public record PersonRef(Long memberId, String name, String avatarUrl) {}

    /** One role the seat holds; exactly one is primary. */
    public record RoleRef(Long roleId, String key, String name, boolean primary) {}

    /** INVITED only: when the invitation lapses. */
    public record InviteMeta(Instant expiresAt, boolean expired) {}

    /** One row of the table. {@code summaryOnly} rows carry no work email and no manager (the caller reaches them only through a summary scope). */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record Row(
        Long id,
        String name,
        String initials,
        String workEmail,
        String avatarUrl,
        String status,
        String title,
        List<RoleRef> roles,
        GroupRef department,
        GroupRef team,
        PersonRef manager,
        Instant joinedAt,
        Instant lastActiveAt,
        String consentScope,
        InviteMeta invite,
        boolean summaryOnly
    ) {}

    /** {@code PageDTO} of 40-api-specs.md section 7. */
    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /**
     * One KPI tile. {@code previous} is the figure one month ago rebuilt from the seats' own timestamps and the audit trail; it is
     * {@code null} (and so are the deltas) when that history genuinely does not exist, never a guess.
     */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent) {
        public static Tile of(long value, Long previous) {
            if (previous == null) return new Tile(value, null, null, null);
            long d = value - previous;
            Double pct = previous == 0 ? null : Math.round(1000.0 * d / previous) / 10.0;
            return new Tile(value, previous, d, pct);
        }
    }

    /**
     * The tiles of the board. {@code asOf} is the instant "last month" means (one calendar month before the call). {@code scope} says what
     * the figures cover: ORG (the whole organization) or a narrower scope (only the seats the caller reaches; groups are then the distinct
     * groups of those seats and carry no history).
     */
    public record Counts(Instant asOf, String scope, Tile total, Tile active, Tile invited, Tile suspended, Tile departments, Tile teams) {}

    /** What the signed-in caller may do with this one seat (the sheet shows exactly these actions; the server enforces them again on every call). */
    public record Actions(boolean edit, boolean manageRoles, boolean suspend, boolean reinstate, boolean offboard, boolean viewActivity) {}

    /** A scheduled last day, when one is pending. */
    public record ScheduledOffboarding(Long id, Instant effectiveAt, String reason, Instant createdAt) {}

    /** One audit row about, or by, a member. */
    public record ActivityItem(Long id, Instant at, PersonRef actor, String action, String risk, String targetType, String summary) {}

    public record ActivityPage(String direction, List<ActivityItem> items, int page, int size, long total, boolean hasNext) {}

    /**
     * The detail sheet. {@code phone}, {@code location} and {@code timezone} are {@code null}: the platform stores none of them for an
     * organization member today (the profile story X2.7 adds them), and the sheet shows them only when present. {@code consent} is the scope
     * the person chose ({@code NONE}, {@code SUMMARY} or {@code FULL}); what is behind FULL stays behind the consent check.
     */
    public record Detail(
        Long id,
        String name,
        String initials,
        String workEmail,
        String phone,
        String location,
        String timezone,
        String avatarUrl,
        String status,
        Instant statusSince,
        String title,
        List<RoleRef> roles,
        String primaryRoleKey,
        GroupRef department,
        GroupRef team,
        PersonRef manager,
        List<PersonRef> directReports,
        Instant joinedAt,
        Instant lastActiveAt,
        Instant leftAt,
        String consentScope,
        PersonRef consentFullTo,
        InviteMeta invite,
        ScheduledOffboarding scheduledOffboarding,
        Actions actions,
        List<ActivityItem> recentActivity,
        boolean summaryOnly,
        String version
    ) {}
}
