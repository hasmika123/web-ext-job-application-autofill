package com.dossier.api.service.ent.members;

import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MemberActionDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Suspend and reinstate (X4.4, 15-employees-and-teams.md section 2): the two reversible seat transitions.
 *
 * <ul>
 *   <li><b>Suspend</b> ACTIVE to SUSPENDED: the seat, the roles and the records are kept; the person is refused at the next call and the next session
 *       refresh (every organization call needs an ACTIVE seat). Needs {@code members.suspend}; a reason of 10 to 500 characters; never the caller
 *       themselves; the rank rule and the last-administrator guard of {@link MemberGuards}. Audit {@code MEMBER_SUSPEND}, risk HIGH.</li>
 *   <li><b>Reinstate</b> SUSPENDED to ACTIVE with an optional reason. Audit {@code MEMBER_REINSTATE}, risk MEDIUM.</li>
 * </ul>
 *
 * Anything else is {@code 409 INVALID_TRANSITION {from, to, allowed[]}}. An unreachable or foreign member is the generic 404 before any of that.
 */
@Service
public class OrgMemberLifecycleService {

    public static final String CODE_INVALID_TRANSITION = "INVALID_TRANSITION";
    public static final int REASON_MIN = 10;
    public static final int REASON_MAX = 500;

    private final OrgMemberRepository members;
    private final MemberAccess access;
    private final MemberGuards guards;
    private final OrgMemberEditService edit;

    // Field-injected and optional (O4, doc 19 S8): absent in hand-wired tests, where a suspension only changes the seat.
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private EnterpriseAccountLifecycle accounts;

    public OrgMemberLifecycleService(OrgMemberRepository members, MemberAccess access, MemberGuards guards, OrgMemberEditService edit) {
        this.members = members;
        this.access = access;
        this.guards = guards;
        this.edit = edit;
    }

    @Transactional
    public MemberActionDTO.LifecycleResult suspend(OrgMembership me, Long memberId, String reason) {
        access.requireWritable(me, MemberAccess.KEY_SUSPEND);
        OrgMember seat = reachable(me, memberId, MemberAccess.KEY_SUSPEND);
        String text = requireReason(reason);
        OrgMemberStatus before = seat.getStatus();
        suspendSeat(me, seat, text);
        return new MemberActionDTO.LifecycleResult(seat.getId(), "SUSPEND", before.name(), seat.getStatus().name(), null, List.of());
    }

    @Transactional
    public MemberActionDTO.LifecycleResult reinstate(OrgMembership me, Long memberId, String reason) {
        access.requireWritable(me, MemberAccess.KEY_SUSPEND);
        OrgMember seat = reachable(me, memberId, MemberAccess.KEY_SUSPEND);
        String text = optionalReason(reason);
        OrgMemberStatus before = seat.getStatus();
        reinstateSeat(me, seat, text);
        return new MemberActionDTO.LifecycleResult(seat.getId(), "REINSTATE", before.name(), seat.getStatus().name(), null, List.of());
    }

    /** The permission wall of suspend and reinstate, on its own so the endpoint can refuse before it reads any header. */
    @Transactional(readOnly = true)
    public void reachableForSuspend(OrgMembership me, Long memberId) {
        access.requireWritable(me, MemberAccess.KEY_SUSPEND);
        reachable(me, memberId, MemberAccess.KEY_SUSPEND);
    }

    /** The seat, when it exists in this organization and the caller holds {@code key} at a scope covering it; otherwise the generic 404. */
    OrgMember reachable(OrgMembership me, Long memberId, String key) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED || !access.canAct(me, key, seat.getId())) throw new OrgNotFoundException();
        return seat;
    }

    /** The transition itself (also used per row by the bulk call): guards, status, audit. */
    void suspendSeat(OrgMembership me, OrgMember seat, String reason) {
        guards.requireNotSelf(me, seat);
        if (seat.getStatus() != OrgMemberStatus.ACTIVE) throw invalid(seat.getStatus(), OrgMemberStatus.SUSPENDED, List.of(OrgMemberStatus.ACTIVE));
        guards.requireRank(me, seat);
        guards.requireNotLastAdmin(me.orgId(), seat);
        seat.setStatus(OrgMemberStatus.SUSPENDED);
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("from", OrgMemberStatus.ACTIVE.name());
        details.put("to", OrgMemberStatus.SUSPENDED.name());
        details.put("reason", reason);
        edit.record(me, OrgAuditService.MEMBER_SUSPEND, seat, details, "HIGH");
        if (accounts != null) accounts.disable(me.orgId(), seat, me.login(), me.role(), "SUSPEND"); // an enterprise account: sessions revoked at once
    }

    void reinstateSeat(OrgMembership me, OrgMember seat, String reason) {
        guards.requireNotSelf(me, seat);
        if (seat.getStatus() != OrgMemberStatus.SUSPENDED) throw invalid(seat.getStatus(), OrgMemberStatus.ACTIVE, List.of(OrgMemberStatus.SUSPENDED));
        seat.setStatus(OrgMemberStatus.ACTIVE);
        members.saveAndFlush(seat);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("from", OrgMemberStatus.SUSPENDED.name());
        details.put("to", OrgMemberStatus.ACTIVE.name());
        details.put("reason", reason);
        edit.record(me, MemberAuditActions.MEMBER_REINSTATE, seat, details, "MEDIUM");
        if (accounts != null) accounts.enable(me.orgId(), seat, me.login(), me.role());
    }

    static OrgException invalid(OrgMemberStatus from, OrgMemberStatus to, List<OrgMemberStatus> allowedFrom) {
        Map<String, Object> extra = new LinkedHashMap<>();
        extra.put("from", from.name());
        extra.put("to", to.name());
        extra.put("allowed", allowedFrom.stream().map(Enum::name).toList());
        return OrgException.coded(409, CODE_INVALID_TRANSITION, "A " + from + " member cannot become " + to, extra);
    }

    /** A reason of 10 to 500 characters, with nothing the platform never collects in it. */
    public static String requireReason(String raw) {
        String t = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (t.length() < REASON_MIN) throw OrgException.invalid("reason", "is required: at least " + REASON_MIN + " characters");
        return checkedReason(t);
    }

    /** An optional reason: absent is fine, present follows the same limits. */
    public static String optionalReason(String raw) {
        if (raw == null || raw.isBlank()) return null;
        return checkedReason(raw.strip().replaceAll("\\s+", " "));
    }

    private static String checkedReason(String t) {
        if (t.length() > REASON_MAX) throw OrgException.invalid("reason", "at most " + REASON_MAX + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("reason", "contains characters that are not allowed");
        SensitiveContent.check("reason", "reason", t);
        return t;
    }
}
