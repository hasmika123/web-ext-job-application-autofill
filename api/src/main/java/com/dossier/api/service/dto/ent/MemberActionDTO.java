package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The write side of the Employees board (X4.3 bulk actions, X4.4 lifecycle). Requests carry only the fields named here: an unknown
 * JSON property is refused (mass assignment, doc 42), and no request ever carries an organization id (the organization is the path).
 */
public final class MemberActionDTO {

    private MemberActionDTO() {}

    /** Most members one bulk call may name (15 section 3.2). */
    public static final int BULK_MAX = 500;

    public record BulkRolesRequest(List<Long> memberIds, List<Long> add, List<Long> remove, Long primaryRoleId) {}

    /** The placement every named member gets: a null field clears it; a team alone also sets the team's department. */
    public record BulkGroupsRequest(List<Long> memberIds, Long departmentGroupId, Long teamGroupId) {}

    /** A null {@code managerMemberId} clears the reporting line. */
    public record BulkManagerRequest(List<Long> memberIds, Long managerMemberId) {}

    /** {@code action} is SUSPEND or REINSTATE; SUSPEND needs a reason (10 to 500 characters). */
    public record BulkStatusRequest(List<Long> memberIds, String action, String reason) {}

    /** One member a bulk call did not change, and why (a machine code such as SELF, LAST_ADMIN, NOT_FOUND, ROLE_CEILING, MANAGER_CYCLE). */
    public record Skipped(Long memberId, String reason) {}

    /** The outcome for one member; {@code previous} holds what the member had before, so the web can send the reverse call as its Undo. */
    public record RowResult(Long memberId, boolean ok, String reason, Map<String, Object> previous) {}

    /** {@code ok} members changed, the others skipped with a reason; {@code ok + skipped == requested}. One audit row per changed member plus one MEMBER_BULK summary row. */
    public record BulkResult(String action, int requested, int ok, List<Skipped> skipped, List<RowResult> results) {}

    /** The body of a suspend (reason required, 10 to 500 characters) or a reinstate (reason optional). */
    public record ReasonRequest(String reason) {}

    /** One consultant of the person being offboarded and who takes over (the hook that owns assignments applies it; until X4.7 it is recorded only). */
    public record Reassignment(Long consultantMemberId, Long newAssigneeMemberId) {}

    /**
     * Offboards a member. {@code effectiveAt} null or not in the future = now; a future instant schedules the removal. {@code confirm} is the
     * member's name exactly as the board shows it (the typed-confirm the web's ConfirmTypedSheet collects); the server compares it case-insensitively.
     */
    public record OffboardRequest(String reason, Instant effectiveAt, String confirm, List<Reassignment> reassignments) {}

    /** One thing that will happen (or happened) because of an offboarding, from the hook chain. */
    public record HookLine(String hook, String kind, String text, Map<String, Object> data) {}

    /** A reason the offboarding cannot go ahead as asked (OWNER_MUST_TRANSFER, LAST_ADMIN, SELF, SEAT_STATE). */
    public record Blocker(String code, String message) {}

    /** What an offboarding will do, before anyone confirms (15 section 5, step 1). The same hooks run for the preview and the apply. */
    public record OffboardPreview(
        Long memberId,
        String name,
        String status,
        List<Blocker> blockers,
        List<HookLine> lines,
        List<String> rolesEnded,
        String consentScope,
        List<String> recordsKept,
        String licenseNotice
    ) {}

    /** The outcome of a suspend, a reinstate or an offboard. {@code scheduled} is set when the removal was scheduled for a future day. */
    public record LifecycleResult(
        Long memberId,
        String action,
        String previousStatus,
        String status,
        MemberDTO.ScheduledOffboarding scheduled,
        List<HookLine> lines
    ) {}

    public record ScheduledList(List<Scheduled> items) {}

    public record Scheduled(Long id, Long memberId, String name, Instant effectiveAt, String reason, Instant createdAt) {}
}
