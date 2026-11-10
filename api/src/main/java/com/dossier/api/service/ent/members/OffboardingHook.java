package com.dossier.api.service.ent.members;

import com.dossier.api.service.dto.ent.MemberActionDTO;
import java.util.List;
import org.springframework.core.Ordered;

/**
 * One step of what happens when a person leaves (15-employees-and-teams.md section 5, 09-consistency-decisions.md row 4). The offboarding
 * service runs every registered hook in {@link #getOrder()} order, for the preview AND for the apply, so what the wizard promises is exactly what
 * runs. A story that owns one of the steps registers its bean with the order constant below; a step with no bean is simply skipped. A hook that
 * throws aborts the whole offboarding (it is one transaction): nothing is half-done.
 *
 * <pre>
 *   100 sessions      the person is signed out of this workspace (X2.7)
 *   150 account       an enterprise account is disabled and its tokens revoked (O4, S8)
 *   200 assignments  consultants assigned to them need a new marketer; assignments they hold as a consultant end (X4.7)
 *   300 consent       sharing with the organization ends (DataShareService.endFor)
 *   400 resume links  org resume links are removed and audited (X7.3, ADR-009)
 *   500 licenses      the licence ends now, no proration, no refund (X5.4)
 *   600 pipeline      their open matches are withdrawn with reason CONSULTANT_LEFT (X8.13)
 *   700 employment    the HR employment record moves to OFFBOARDING (X11.1)
 * </pre>
 *
 * Records are kept: a hook ends or detaches things, it never deletes a person's own data or the organization's audit trail.
 */
public interface OffboardingHook extends Ordered {

    int ORDER_SESSIONS = 100;
    /** Decision O4 (doc 19 S8): the person's ENTERPRISE account is disabled and its refresh / extension tokens revoked. */
    int ORDER_ACCOUNT = 150;
    int ORDER_ASSIGNMENTS = 200;
    int ORDER_CONSENT = 300;
    int ORDER_RESUME_LINKS = 400;
    int ORDER_LICENSES = 500;
    int ORDER_PIPELINE = 600;
    int ORDER_EMPLOYMENT = 700;

    /** Everything one apply knows: who leaves, why, and who did it ({@code actorLogin} is {@code system} for the scheduled job). */
    record Context(
        Long orgId,
        Long memberId,
        String memberLogin,
        String reason,
        String actorLogin,
        List<MemberActionDTO.Reassignment> reassignments
    ) {}

    /** A short stable name for logs and the preview ({@code "sessions"}, {@code "assignments"}...). */
    String key();

    /** What this step will do for {@code memberId}; reads only, never writes. */
    List<MemberActionDTO.HookLine> preview(Long orgId, Long memberId);

    /** Does it. Runs inside the offboarding transaction. */
    void apply(Context context);
}
