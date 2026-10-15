package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgJoinCode;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgJoinCodeRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.UserService;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.dto.org.JoinAcceptRequest;
import com.dossier.api.service.dto.org.JoinPreviewDTO;
import com.dossier.api.service.dto.org.JoinResultDTO;
import com.dossier.api.service.org.DataShareService.ShareContext;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Joining an organization (O2.2; onboarding-invites.md sections 3.1 and 4): look at an invite or a join code without
 * signing in, then accept it as a signed-in person. The link is the credential, so every miss answers the same generic 404
 * ({@link OrgNotFoundException}) whether the token never existed, was used, was rotated by a re-send, or its org is closed.
 *
 * <p><b>Accepting is the consent.</b> The person chooses what the org may see (NONE or SUMMARY; FULL is never offered here)
 * and the version of the text they were shown; the seat and the {@code data_share} row are written together, so nobody is
 * ever a member with no recorded choice. An invite binds to whoever accepts it (any signed-in account may: the person may
 * use a different address on Kiwiply than the one invited) and is single-use. A person who already holds a live seat in the
 * org gets 409 {@code ALREADY_MEMBER}. An expired link is 409 {@code INVITE_EXPIRED}; an org that cannot take the seat yet
 * is 409 {@code SEAT_STATE}. A shared code mints MEMBER seats only, counted atomically against its place limit.
 */
@Service
public class OrgJoinService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgJoinService.class);
    private static final int PASSWORD_MIN = 4; // the same rule as sign-up and password reset (ManagedUserVM)
    private static final int PASSWORD_MAX = 100;

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgJoinCodeRepository codes;
    private final OrgInviteBatchRepository batches;
    private final UserRepository users;
    private final DataShareService dataShare;
    private final OrgShareConsent consent;
    private final OrgService orgService;
    private final OrgAuditService audit;
    private final NotificationService notifications;
    private final OrgRoleService roleService;
    private final InviteSettings inviteSettings;
    private final InviteAcceptance acceptance;
    private final InviteCeilingChecker ceiling;
    private final AccountScopes accountScopes;
    private final UserService userService;

    public OrgJoinService(
        OrganizationRepository orgs,
        OrgMemberRepository members,
        OrgGroupRepository groups,
        OrgJoinCodeRepository codes,
        OrgInviteBatchRepository batches,
        UserRepository users,
        DataShareService dataShare,
        OrgShareConsent consent,
        OrgService orgService,
        OrgAuditService audit,
        NotificationService notifications,
        OrgRoleService roleService,
        InviteSettings inviteSettings,
        InviteAcceptance acceptance,
        InviteCeilingChecker ceiling,
        AccountScopes accountScopes,
        UserService userService
    ) {
        this.orgs = orgs;
        this.members = members;
        this.groups = groups;
        this.codes = codes;
        this.batches = batches;
        this.users = users;
        this.dataShare = dataShare;
        this.consent = consent;
        this.orgService = orgService;
        this.audit = audit;
        this.notifications = notifications;
        this.roleService = roleService;
        this.inviteSettings = inviteSettings;
        this.acceptance = acceptance;
        this.ceiling = ceiling;
        this.accountScopes = accountScopes;
        this.userService = userService;
    }

    // ---- preview (public) ---------------------------------------------------------------------------------------------

    /** What an emailed invite shows. 404 for any token that is not a live invite; 409 INVITE_EXPIRED once it has run out. */
    @Transactional(readOnly = true)
    public JoinPreviewDTO previewInvite(String token) {
        OrgMember seat = pendingSeat(token);
        Organization org = openOrg(seat.getOrgId());
        requireNotExpired(seat, org);
        String inviter = seat.getInvitedByMemberId() == null ? null : nameOfMember(seat.getOrgId(), seat.getInvitedByMemberId());
        return new JoinPreviewDTO(
            "EMAIL",
            org.getName(),
            org.getSlug(),
            seat.getRole(),
            inviter,
            groupName(seat.getOrgId(), seat.getGroupId()),
            List.of(),
            seat.getInviteExpiresAt(),
            OrgInviteService.canSeat(org.getStatus(), seat.getRole()),
            consent.view(orgService.settingsOf(org).defaultShareScope()),
            roleNames(seat),
            groupName(seat.getOrgId(), seat.getDepartmentGroupId()),
            groupName(seat.getOrgId(), seat.getTeamGroupId()),
            seat.getInviteMessage(),
            maskEmail(seat.getInviteEmail()),
            inviteSettings.requireEmailMatch(org.getId()),
            accountScopes.scopeOf(org.getId()) != null
        );
    }

    /** Names (never ids) of the roles the invitation will grant, primary first; the legacy role word when the invitation predates role ids. */
    private List<String> roleNames(OrgMember seat) {
        List<Long> ids = OrgInviteService.parseIds(seat.getInviteRoleIdsJson());
        if (!ids.isEmpty()) {
            List<String> names = ceiling.resolve(seat.getOrgId(), ids).map(v -> v.stream().map(r -> r.def().getName()).toList()).orElse(List.of());
            if (!names.isEmpty()) return names;
        }
        return List.of(seat.getRole().name());
    }

    /**
     * {@code a***@e***.org}: enough for a person to recognise which of their addresses was invited, not enough to learn an address from
     * a leaked link. Null for no address.
     */
    static String maskEmail(String email) {
        if (email == null || email.isBlank()) return null;
        int at = email.lastIndexOf('@');
        if (at < 1) return "***";
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        int dot = domain.lastIndexOf('.');
        String tld = dot > 0 ? domain.substring(dot) : "";
        String domainHead = domain.isEmpty() ? "" : domain.substring(0, 1);
        return local.charAt(0) + "***@" + domainHead + "***" + tld;
    }

    private static boolean sameAddress(String accountEmail, String invitedEmail) {
        return accountEmail != null && invitedEmail != null && accountEmail.strip().equalsIgnoreCase(invitedEmail.strip());
    }

    /** What a shared join link shows. Same rules; a revoked code is a plain 404, an expired or used-up one a 409. */
    @Transactional(readOnly = true)
    public JoinPreviewDTO previewCode(String rawCode) {
        OrgJoinCode code = liveCode(rawCode);
        Organization org = openOrg(code.getOrgId());
        requireCodeUsable(code, org);
        return new JoinPreviewDTO(
            "CODE",
            org.getName(),
            org.getSlug(),
            code.getRole(),
            null,
            groupName(code.getOrgId(), code.getGroupId()),
            List.of(),
            code.getExpiresAt(),
            OrgInviteService.canSeat(org.getStatus(), code.getRole()) && accountScopes.scopeOf(org.getId()) == null, // a shared code proves no address: not offered for SEPARATE organizations
            consent.view(orgService.settingsOf(org).defaultShareScope())
        );
    }

    // ---- accept (signed in) -------------------------------------------------------------------------------------------

    /** What a successful acceptance produced: the result, and the account that now holds the seat (the caller may mint its session). */
    public record Accepted(JoinResultDTO result, User user) {}

    /** True when {@code token} is an invitation of a SEPARATE organization (decision O4): accepting it needs no sign-in and creates the account. */
    @Transactional(readOnly = true)
    public boolean isSeparateInvite(String token) {
        if (!InviteTokens.looksLikeToken(token)) return false;
        return members.findByInviteTokenHash(InviteTokens.hash(token)).map(s -> accountScopes.scopeOf(s.getOrgId()) != null).orElse(false);
    }

    @Transactional
    public JoinResultDTO acceptInvite(String token, JoinAcceptRequest req, ShareContext ctx) {
        if (isSeparateInvite(token)) return acceptSeparateInvite(token, req, ctx).result();
        User user = currentUser();
        ShareScope scope = requireChoice(req);
        OrgMember seat = pendingSeat(token, user);
        Organization org = openOrg(seat.getOrgId());
        requireNotExpired(seat, org);
        if (!OrgInviteService.canSeat(org.getStatus(), seat.getRole())) throw OrgException.seatState(org.getStatus().name());
        requireNotAlreadyMember(org.getId(), user.getId());
        // E7: bound to the invited address unless the organization (or the platform) switched the rule off; then it is audited.
        boolean emailMismatch = !sameAddress(user.getEmail(), seat.getInviteEmail());
        if (emailMismatch && inviteSettings.requireEmailMatch(org.getId())) throw OrgException.inviteEmailMismatch(maskEmail(seat.getInviteEmail()));
        return takeSeat(org, seat, user, scope, req, ctx, emailMismatch);
    }

    /**
     * Accepting an invitation to a SEPARATE organization (decision O4, docs/enterprise-v2/19 sections 3.9 and 7 row S4). The link is the only
     * credential (no session, no personal-account sign-in): it proves the invited address, so accepting creates the person's enterprise
     * account of THIS organization with the password they choose now (or, when this organization already has an account for the address
     * and it holds no live seat, reuses it and sets that password). A personal account with the same address is never read or touched, and the
     * answer never mentions one.
     */
    @Transactional
    public Accepted acceptSeparateInvite(String token, JoinAcceptRequest req, ShareContext ctx) {
        ShareScope scope = requireChoice(req);
        OrgMember seat = pendingSeat(token);
        Organization org = openOrg(seat.getOrgId());
        requireNotExpired(seat, org);
        if (!OrgInviteService.canSeat(org.getStatus(), seat.getRole())) throw OrgException.seatState(org.getStatus().name());
        String email = seat.getInviteEmail();
        if (email == null || email.isBlank()) throw new OrgNotFoundException();
        String password = req.password();
        if (password == null || password.length() < PASSWORD_MIN || password.length() > PASSWORD_MAX) {
            throw OrgException.invalid("password", "must be " + PASSWORD_MIN + " to " + PASSWORD_MAX + " characters");
        }
        User user = userService.findEnterpriseAccount(org.getId(), email).orElse(null);
        if (user == null) {
            String[] names = nameParts(seat.getInviteName());
            try {
                user = userService.createEnterpriseAccount(org.getId(), email, names[0], names[1], password, null).user();
            } catch (com.dossier.api.service.EmailAlreadyUsedException raced) {
                throw OrgException.alreadyMember();
            }
        } else {
            requireNotAlreadyMember(org.getId(), user.getId());
            userService.setEnterprisePassword(user, password);
        }
        JoinResultDTO result = takeSeat(org, seat, user, scope, req, ctx, false);
        return new Accepted(result, user);
    }

    /** The shared tail of accepting an invitation: the seat becomes ACTIVE for {@code user}, roles are re-checked, consent is recorded. */
    private JoinResultDTO takeSeat(Organization org, OrgMember seat, User user, ShareScope scope, JoinAcceptRequest req, ShareContext ctx, boolean emailMismatch) {
        Instant now = Instant.now();
        seat.setUserId(user.getId());
        seat.setStatus(OrgMemberStatus.ACTIVE);
        seat.setJoinedAt(now);
        seat.setInviteExpiresAt(null); // single use: the seat is no longer INVITED, so the link answers 404 to everyone but its owner
        try {
            seat = members.saveAndFlush(seat);
        } catch (DataIntegrityViolationException raced) { // the same person accepted twice at once
            throw OrgException.alreadyMember();
        }
        if (seat.getInviteBatchId() != null) batches.incrementAccepted(org.getId(), seat.getInviteBatchId());

        InviteAcceptance.Outcome roles = acceptance.apply(org, seat, user); // T32: the roles are re-checked against the inviter's rights NOW
        String details = "via=invite" + (emailMismatch ? " emailMismatch=true" : "") + (roles.wasTrimmed() ? " rolesTrimmed=" + String.join(",", roles.trimmed()) : "");
        JoinResultDTO result = finishJoin(org, seat, user, scope, req.consentVersion(), ctx, details);
        notifyInviter(org, seat, user);
        return result;
    }

    private static String[] nameParts(String full) {
        if (full == null || full.isBlank()) return new String[] { null, null };
        String n = full.strip();
        int i = n.indexOf(' ');
        return i < 0 ? new String[] { n, null } : new String[] { n.substring(0, i), n.substring(i + 1) };
    }

    @Transactional
    public JoinResultDTO acceptCode(String rawCode, JoinAcceptRequest req, ShareContext ctx) {
        User user = currentUser();
        ShareScope scope = requireChoice(req);
        OrgJoinCode code = liveCode(rawCode);
        Organization org = openOrg(code.getOrgId());
        if (accountScopes.scopeOf(org.getId()) != null) { // O4: a shared code proves no address, so it cannot create an enterprise account; an invitation can
            throw OrgException.coded(409, "CODE_JOIN_UNAVAILABLE", "This organization adds people by invitation. Ask your administrator to invite you.", java.util.Map.of());
        }
        requireNotAlreadyMember(org.getId(), user.getId()); // before "no places left": someone who is in already is just told so
        requireCodeUsable(code, org);
        if (!OrgInviteService.canSeat(org.getStatus(), code.getRole())) throw OrgException.seatState(org.getStatus().name());

        Instant now = Instant.now();
        if (codes.redeem(org.getId(), code.getId(), now) == 0) throw OrgException.inviteExpired("full", org.getName()); // lost the race for the last place

        OrgMember seat = new OrgMember();
        seat.setOrgId(org.getId());
        seat.setUserId(user.getId());
        seat.setRole(OrgRules.requireAssignable(code.getRole() == null ? OrgRole.MEMBER : code.getRole()));
        seat.setStatus(OrgMemberStatus.ACTIVE);
        seat.setJoinedAt(now);
        seat.setGroupId(code.getGroupId());
        try {
            seat = members.saveAndFlush(seat);
        } catch (DataIntegrityViolationException raced) {
            throw OrgException.alreadyMember();
        }
        roleService.syncFromLegacy(seat);
        return finishJoin(org, seat, user, scope, req.consentVersion(), ctx, "via=code");
    }

    // ---- shared steps -------------------------------------------------------------------------------------------------

    /** Records the choice and the audit row, in the seat's own name. */
    private JoinResultDTO finishJoin(Organization org, OrgMember seat, User user, ShareScope scope, String consentVersion, ShareContext ctx, String details) {
        OrgMembership me = new OrgMembership(org.getId(), seat.getId(), user.getId(), user.getLogin(), seat.getRole(), OrgMemberStatus.ACTIVE, org.getStatus());
        dataShare.grant(me, scope, null, consentVersion == null || consentVersion.isBlank() ? OrgShareConsent.CURRENT : consentVersion, ctx);
        audit.record(me, OrgAuditService.MEMBER_JOIN, OrgAuditService.TARGET_MEMBER, user.getLogin(), String.valueOf(seat.getId()), details + " scope=" + scope);
        return new JoinResultDTO(org.getId(), org.getSlug(), org.getName(), seat.getId(), seat.getRole(), scope, List.of(), null);
    }

    /** One notice to the person who invited them (in-app, and email when that person has switched it on). */
    private void notifyInviter(Organization org, OrgMember seat, User joiner) {
        if (seat.getInvitedByMemberId() == null) return;
        Optional<OrgMember> inviter = members.findByOrgIdAndId(org.getId(), seat.getInvitedByMemberId());
        if (inviter.isEmpty() || inviter.get().getUserId() == null) return;
        String who = OrgInviteService.nameOf(joiner);
        if (who.isBlank()) who = seat.getInviteEmail() == null ? "Someone" : seat.getInviteEmail();
        try {
            notifications.publish(
                NotificationKind.ORG_INVITE_ACCEPTED,
                inviter.get().getUserId(),
                NotificationService.Payload.of(who + " joined " + org.getName(), "They accepted your invite.", "/org/team").deduped("org-join:" + org.getId() + ":" + seat.getId())
            );
        } catch (RuntimeException e) {
            LOG.warn("Could not notify the inviter for org {}", org.getId(), e); // the join itself stands
        }
    }

    private OrgMember pendingSeat(String token) {
        return pendingSeat(token, null);
    }

    /**
     * The invited seat a token opens. A seat that is no longer INVITED answers 404 to everyone, except the person who took it
     * (a double tap, a second tab) who is told they are already a member.
     */
    private OrgMember pendingSeat(String token, User acceptingAs) {
        if (!InviteTokens.looksLikeToken(token)) throw new OrgNotFoundException();
        OrgMember seat = members.findByInviteTokenHash(InviteTokens.hash(token)).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ACTIVE && acceptingAs != null && acceptingAs.getId().equals(seat.getUserId())) throw OrgException.alreadyMember();
        if (seat.getStatus() == OrgMemberStatus.REMOVED && seat.getJoinedAt() == null && com.dossier.api.domain.enumeration.InviteStatus.REASON_EXPIRED.equals(seat.getInviteEndedReason())) {
            // swept by the expiry job: the same answer as a link that ran out an hour ago (a REVOKED link has no token and is a plain 404)
            throw OrgException.inviteExpired("expired", openOrg(seat.getOrgId()).getName());
        }
        if (seat.getStatus() != OrgMemberStatus.INVITED) throw new OrgNotFoundException();
        return seat;
    }

    /** The org behind a link, unless it is closed (a closed org has no join page). */
    private Organization openOrg(Long orgId) {
        Organization org = orgs.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        if (org.getStatus() == com.dossier.api.domain.enumeration.OrgStatus.CLOSED) throw new OrgNotFoundException();
        requireHostMatches(org.getId());
        return org;
    }

    /**
     * X1.8 (12-identity.md section 5): on an organization's own host only THAT organization's invites and codes exist; on the
     * platform host (or with no host, today's clients) any organization's do. A host that was given but is not served is a 404.
     * Answered as the same generic 404 as a token that never existed, so a host reveals nothing about another tenant's links.
     */
    private static void requireHostMatches(Long orgId) {
        TenantContext c = TenantContextHolder.current().orElse(null);
        if (c == null) return;
        if (c.isExplicitlyUnknown()) throw new OrgNotFoundException();
        if (c.isTenant() && !java.util.Objects.equals(c.orgId(), orgId)) throw new OrgNotFoundException();
    }

    private static void requireNotExpired(OrgMember seat, Organization org) {
        if (seat.getInviteExpiresAt() != null && seat.getInviteExpiresAt().isBefore(Instant.now())) throw OrgException.inviteExpired("expired", org.getName());
    }

    private OrgJoinCode liveCode(String rawCode) {
        String normal = InviteTokens.normaliseCode(rawCode);
        if (normal == null) throw new OrgNotFoundException();
        OrgJoinCode code = codes.findByCode(normal).orElseThrow(OrgNotFoundException::new);
        if (code.getRevokedAt() != null) throw new OrgNotFoundException();
        return code;
    }

    private static void requireCodeUsable(OrgJoinCode code, Organization org) {
        if (code.getExpiresAt() != null && code.getExpiresAt().isBefore(Instant.now())) throw OrgException.inviteExpired("expired", org.getName());
        if (code.getMaxUses() != null && code.getUses() >= code.getMaxUses()) throw OrgException.inviteExpired("full", org.getName());
    }

    private void requireNotAlreadyMember(Long orgId, Long userId) {
        if (!members.findByOrgIdAndUserIdAndStatusIn(orgId, userId, OrgMemberStatus.LIVE).isEmpty()) throw OrgException.alreadyMember();
    }

    /** NONE or SUMMARY and a consent version that exists; FULL is never taken on the join screen. */
    private ShareScope requireChoice(JoinAcceptRequest req) {
        if (req == null || req.shareScope() == null) throw OrgException.invalid("shareScope", "is required");
        if (req.shareScope() == ShareScope.FULL) throw OrgException.invalid("shareScope", "can be NONE or SUMMARY when joining");
        if (req.consentVersion() == null || !consent.isKnown(req.consentVersion())) throw OrgException.invalid("consentVersion", "must be the consent text version you were shown");
        return req.shareScope();
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user"));
    }

    private String nameOfMember(Long orgId, Long memberId) {
        return members
            .findByOrgIdAndId(orgId, memberId)
            .filter(m -> m.getUserId() != null)
            .flatMap(m -> users.findById(m.getUserId()))
            .map(OrgInviteService::nameOf)
            .filter(n -> !n.isBlank())
            .orElse(null);
    }

    private String groupName(Long orgId, Long groupId) {
        return groupId == null ? null : groups.findByOrgIdAndId(orgId, groupId).map(g -> g.getName()).orElse(null);
    }
}
