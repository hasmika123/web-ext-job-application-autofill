package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.DataShareEvent;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.dto.org.MyOrgDTO;
import com.dossier.api.service.dto.org.ShareChangeRequest;
import com.dossier.api.service.org.DataShareService.ShareContext;
import com.dossier.api.service.org.DataShareService.ShareView;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The member's side of an organization (O6.2; consent-data-sharing.md sections 4 and 5.2): the organizations they belong to
 * and what each can see, changing what they share, and leaving. Everything acts on the CALLER's own seat, resolved by
 * {@link OrgAccessService} from the org id in the path; there is no way to name another person's seat. Changing the share is
 * {@link DataShareService#grant} (one event and one audit row, effective on the very next request, as easy to withdraw as to
 * give); leaving ends all sharing and deletes nothing from the person's account.
 *
 * <p>Telling the org's admins that someone stopped sharing is NOT here: consent-data-sharing.md puts that notice with the
 * revocation story (O6.4, which needs the org notification kinds of O13.3). Until then the Team page shows "Not sharing".
 */
@Service
public class MyOrgService {

    /** What the org sees at a scope, in a member's words. Keyed by the visibility-matrix field so the two cannot drift. */
    private static final Map<ShareField, String> WORDS = new EnumMap<>(ShareField.class);

    static {
        WORDS.put(ShareField.SEAT, "That you are a member: your name, email, role and group");
        WORDS.put(ShareField.ACTIVATED, "Whether you have started using Kiwiply");
        WORDS.put(ShareField.STAGE_COUNTS, "How many applications you have in each stage");
        WORDS.put(ShareField.LAST_ACTIVITY, "The day you were last active");
        WORDS.put(ShareField.RESUME_READINESS, "Whether you have a resume and how strong it looks");
        WORDS.put(ShareField.UPCOMING_INTERVIEW_COUNT, "How many interviews you have coming up, as a number");
        WORDS.put(ShareField.PLACEMENT, "Whether you told us you were placed, and when");
        WORDS.put(ShareField.EMPLOYER_DETAILS, "Company names, job titles, locations and salaries");
        WORDS.put(ShareField.APPLICATION_DETAIL, "Your applications in detail");
        WORDS.put(ShareField.RESUMES, "Your resumes");
        WORDS.put(ShareField.INTERVIEW_CALENDAR, "Your interview calendar");
        WORDS.put(ShareField.JOB_ASSIGNMENTS, "Jobs assigned to you");
    }

    /** What no scope ever shows (consent-data-sharing.md decision 7). */
    static final List<String> NEVER = List.of("Your saved answers", "AI drafts", "Your inbox", "Private notes", "Sign-in details");

    private final OrgMemberRepository members;
    private final OrganizationRepository orgs;
    private final UserRepository users;
    private final DataShareService dataShare;
    private final OrgService orgService;
    private final OrgAuditService audit;

    public MyOrgService(
        OrgMemberRepository members,
        OrganizationRepository orgs,
        UserRepository users,
        DataShareService dataShare,
        OrgService orgService,
        OrgAuditService audit
    ) {
        this.members = members;
        this.orgs = orgs;
        this.users = users;
        this.dataShare = dataShare;
        this.orgService = orgService;
        this.audit = audit;
    }

    // ---- read -------------------------------------------------------------------------------------------------------

    /** Every organization the caller holds an ACTIVE or SUSPENDED seat in (a pending invite is not a membership yet). */
    @Transactional(readOnly = true)
    public List<MyOrgDTO> mine() {
        Optional<User> user = SecurityUtils.getCurrentUserLogin().flatMap(users::findOneByLogin);
        if (user.isEmpty()) return List.of();
        List<MyOrgDTO> out = new ArrayList<>();
        for (OrgMember seat : members.findMine(user.get().getId())) {
            if (seat.getStatus() != OrgMemberStatus.ACTIVE && seat.getStatus() != OrgMemberStatus.SUSPENDED) continue;
            if (seat.getRole() == null || seat.getRole().isReserved()) continue;
            orgs.findByOrgId(seat.getOrgId()).ifPresent(org -> out.add(view(org, seat)));
        }
        out.sort(java.util.Comparator.comparing((MyOrgDTO d) -> d.org().name(), String.CASE_INSENSITIVE_ORDER));
        return out;
    }

    /** One organization from the member's side, after a change. */
    @Transactional(readOnly = true)
    public MyOrgDTO get(OrgMembership me) {
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), me.memberId()).orElseThrow(OrgNotFoundException::new);
        return view(org, seat);
    }

    // ---- change what is shared --------------------------------------------------------------------------------------

    /** Sets the caller's own scope. 422 for FULL without a valid named person or an unknown consent version. */
    @Transactional
    public MyOrgDTO changeShare(OrgMembership me, ShareChangeRequest req, ShareContext ctx) {
        if (req == null) throw OrgException.invalid("body", "is required");
        dataShare.grant(me, req.scope(), req.fullToMemberId(), req.consentVersion(), ctx);
        return get(me);
    }

    // ---- leave ------------------------------------------------------------------------------------------------------

    /**
     * The caller leaves: the seat becomes LEFT, the support owner is dropped, every FULL share that named them ends and their
     * own sharing ends at once (event {@code MEMBER_LEFT}). An OWNER must transfer ownership first (409
     * {@code OWNER_MUST_TRANSFER}); an org that switched off {@code allowSelfLeave} refuses its plain members (409
     * {@code LEAVE_NOT_ALLOWED}). Nothing is deleted from the person's account.
     */
    @Transactional
    public void leave(OrgMembership me) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), me.memberId()).orElseThrow(OrgNotFoundException::new);
        if (seat.getRole() == OrgRole.OWNER) throw OrgException.ownerMustTransfer();
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (seat.getRole() == OrgRole.MEMBER && !orgService.settingsOf(org).allowSelfLeave()) throw OrgException.leaveNotAllowed();

        seat.setStatus(OrgMemberStatus.LEFT);
        seat.setLeftAt(Instant.now());
        seat.setSupportOwnerMemberId(null);
        members.saveAndFlush(seat);
        dataShare.endFor(me.orgId(), me.memberId(), me.login(), DataShareEvent.REASON_MEMBER_LEFT, DataShareEvent.ACTOR_MEMBER);
        dataShare.endPairingsTo(me.orgId(), me.memberId(), me.login());
        audit.record(me, OrgAuditService.MEMBER_LEFT, OrgAuditService.TARGET_MEMBER, me.login(), String.valueOf(me.memberId()), "left on their own");
    }

    // ---- shaping ----------------------------------------------------------------------------------------------------

    private MyOrgDTO view(Organization org, OrgMember seat) {
        Optional<ShareView> stored = dataShare.viewOf(org.getId(), seat.getId());
        ShareScope scope = stored.map(ShareView::scope).orElse(ShareScope.NONE);
        ShareScope effective = dataShare.scopeOf(org.getId(), seat.getId());
        MyOrgDTO.FullTo fullTo = null;
        if (scope == ShareScope.FULL && stored.get().fullToMemberId() != null) {
            fullTo = members
                .findByOrgIdAndId(org.getId(), stored.get().fullToMemberId())
                .map(m -> new MyOrgDTO.FullTo(m.getId(), m.getUserId() == null ? null : users.findById(m.getUserId()).map(OrgInviteService::nameOf).filter(n -> !n.isBlank()).orElse(null)))
                .orElse(null);
        }
        boolean active = seat.getStatus() == OrgMemberStatus.ACTIVE;
        return new MyOrgDTO(
            new MyOrgDTO.Org(org.getId(), org.getSlug(), org.getName(), org.getStatus()),
            seat.getId(),
            seat.getRole(),
            seat.getStatus(),
            scope,
            effective,
            stored.map(ShareView::consentVersion).orElse(null),
            fullTo,
            seat.getJoinedAt(),
            stored.map(ShareView::updatedAt).orElse(null),
            sees(scope),
            NEVER,
            active && seat.getRole() != OrgRole.OWNER && (seat.getRole() != OrgRole.MEMBER || orgService.settingsOf(org).allowSelfLeave()),
            active
        );
    }

    /** The visibility matrix at {@code scope}, in the member's words. */
    static List<String> sees(ShareScope scope) {
        List<String> out = new ArrayList<>();
        for (ShareField f : ShareField.values()) {
            if (f.visibleAt(scope) && WORDS.containsKey(f)) out.add(WORDS.get(f));
        }
        return out;
    }

    /** The sentences, for the test that pins them to the matrix. */
    static Map<ShareField, String> words() {
        return Map.copyOf(WORDS);
    }
}
