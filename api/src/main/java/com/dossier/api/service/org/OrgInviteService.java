package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.OrgMemberRole;
import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgGroupKind;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.OrgType;
import com.dossier.api.domain.org.OrgGroup;
import com.dossier.api.domain.org.OrgInviteBatch;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberRoleRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.ent.JoinLinks;
import com.dossier.api.service.ent.LegacyRoleMirror;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.org.InviteCeilingChecker.RoleView;
import com.dossier.api.service.privacy.SensitivePatterns;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Invites people to an organization by email, sends the link again, and withdraws it (O2.2 adopted by X1.8; multi-role, placement and
 * the ceiling by X1.15; docs/design/org/onboarding-invites.md section 3.2, docs/enterprise-v2/15-employees-and-teams.md section 2).
 * An invitation is an {@code org_member} row in state INVITED holding the SHA-256 of a one-time token; the token itself exists only
 * in the email. Joining is {@link OrgJoinService}; the page that lists them is {@link OrgInvitationService}.
 *
 * <p><b>What an invitation carries (X1.15):</b> one or more roles ({@code roleIds}, first = primary; the legacy {@code role} enum or the
 * organization's default when none), a department and a team ({@code org_group} of that kind), a manager (an active member) and a short
 * note. All of it is validated against THIS organization (a foreign id is a 404 like every foreign id) and the caller's rights NOW:
 * the roles by {@link InviteCeilingChecker} (422 {@code ROLE_CEILING}), the placement by {@code members.group.set} /
 * {@code members.manager.set} (until X4 grants those: owners and admins). The same roles are checked AGAIN when the invitation is
 * accepted, against the inviter's rights then ({@link InviteAcceptance}).
 *
 * <p><b>Rules, all from the design or an admin setting (nothing is hard-coded):</b>
 * <ul>
 *   <li>At most {@code org.invite.maxPerBatch} addresses a call, at most {@code org.invite.daily_cap} invite emails per org
 *       in 24 hours (sends and re-sends together), a link works {@code org.invite.expiryDays} days, a re-send rotates the
 *       token and is limited to {@code org.invite.resendsPerWeek} a week.</li>
 *   <li>Before an organization is activated (DRAFT, PENDING_SETUP_FEE) only ADMIN invites are allowed, at most
 *       {@code org.invite.draftAdminCap}; members are refused with 409 {@code SEAT_STATE}. A SUSPENDED or CLOSED org invites
 *       nobody.</li>
 *   <li>A group, manager or support owner from another org is a 404, like every foreign id.</li>
 * </ul>
 *
 * <p>Every call writes exactly one audit row (the count and the roles, never the addresses). The emails go out only after the
 * transaction commits, so a rolled-back batch emails nobody. Responses never differ between an address that has a Kiwiply account
 * and one that has not.
 */
@Service
public class OrgInviteService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgInviteService.class);

    static final Pattern EMAIL = Pattern.compile("^[^@\\s<>,;\"']+@[^@\\s<>,;\"']+\\.[^@\\s<>,;\"']+$");
    private static final Pattern NAMED = Pattern.compile("^(.*)<\\s*([^<>]+?)\\s*>\\s*$");
    private static final DateTimeFormatter EXPIRES = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneOffset.UTC);
    private static final Set<OrgStatus> OPEN_FOR_MEMBERS = EnumSet.of(OrgStatus.ACTIVE, OrgStatus.PAST_DUE);
    private static final Set<OrgStatus> BEFORE_ACTIVATION = EnumSet.of(OrgStatus.DRAFT, OrgStatus.PENDING_SETUP_FEE);
    private static final Set<OrgType> CONSULTANT_ORGS = EnumSet.of(OrgType.CONSULTANCY, OrgType.STAFFING, OrgType.PROFESSIONAL_SERVICES);
    static final int MAX_ROLES = 5;
    static final int MESSAGE_MAX = 500;
    static final int MANAGER_WALK_MAX = 20;

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgInviteBatchRepository batches;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final OrgService orgService;
    private final ResumeBuilderSettings settings;
    private final MailService mail;
    private final JoinLinks links;
    private final OrgRoleService roleService;
    private final InviteCeilingChecker ceiling;
    private final OrgMemberRoleRepository memberRoles;

    public OrgInviteService(
        OrganizationRepository orgs,
        OrgMemberRepository members,
        OrgGroupRepository groups,
        OrgInviteBatchRepository batches,
        UserRepository users,
        OrgAuditService audit,
        OrgService orgService,
        ResumeBuilderSettings settings,
        MailService mail,
        JoinLinks links,
        OrgRoleService roleService,
        InviteCeilingChecker ceiling,
        OrgMemberRoleRepository memberRoles
    ) {
        this.orgs = orgs;
        this.members = members;
        this.groups = groups;
        this.batches = batches;
        this.users = users;
        this.audit = audit;
        this.orgService = orgService;
        this.settings = settings;
        this.mail = mail;
        this.links = links;
        this.roleService = roleService;
        this.ceiling = ceiling;
        this.memberRoles = memberRoles;
    }

    /** One entry of the request, parsed. */
    record Entry(String raw, String email, String name) {}

    /** The roles and placement an invitation call resolved to, already checked against the caller. */
    record Plan(List<RoleView> views, OrgRole mirror, Long groupId, Long departmentGroupId, Long teamGroupId, Long managerMemberId, Long supportOwnerId, String message) {
        List<Long> roleIds() {
            return views.stream().map(RoleView::id).toList();
        }

        String roleKeys() {
            return views.isEmpty() ? mirror.name() : views.stream().map(RoleView::key).collect(Collectors.joining(","));
        }

        boolean adminLike() {
            return views.isEmpty() ? mirror == OrgRole.ADMIN : views.stream().anyMatch(RoleView::adminLike);
        }
    }

    // ---- invite -----------------------------------------------------------------------------------------------------

    @Transactional
    public OrgInviteResultDTO invite(OrgMembership me, OrgInviteRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (req.emails() == null || req.emails().isEmpty()) throw OrgException.invalid("emails", "must name at least one address");
        int perBatch = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_MAX_PER_BATCH);
        if (req.emails().size() > perBatch) throw OrgException.limitReached("inviteBatch", perBatch);

        Plan plan = plan(me, org, req);

        // Parse and validate every entry; nothing is written until the whole call is known to fit.
        java.util.TreeMap<Integer, OrgInviteResultDTO.InviteRowResult> rowAt = new java.util.TreeMap<>(); // one result per entry, in the order sent
        java.util.IdentityHashMap<Entry, Integer> pos = new java.util.IdentityHashMap<>();
        List<OrgInviteResultDTO.Invalid> invalid = new ArrayList<>();
        List<Entry> entries = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        boolean single = req.emails().size() == 1;
        for (int i = 0; i < req.emails().size(); i++) {
            String raw = req.emails().get(i);
            String shown = raw == null ? "" : raw.strip();
            Optional<Entry> parsed = parse(shown, invalid);
            if (parsed.isEmpty()) {
                rowAt.put(i, new OrgInviteResultDTO.InviteRowResult(trim(shown), null, "INVALID", invalid.get(invalid.size() - 1).reason(), null));
                continue;
            }
            Entry e = parsed.get();
            if (single && e.name() == null) e = withFullName(e, req.fullName(), invalid);
            if (!seen.add(e.email())) {
                invalid.add(new OrgInviteResultDTO.Invalid(shown, "duplicate"));
                rowAt.put(i, new OrgInviteResultDTO.InviteRowResult(trim(shown), e.email(), "DUPLICATE", "duplicate", null));
                continue;
            }
            entries.add(e);
            pos.put(e, i);
        }

        List<String> alreadyMember = new ArrayList<>();
        List<Entry> fresh = new ArrayList<>();
        for (Entry e : entries) {
            if (holdsALiveSeat(me.orgId(), e.email())) {
                alreadyMember.add(e.email());
                rowAt.put(pos.get(e), new OrgInviteResultDTO.InviteRowResult(e.raw(), e.email(), "ALREADY_MEMBER", null, null));
            } else fresh.add(e);
        }

        if (plan.mirror() == OrgRole.ADMIN && BEFORE_ACTIVATION.contains(org.getStatus())) {
            int cap = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_DRAFT_ADMIN_CAP);
            long admins = members.countByOrgIdAndRoleAndStatusIn(me.orgId(), OrgRole.ADMIN, OrgMemberStatus.LIVE);
            if (admins + fresh.size() > cap) throw OrgException.limitReached("draftAdmins", cap);
        }
        Instant now = Instant.now();
        requireUnderDailyCap(me.orgId(), fresh.size(), now);

        if (fresh.isEmpty()) {
            return new OrgInviteResultDTO(null, List.of(), invalid, alreadyMember, List.copyOf(rowAt.values())); // nothing to send, nothing to record
        }

        OrgInviteBatch batch = new OrgInviteBatch();
        batch.setOrgId(me.orgId());
        batch.setCreatedByMemberId(me.memberId());
        batch.setSource(OrgInviteBatch.SOURCE_PASTE);
        batch.setRowCount(req.emails().size());
        batch.setInvalidCount(invalid.size());
        batch = batches.save(batch);

        int days = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_EXPIRY_DAYS);
        Instant expires = now.plus(Duration.ofDays(days));
        String inviter = displayNameOf(me.userId());
        String roleWord = roleWord(plan);
        List<OrgInviteResultDTO.Invited> invited = new ArrayList<>();
        List<Runnable> sends = new ArrayList<>();
        for (Entry e : fresh) {
            String token = InviteTokens.newToken();
            OrgMember seat = new OrgMember();
            seat.setOrgId(me.orgId());
            seat.setRole(plan.mirror());
            seat.setStatus(OrgMemberStatus.INVITED);
            seat.setInviteEmail(e.email());
            seat.setInviteName(e.name());
            seat.setInviteTokenHash(InviteTokens.hash(token));
            seat.setInviteExpiresAt(expires);
            seat.setInvitedByMemberId(me.memberId());
            seat.setInviteBatchId(batch.getId());
            seat.setInviteSentAt(now);
            seat.setGroupId(plan.groupId());
            seat.setDepartmentGroupId(plan.departmentGroupId());
            seat.setTeamGroupId(plan.teamGroupId());
            seat.setManagerMemberId(plan.managerMemberId());
            seat.setSupportOwnerMemberId(plan.supportOwnerId());
            seat.setInviteMessage(plan.message());
            if (!plan.views().isEmpty()) seat.setInviteRoleIdsJson(toJson(plan.roleIds()));
            try {
                seat = members.saveAndFlush(seat);
            } catch (DataIntegrityViolationException raced) { // someone invited the same address a moment ago
                alreadyMember.add(e.email());
                rowAt.put(pos.get(e), new OrgInviteResultDTO.InviteRowResult(e.raw(), e.email(), "ALREADY_MEMBER", null, null));
                continue;
            }
            writeRoleRows(seat, plan.views(), me.memberId());
            invited.add(new OrgInviteResultDTO.Invited(seat.getId(), e.email(), e.name(), plan.mirror(), expires, plan.roleIds()));
            rowAt.put(pos.get(e), new OrgInviteResultDTO.InviteRowResult(e.raw(), e.email(), "INVITED", null, seat.getId()));
            String msg = plan.message();
            sends.add(() -> sendInvite(org, e.email(), e.name(), inviter, roleWord, token, expires, msg));
        }

        audit.record(
            me.orgId(), me.login(), me.role(), OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_ORG, null, String.valueOf(batch.getId()),
            "invited=" + invited.size() + " roles=" + plan.roleKeys() + " dept=" + plan.departmentGroupId() + " team=" + plan.teamGroupId() + " manager=" + plan.managerMemberId() + " invalid=" + invalid.size(),
            null, null, null, plan.adminLike() ? "HIGH" : "LOW"
        );
        afterCommit(() -> sends.forEach(Runnable::run));
        return new OrgInviteResultDTO(batch.getId(), invited, invalid, alreadyMember, List.copyOf(rowAt.values()));
    }

    // ---- resend -----------------------------------------------------------------------------------------------------

    /** Rotates the token of a pending (or expired) invite and emails the new link. Limited to N a week per invite (admin setting). */
    @Transactional
    public OrgInviteResultDTO.Invited resend(OrgMembership me, Long memberId) {
        Resent r = resendOne(me, memberId);
        afterCommit(r.send());
        return r.invited();
    }

    /** One resend, the mail left to the caller to run after commit. Throws before writing anything when the invite cannot be re-sent. */
    Resent resendOne(OrgMembership me, Long memberId) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getInviteEmail() == null || seat.getJoinedAt() != null) throw new OrgNotFoundException(); // nothing pending to resend
        boolean revive = seat.getStatus() == OrgMemberStatus.REMOVED && InviteStatus.REASON_EXPIRED.equals(seat.getInviteEndedReason());
        if (seat.getStatus() != OrgMemberStatus.INVITED && !revive) throw new OrgNotFoundException();
        requireOwnOrWide(me, seat);
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        requireSeatable(org, seat.getRole());
        requireGrantableNow(me, seat);
        if (revive && holdsALiveSeat(me.orgId(), seat.getInviteEmail())) throw OrgException.alreadyMember(); // someone invited that address again meanwhile

        Instant now = Instant.now();
        int perWeek = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_RESENDS_PER_WEEK);
        boolean windowOpen = seat.getInviteResendWindowAt() != null && seat.getInviteResendWindowAt().isAfter(now.minus(Duration.ofDays(7)));
        int used = windowOpen ? seat.getInviteResendCount() : 0;
        if (used >= perWeek) throw OrgException.limitReached("inviteResends", perWeek);
        requireUnderDailyCap(me.orgId(), 1, now);

        String token = InviteTokens.newToken();
        Instant expires = now.plus(Duration.ofDays(settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_EXPIRY_DAYS)));
        seat.setInviteTokenHash(InviteTokens.hash(token));
        seat.setInviteExpiresAt(expires);
        seat.setInviteSentAt(now);
        seat.setInviteResendCount(used + 1);
        if (!windowOpen) seat.setInviteResendWindowAt(now);
        if (revive) {
            seat.setStatus(OrgMemberStatus.INVITED);
            seat.setInviteEndedReason(null);
            seat.setInviteEndedAt(null);
        }
        members.saveAndFlush(seat);

        audit.record(me, OrgAuditService.MEMBER_INVITE_RESEND, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()), "resend " + (used + 1) + " of " + perWeek + " this week" + (revive ? " (after expiry)" : ""));
        String inviter = displayNameOf(me.userId());
        String email = seat.getInviteEmail();
        String name = seat.getInviteName();
        String roleWord = roleWordOf(seat);
        String message = seat.getInviteMessage();
        Runnable send = () -> sendInvite(org, email, name, inviter, roleWord, token, expires, message);
        return new Resent(new OrgInviteResultDTO.Invited(seat.getId(), email, name, seat.getRole(), expires, parseIds(seat.getInviteRoleIdsJson())), send);
    }

    record Resent(OrgInviteResultDTO.Invited invited, Runnable send) {}

    // ---- revoke -----------------------------------------------------------------------------------------------------

    /**
     * Withdraws a pending invitation: the seat is REMOVED (so the address can be invited again), the token is deleted (the old link
     * answers the same generic 404 as a link that never existed), and the withdrawal is audited. An accepted invitation is a member now
     * (removing them is the members screen); one already ended is a 404.
     */
    @Transactional
    public void revoke(OrgMembership me, Long memberId) {
        revokeOne(me, memberId);
    }

    void revokeOne(OrgMembership me, Long memberId) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getInviteEmail() == null || seat.getStatus() != OrgMemberStatus.INVITED) throw new OrgNotFoundException();
        requireOwnOrWide(me, seat);
        seat.setStatus(OrgMemberStatus.REMOVED);
        seat.setInviteEndedReason(InviteStatus.REASON_REVOKED);
        seat.setInviteEndedAt(Instant.now());
        seat.setInviteTokenHash(null);
        members.saveAndFlush(seat);
        audit.record(me, OrgAuditService.MEMBER_INVITE_REVOKE, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()), "revoked roles=" + (seat.getInviteRoleIdsJson() == null ? seat.getRole() : seat.getInviteRoleIdsJson()));
    }

    // ---- planning: roles, placement, message -----------------------------------------------------------------------------

    Plan plan(OrgMembership me, Organization org, OrgInviteRequest req) {
        List<RoleView> views = resolveRoles(org, req);
        OrgRole mirror = views.isEmpty() ? legacyRole(req, org) : views.get(0).mirror();
        OrgRules.requireAssignable(mirror);
        requireSeatable(org, mirror);
        if (BEFORE_ACTIVATION.contains(org.getStatus()) && !views.stream().allMatch(v -> v.mirror() == OrgRole.ADMIN)) throw OrgException.seatState(org.getStatus().name());

        InviteCeilingChecker.Rights rights = ceiling.rightsOf(org.getId(), me.memberId());
        List<Long> refused = views.isEmpty() ? (ceiling.grantableMirror(rights, mirror) ? List.of() : List.of(-1L)) : ceiling.refused(rights, views);
        if (!refused.isEmpty()) {
            if (mirror == OrgRole.OWNER || views.stream().anyMatch(v -> RoleTemplates.OWNER.equals(v.templateKey()))) throw OrgException.invalid("roleIds", "an owner cannot be invited; transfer ownership instead");
            throw OrgException.roleCeiling(refused.stream().filter(id -> id > 0).toList());
        }

        Long dept = null;
        Long team = null;
        Long manager = null;
        if (req.departmentGroupId() != null || req.teamGroupId() != null) {
            requireMaySet(me, "members.group.set", "departmentGroupId");
            if (req.departmentGroupId() != null) dept = groupOfKind(me.orgId(), req.departmentGroupId(), OrgGroupKind.DEPARTMENT, "departmentGroupId");
            if (req.teamGroupId() != null) team = groupOfKind(me.orgId(), req.teamGroupId(), OrgGroupKind.TEAM, "teamGroupId");
        }
        if (req.managerMemberId() != null) {
            requireMaySet(me, "members.manager.set", "managerMemberId");
            manager = manager(me.orgId(), req.managerMemberId());
        }
        Long cohort = null;
        if (req.groupId() != null) cohort = groups.findByOrgIdAndId(me.orgId(), req.groupId()).orElseThrow(OrgNotFoundException::new).getId();
        // The existing scope code reads one group_id (TEAM kind = team, DEPARTMENT kind = department): mirror the placement there until X4.
        Long groupId = cohort != null ? cohort : team != null ? team : dept;
        Long supportOwnerId = supportOwner(me, mirror, req.supportOwnerMemberId());
        return new Plan(views, mirror, groupId, dept, team, manager, supportOwnerId, cleanMessage(req.message()));
    }

    private List<RoleView> resolveRoles(Organization org, OrgInviteRequest req) {
        List<Long> ids = req.roleIds() == null ? List.of() : req.roleIds().stream().filter(Objects::nonNull).distinct().toList();
        if (ids.size() > MAX_ROLES) throw OrgException.invalid("roleIds", "at most " + MAX_ROLES + " roles");
        if (!ids.isEmpty()) {
            List<RoleView> views = ceiling.resolve(org.getId(), ids).orElseThrow(OrgNotFoundException::new); // a role of another organization is a 404
            for (RoleView v : views) {
                if (v.mirror().isReserved()) throw OrgException.reserved("roleIds", v.key());
                if (RoleTemplates.OWNER.equals(v.templateKey())) throw OrgException.invalid("roleIds", "an owner cannot be invited; transfer ownership instead");
            }
            return views;
        }
        OrgRole legacy = legacyRole(req, org);
        OrgRules.requireAssignable(legacy);
        if (legacy == OrgRole.OWNER) throw OrgException.invalid("role", "an owner cannot be invited; transfer ownership instead");
        String templateKey = req.role() == null && CONSULTANT_ORGS.contains(org.getType()) ? RoleTemplates.CONSULTANT : LegacyRoleMirror.toTemplateKey(legacy).orElse(null);
        if (templateKey == null) return List.of();
        return ceiling.systemTemplate(org.getId(), templateKey).map(List::of).orElse(List.of()); // templates not seeded: the legacy enum alone, as before X1.6
    }

    private OrgRole legacyRole(OrgInviteRequest req, Organization org) {
        return req.role() != null ? req.role() : orgService.settingsOf(org).defaultRole();
    }

    private void requireMaySet(OrgMembership me, String key, String field) {
        if (me.canKey(key) || me.role() == OrgRole.OWNER || me.role() == OrgRole.ADMIN) return; // until X4.3 grants the keys: owners and admins
        throw OrgException.invalid(field, "you cannot set this");
    }

    private Long groupOfKind(Long orgId, Long groupId, OrgGroupKind kind, String field) {
        OrgGroup g = groups.findByOrgIdAndId(orgId, groupId).orElseThrow(OrgNotFoundException::new);
        if (g.getKind() != kind) throw OrgException.invalid(field, "must be a " + kind.name().toLowerCase(Locale.ROOT));
        return g.getId();
    }

    private Long manager(Long orgId, Long managerId) {
        OrgMember m = members.findByOrgIdAndId(orgId, managerId).orElseThrow(OrgNotFoundException::new);
        if (m.getStatus() != OrgMemberStatus.ACTIVE) throw OrgException.invalid("managerMemberId", "must be an active member");
        if (managerChainLoops(orgId, m.getId())) throw OrgException.managerCycle();
        return m.getId();
    }

    /** True when the reporting chain above {@code startId} returns to a member it already passed (corrupt data) or never ends within the walk limit. */
    boolean managerChainLoops(Long orgId, Long startId) {
        Set<Long> seen = new HashSet<>();
        Long current = startId;
        for (int hops = 0; current != null; hops++) {
            if (hops > MANAGER_WALK_MAX || !seen.add(current)) return true;
            final Long id = current;
            current = members.findByOrgIdAndId(orgId, id).map(OrgMember::getManagerMemberId).orElse(null);
        }
        return false;
    }

    /** A note to the invitee: plain text, trimmed, control characters dropped (line breaks kept), refused when it carries never-collected data. */
    static String cleanMessage(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String msg = raw.replaceAll("[\\p{Cntrl}&&[^\\n]]", "").strip();
        if (msg.isEmpty()) return null;
        if (msg.length() > MESSAGE_MAX) throw OrgException.invalid("message", "at most " + MESSAGE_MAX + " characters");
        if (!SensitivePatterns.scanField("message", msg).isEmpty()) throw OrgException.invalid("message", "must not contain ID, bank or tax numbers");
        return msg;
    }

    private Entry withFullName(Entry e, String fullName, List<OrgInviteResultDTO.Invalid> invalid) {
        if (fullName == null || fullName.isBlank()) return e;
        String name = fullName.strip().replaceAll("\\s+", " ");
        if (name.length() > 80 || !SensitivePatterns.scanField("name", name).isEmpty()) {
            invalid.add(new OrgInviteResultDTO.Invalid(trim(e.raw()), name.length() > 80 ? "too_long" : "sensitive_name"));
            return e;
        }
        return new Entry(e.raw(), e.email(), name.replaceAll("\\p{Cntrl}", ""));
    }

    // ---- roles on the seat --------------------------------------------------------------------------------------------------

    /** Writes the live role rows of a new invitation seat (first = primary); with no templates, falls back to the legacy dual write. */
    private void writeRoleRows(OrgMember seat, List<RoleView> views, Long grantedBy) {
        if (views.isEmpty()) {
            roleService.syncFromLegacy(seat);
            return;
        }
        Instant now = Instant.now();
        for (int i = 0; i < views.size(); i++) {
            OrgMemberRole r = new OrgMemberRole();
            r.setOrgId(seat.getOrgId());
            r.setMemberId(seat.getId());
            r.setRoleId(views.get(i).id());
            r.setPrimary(i == 0);
            r.setGrantedByMemberId(grantedBy);
            r.setGrantedAt(now);
            memberRoles.saveAndFlush(r);
        }
        seat.setPrimaryRoleId(views.get(0).id());
        members.saveAndFlush(seat);
    }

    /** The invitation's roles as the inviter is held to them now: the stored ids, else the seat's live role rows, else the enum alone. */
    private void requireGrantableNow(OrgMembership me, OrgMember seat) {
        List<Long> ids = parseIds(seat.getInviteRoleIdsJson());
        if (ids.isEmpty()) ids = memberRoles.findLiveByOrgIdAndMemberId(me.orgId(), seat.getId()).stream().map(OrgMemberRole::getRoleId).toList();
        InviteCeilingChecker.Rights rights = ceiling.rightsOf(me.orgId(), me.memberId());
        if (ids.isEmpty()) {
            if (!ceiling.grantableMirror(rights, seat.getRole())) throw new OrgNotFoundException();
            return;
        }
        List<RoleView> views = ceiling.resolve(me.orgId(), ids).orElseThrow(OrgNotFoundException::new);
        List<Long> refused = ceiling.refused(rights, views);
        if (!refused.isEmpty()) throw OrgException.roleCeiling(refused);
    }

    /** A caller whose invite right is narrowed (staff: members only) re-sends and withdraws only the people they look after. */
    private void requireOwnOrWide(OrgMembership me, OrgMember seat) {
        me.scopeOf(OrgPermission.MEMBERS_INVITE).orElseThrow(OrgNotFoundException::new);
        boolean narrowed = me.scopeOf(OrgPermission.MEMBERS_INVITE).filter(s -> s == OrgScope.MEMBER_ROLE_ONLY).isPresent();
        if (narrowed && !Objects.equals(seat.getSupportOwnerMemberId(), me.memberId()) && !Objects.equals(seat.getInvitedByMemberId(), me.memberId())) throw new OrgNotFoundException();
    }

    // ---- rules ------------------------------------------------------------------------------------------------------

    /** DRAFT / PENDING_SETUP_FEE take ADMIN invites only; SUSPENDED and CLOSED take none; ACTIVE and PAST_DUE take all. */
    private static void requireSeatable(Organization org, OrgRole role) {
        OrgStatus s = org.getStatus();
        if (OPEN_FOR_MEMBERS.contains(s)) return;
        if (BEFORE_ACTIVATION.contains(s) && role == OrgRole.ADMIN) return;
        throw OrgException.seatState(s.name());
    }

    /** True when {@code orgStatus} can take {@code role} into a seat right now (the same rule, for accepting). */
    static boolean canSeat(OrgStatus orgStatus, OrgRole role) {
        return OPEN_FOR_MEMBERS.contains(orgStatus) || (BEFORE_ACTIVATION.contains(orgStatus) && role == OrgRole.ADMIN);
    }

    /** STAFF invitees start with their inviter as support owner; naming another owner needs members.support_owner.set. */
    private Long supportOwner(OrgMembership me, OrgRole role, Long requested) {
        if (requested == null) return me.role() == OrgRole.STAFF && role == OrgRole.MEMBER ? me.memberId() : null;
        if (!me.can(OrgPermission.MEMBERS_SUPPORT_OWNER_SET)) throw OrgException.invalid("supportOwnerMemberId", "you cannot choose a support owner");
        OrgMember owner = members.findByOrgIdAndId(me.orgId(), requested).orElseThrow(OrgNotFoundException::new);
        if (owner.getStatus() != OrgMemberStatus.ACTIVE || owner.getRole() != OrgRole.STAFF) throw OrgException.invalid("supportOwnerMemberId", "must be an active staff member");
        return owner.getId();
    }

    private void requireUnderDailyCap(Long orgId, int wanted, Instant now) {
        int cap = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_DAILY_CAP);
        long sent = members.countByOrgIdAndInviteSentAtAfter(orgId, now.minus(Duration.ofHours(24)));
        if (sent + wanted > cap) throw OrgException.limitReached("inviteDaily", cap);
    }

    /** A live seat already uses this address, or the person behind this account address already holds one. */
    private boolean holdsALiveSeat(Long orgId, String email) {
        if (!members.findByOrgIdAndInviteEmailAndStatusIn(orgId, email, OrgMemberStatus.LIVE).isEmpty()) return true;
        return users
            .findOneByEmailIgnoreCase(email)
            .map(u -> !members.findByOrgIdAndUserIdAndStatusIn(orgId, u.getId(), OrgMemberStatus.LIVE).isEmpty())
            .orElse(false);
    }

    // ---- parsing ----------------------------------------------------------------------------------------------------

    /** {@code addr} or {@code Name <addr>}; a bad entry is reported in {@code invalid} and yields nothing. */
    Optional<Entry> parse(String raw, List<OrgInviteResultDTO.Invalid> invalid) {
        String name = null;
        String addr = raw;
        Matcher named = NAMED.matcher(raw);
        if (named.matches()) {
            addr = named.group(2);
            String n = named.group(1).strip().replaceAll("^\"|\"$", "").replaceAll("\\s+", " ");
            name = n.isEmpty() ? null : n;
        }
        addr = addr.strip().toLowerCase(Locale.ROOT);
        if (addr.length() > 254) {
            invalid.add(new OrgInviteResultDTO.Invalid(trim(raw), "too_long"));
            return Optional.empty();
        }
        if (!EMAIL.matcher(addr).matches()) {
            invalid.add(new OrgInviteResultDTO.Invalid(trim(raw), "malformed"));
            return Optional.empty();
        }
        if (name != null) {
            if (name.length() > 80 || !SensitivePatterns.scanField("name", name).isEmpty()) {
                invalid.add(new OrgInviteResultDTO.Invalid(trim(raw), name.length() > 80 ? "too_long" : "sensitive_name"));
                return Optional.empty();
            }
            name = name.replaceAll("\\p{Cntrl}", "");
        }
        return Optional.of(new Entry(raw, addr, name));
    }

    private static String trim(String s) {
        return s.length() > 120 ? s.substring(0, 120) : s;
    }

    // ---- ids as JSON -------------------------------------------------------------------------------------------------

    static String toJson(List<Long> ids) {
        return ids.stream().map(String::valueOf).collect(Collectors.joining(",", "[", "]"));
    }

    /** The ids of a stored {@code [1,2]} array; anything malformed reads as empty (the seat's live role rows then decide). */
    static List<Long> parseIds(String json) {
        if (json == null || json.isBlank()) return List.of();
        String body = json.strip();
        if (!body.startsWith("[") || !body.endsWith("]")) return List.of();
        body = body.substring(1, body.length() - 1).strip();
        if (body.isEmpty()) return List.of();
        List<Long> out = new ArrayList<>();
        try {
            for (String part : body.split(",")) out.add(Long.parseLong(part.strip()));
        } catch (NumberFormatException e) {
            return List.of();
        }
        return out;
    }

    // ---- email ------------------------------------------------------------------------------------------------------

    private void sendInvite(Organization org, String to, String name, String inviter, String roleWord, String token, Instant expires, String message) {
        try {
            // The logo is a placeholder until the branding publish exposes a signed asset URL for mail (X2.13 serves /tenant-assets/logo on the tenant host).
            mail.sendOrgInviteEmail(to, name, org.getName(), inviter, roleWord, List.of(), links.joinLink(org.getId(), token), EXPIRES.format(expires), message, null);
        } catch (RuntimeException e) {
            LOG.warn("Invite email could not be queued for org {}", org.getId(), e); // never log the address or the link
        }
    }

    static String roleWord(OrgRole role) {
        return switch (role) {
            case ADMIN -> "an admin";
            case STAFF -> "a support owner";
            case MARKETER -> "a marketer";
            case FINANCE -> "finance";
            default -> "a member";
        };
    }

    /** "a Marketing Specialist" for a data role (its own name), else the legacy word. */
    private static String roleWord(Plan plan) {
        return wordFor(plan.views(), plan.mirror());
    }

    private String roleWordOf(OrgMember seat) {
        List<Long> ids = parseIds(seat.getInviteRoleIdsJson());
        if (ids.isEmpty()) return roleWord(seat.getRole());
        return ceiling.resolve(seat.getOrgId(), ids).filter(v -> !v.isEmpty()).map(v -> wordFor(v, seat.getRole())).orElse(roleWord(seat.getRole()));
    }

    /** The legacy word for a system template that IS the legacy role ("a member"), else the role's own name ("a Marketing Specialist"), plus how many more. */
    private static String wordFor(List<RoleView> views, OrgRole mirror) {
        if (views.isEmpty()) return roleWord(mirror);
        RoleView first = views.get(0);
        boolean legacyTwin = views.size() == 1 && first.def().isSystem() && LegacyRoleMirror.toTemplateKey(first.mirror()).filter(k -> k.equals(first.templateKey())).isPresent();
        String word = legacyTwin ? roleWord(first.mirror()) : article(first.def().getName());
        return word + (views.size() > 1 ? " (and " + (views.size() - 1) + " more)" : "");
    }

    static String article(String name) {
        String n = name == null || name.isBlank() ? "member" : name.strip();
        return ("aeiouAEIOU".indexOf(n.charAt(0)) >= 0 ? "an " : "a ") + n;
    }

    /** First and last name of an account, or null when it has none (the email then says "The Acme team"). */
    String displayNameOf(Long userId) {
        return users
            .findById(userId)
            .map(OrgInviteService::nameOf)
            .filter(n -> !n.isBlank())
            .orElse(null);
    }

    static String nameOf(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().strip();
        String last = u.getLastName() == null ? "" : u.getLastName().strip();
        return (first + " " + last).strip();
    }

    /** Runs {@code task} once the surrounding transaction has committed, or at once when there is none. */
    static void afterCommit(Runnable task) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        task.run();
                    }
                }
            );
        } else {
            task.run();
        }
    }
}
