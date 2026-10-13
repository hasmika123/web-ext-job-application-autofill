package com.dossier.api.web.rest.ent;

import com.dossier.api.service.DemoGuard;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.ent.IdempotencyService;
import com.dossier.api.service.ent.members.OrgMemberLifecycleService;
import com.dossier.api.service.ent.members.OrgOffboardingService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The seat lifecycle (X4.4, 15-employees-and-teams.md sections 2 and 5): suspend, reinstate, offboard (now or on a scheduled last day) and the
 * wizard's preview. Every transition is guarded (not yourself, not above your rank, never the last owner or administrator), audited with its
 * reason and risk, and answers the generic 404 for a person the caller may not reach. Offboarding needs the typed confirmation of the person's
 * name and an {@code Idempotency-Key}.
 *
 * <p>Not here: inviting and revoking invitations (the invitation endpoints), transferring ownership, and the reassignment of consultants (the
 * assignments module). Activation is by acceptance only: an administrator cannot "activate" someone who has not accepted.
 */
@RestController
@RequestMapping("/api/orgs/{orgId}/members")
@Tag(name = "members", description = "Employees: the directory, KPI tiles, detail sheet, single edits, bulk actions and the lifecycle.")
public class OrgMemberLifecycleResource {

    private final OrgMemberLifecycleService lifecycle;
    private final OrgOffboardingService offboarding;
    private final IdempotencyService idempotency;
    private final DemoGuard demoGuard;

    public OrgMemberLifecycleResource(
        OrgMemberLifecycleService lifecycle,
        OrgOffboardingService offboarding,
        IdempotencyService idempotency,
        DemoGuard demoGuard
    ) {
        this.lifecycle = lifecycle;
        this.offboarding = offboarding;
        this.idempotency = idempotency;
        this.demoGuard = demoGuard;
    }

    @Operation(
        summary = "Suspend an employee",
        description = "members.suspend. Body: reason (10 to 500 characters, required). ACTIVE to SUSPENDED; the seat and records stay, the person is refused at the next call and refresh. 409 SELF, " +
            "409 INVALID_TRANSITION {from,to,allowed}, 409 LAST_ADMIN, 422 ROLE_CEILING (reason TARGET_RANK). Audit MEMBER_SUSPEND, risk HIGH. Idempotency-Key optional."
    )
    @PostMapping("/{memberId}/suspend")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.LifecycleResult> suspend(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) MemberActionDTO.ReasonRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        lifecycle.reachableForSuspend(me, memberId);
        return answer(idempotency.execute(me, key, false, "POST", request.getRequestURI(), body, 200, MemberActionDTO.LifecycleResult.class, () -> lifecycle.suspend(me, memberId, body == null ? null : body.reason())));
    }

    @Operation(
        summary = "Reinstate a suspended employee",
        description = "members.suspend. Body: reason (optional). SUSPENDED to ACTIVE. 409 INVALID_TRANSITION otherwise. Audit MEMBER_REINSTATE, risk MEDIUM. Idempotency-Key optional."
    )
    @PostMapping("/{memberId}/reinstate")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.LifecycleResult> reinstate(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody(required = false) MemberActionDTO.ReasonRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        lifecycle.reachableForSuspend(me, memberId);
        return answer(idempotency.execute(me, key, false, "POST", request.getRequestURI(), body, 200, MemberActionDTO.LifecycleResult.class, () -> lifecycle.reinstate(me, memberId, body == null ? null : body.reason())));
    }

    @Operation(
        summary = "What offboarding this employee will do",
        description = "members.remove. The wizard's first step: blockers (SELF, OWNER_MUST_TRANSFER, LAST_ADMIN, ROLE_CEILING, INVALID_TRANSITION), the lines of every offboarding hook in the order they run " +
            "(sessions, assignments, consent...), the roles that end, the consent that ends, what is kept, and the licence notice. Reads only."
    )
    @GetMapping("/{memberId}/offboard-preview")
    @OrgPermissionRequired
    public MemberActionDTO.OffboardPreview preview(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long memberId) {
        return offboarding.preview(me, memberId);
    }

    @Operation(
        summary = "Offboard an employee",
        description = "members.remove. Body: reason (10 to 500 characters), confirm (the person's name as the board shows it; 422 CONFIRM_MISMATCH), effectiveAt (absent or past = now; a future instant schedules the last day), " +
            "reassignments[] (recorded for the assignments module). ACTIVE or SUSPENDED to REMOVED: the ordered offboarding hooks run, role rows end, records are kept. 409 SELF, OWNER_MUST_TRANSFER, LAST_ADMIN, " +
            "INVALID_TRANSITION, OFFBOARDING_PENDING; 422 ROLE_CEILING. Audit MEMBER_REMOVE (risk HIGH) or MEMBER_OFFBOARD_SCHEDULED. Idempotency-Key required."
    )
    @PostMapping("/{memberId}/offboard")
    @OrgPermissionRequired
    public ResponseEntity<MemberActionDTO.LifecycleResult> offboard(
        @RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me,
        @PathVariable Long memberId,
        @RequestHeader(value = "Idempotency-Key", required = false) String key,
        @RequestBody MemberActionDTO.OffboardRequest body,
        HttpServletRequest request
    ) {
        demoGuard.assertNotDemo();
        offboarding.requireOffboardable(me, memberId); // the permission wall first
        return answer(idempotency.execute(me, key, true, "POST", request.getRequestURI(), body, 200, MemberActionDTO.LifecycleResult.class, () -> offboarding.offboard(me, memberId, body)));
    }

    @Operation(summary = "Scheduled last days", description = "members.remove. The pending offboardings of the people the caller may offboard, soonest first.")
    @GetMapping("/offboarding")
    @OrgPermissionRequired
    public MemberActionDTO.ScheduledList scheduled(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me) {
        return offboarding.scheduled(me);
    }

    @Operation(summary = "Cancel a scheduled last day", description = "members.remove. 404 for another organization's row; 409 when it already ran or was cancelled. Audit MEMBER_OFFBOARD_CANCELLED.")
    @DeleteMapping("/offboarding/{offboardingId}")
    @OrgPermissionRequired
    public ResponseEntity<Void> cancel(@RequestAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE) OrgMembership me, @PathVariable Long offboardingId) {
        demoGuard.assertNotDemo();
        offboarding.cancel(me, offboardingId);
        return ResponseEntity.noContent().build();
    }

    private static ResponseEntity<MemberActionDTO.LifecycleResult> answer(IdempotencyService.Outcome<MemberActionDTO.LifecycleResult> out) {
        ResponseEntity.BodyBuilder ok = ResponseEntity.status(out.status());
        if (out.replayed()) ok.header("Idempotent-Replayed", "true");
        return ok.body(out.body());
    }
}
