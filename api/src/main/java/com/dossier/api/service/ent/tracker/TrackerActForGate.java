package com.dossier.api.service.ent.tracker;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.mkt.MarketerAccess;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.tracker.TrackerActAs;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one gate in front of a marketer writing onto an assigned consultant's personal application tracker (docs/change-audit/README.md section 2.3,
 * X9.15): the tracker twin of the resume builder's act-for gate. It decides, and answers the generic 404 for EVERY refusal (never a 403, never a hint of
 * which check failed):
 * <ol>
 *   <li>the caller is an ACTIVE member of {@code me.orgId()} (the organization comes from the tenant host, never from a body) and the roles are read from
 *       data and the marketing module is on ({@link MktScope#resolve});</li>
 *   <li>the caller holds {@code member.act_for} with the consultant as beneficiary: ASSIGNED scope reaches only consultants assigned to them, an
 *       unassigned or foreign member id is refused by the same authorization order every other route uses;</li>
 *   <li>the consultant (looked up by {@code org_member.id} INSIDE this organization) has an ACTIVE seat with an account, and the marketer has an active
 *       assignment to that consultant ({@link MktScope#require});</li>
 *   <li>the consultant is not the caller (acting for yourself is just using your own tracker).</li>
 * </ol>
 * It returns the consultant's account (the OWNER of whatever is written) and the {@link TrackerActAs.Scope} that names the marketer, for
 * {@link TrackerActAs#run}. O4: nothing here signs in as the consultant or reads their credentials; the swap lasts one call and is undone.
 *
 * <p>Assignment visibility (docs/enterprise-v2/19b: the Org Admin's per-assignment "APPLICATIONS" tick) is a design that has not been built (no
 * visibility table or key exists in the code yet), so the check that exists today is the assignment itself. The seam for it is built:
 * {@link MarketerAccess#require} with {@code Area.APPLICATIONS} runs in {@link #authorize} right after the assignment check, and answers yes for every assigned
 * consultant (decision O5). When O6 lands only the body of {@link MarketerAccess#allows} changes.
 */
@Service
public class TrackerActForGate {

    /** The permission an act-for write needs: ASSIGNED scope reaches the consultants assigned to the marketer or listed as backup. */
    public static final String PERMISSION = "member.act_for";

    /** What an authorised act-for write runs as. */
    public record Grant(User owner, TrackerActAs.Scope scope, Long consultantMemberId) {}

    private final MktScope scope;
    private final MarketerAccess marketerAccess;
    private final AuthorizationService authorization;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final UserRepository users;

    public TrackerActForGate(
        MktScope scope,
        MarketerAccess marketerAccess,
        AuthorizationService authorization,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        UserRepository users
    ) {
        this.scope = scope;
        this.marketerAccess = marketerAccess;
        this.authorization = authorization;
        this.consultants = consultants;
        this.members = members;
        this.users = users;
    }

    /** Authorises one act-for write by {@code me} onto the tracker of the consultant whose seat is {@code consultantMemberId}, or throws the generic 404. */
    @Transactional(readOnly = true)
    public Grant authorize(OrgMembership me, Long consultantMemberId) {
        if (me == null || me.orgId() == null || consultantMemberId == null || consultantMemberId <= 0) throw new OrgNotFoundException();
        Long orgId = me.orgId();
        MktScope.View view = scope.resolve(me, PERMISSION);
        authorization.require(AuthzRequest.of(orgId, List.of(PERMISSION), Beneficiary.PATH_MEMBER, consultantMemberId, AuthzOperation.WRITE).withActor(me));
        ConsultantProfile profile = consultants.findByOrgIdAndMemberId(orgId, consultantMemberId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, profile.getId());
        marketerAccess.require(view, profile.getId(), MarketerAccess.Area.APPLICATIONS); // the O6 seam: true for an assigned consultant today (docs/enterprise-v2/19b)
        User owner = members
            .findByOrgIdAndId(orgId, consultantMemberId)
            .filter(m -> m.getStatus() == OrgMemberStatus.ACTIVE && m.getUserId() != null)
            .flatMap(m -> users.findById(m.getUserId()))
            .orElseThrow(OrgNotFoundException::new);
        if (owner.getId().equals(me.userId()) || consultantMemberId.equals(me.memberId())) throw new OrgNotFoundException();
        return new Grant(owner, new TrackerActAs.Scope(orgId, me.login(), me.userId()), consultantMemberId);
    }
}
