package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.enumeration.OrgScope;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.org.OrgInviteBatch;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgGroupRepository;
import com.dossier.api.repository.org.OrgInviteBatchRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.MailService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.privacy.SensitivePatterns;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Invites people to an organization by email and sends the link again (O2.2; docs/design/org/onboarding-invites.md section
 * 3.2). An invite is an {@code org_member} row in state INVITED holding the SHA-256 of a one-time token; the token itself
 * exists only in the email. Joining is {@link OrgJoinService}.
 *
 * <p><b>Rules, all from the design or an admin setting (nothing is hard-coded):</b>
 * <ul>
 *   <li>At most {@code org.invite.maxPerBatch} addresses a call, at most {@code org.invite.daily_cap} invite emails per org
 *       in 24 hours (sends and re-sends together), a link works {@code org.invite.expiryDays} days, a re-send rotates the
 *       token and is limited to {@code org.invite.resendsPerWeek} a week.</li>
 *   <li>Before an organization is activated (DRAFT, PENDING_SETUP_FEE) only ADMIN invites are allowed, at most
 *       {@code org.invite.draftAdminCap}; members are refused with 409 {@code SEAT_STATE}. A SUSPENDED or CLOSED org invites
 *       nobody.</li>
 *   <li>Who may invite whom follows {@code members.invite} and its narrowing: STAFF invite MEMBERs only (and become their
 *       support owner), ADMIN invite below ADMIN, OWNER anyone but another OWNER. COACH is reserved and refused.</li>
 *   <li>A group or support owner from another org is a 404, like every foreign id.</li>
 * </ul>
 *
 * <p>Every call writes exactly one audit row (the count and the role, never the addresses). The emails go out only after the
 * transaction commits, so a rolled-back batch emails nobody.
 */
@Service
public class OrgInviteService {

    private static final Logger LOG = LoggerFactory.getLogger(OrgInviteService.class);

    static final Pattern EMAIL = Pattern.compile("^[^@\\s<>,;\"']+@[^@\\s<>,;\"']+\\.[^@\\s<>,;\"']+$");
    private static final Pattern NAMED = Pattern.compile("^(.*)<\\s*([^<>]+?)\\s*>\\s*$");
    private static final DateTimeFormatter EXPIRES = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH).withZone(ZoneOffset.UTC);
    private static final Set<OrgStatus> OPEN_FOR_MEMBERS = EnumSet.of(OrgStatus.ACTIVE, OrgStatus.PAST_DUE);
    private static final Set<OrgStatus> BEFORE_ACTIVATION = EnumSet.of(OrgStatus.DRAFT, OrgStatus.PENDING_SETUP_FEE);

    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final OrgGroupRepository groups;
    private final OrgInviteBatchRepository batches;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final OrgService orgService;
    private final ResumeBuilderSettings settings;
    private final MailService mail;
    private final String baseUrl;

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
        @Value("${jhipster.mail.base-url:http://localhost:3000}") String baseUrl
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
        this.baseUrl = baseUrl.replaceAll("/+$", "");
    }

    /** One entry of the request, parsed. */
    record Entry(String raw, String email, String name) {}

    // ---- invite -----------------------------------------------------------------------------------------------------

    @Transactional
    public OrgInviteResultDTO invite(OrgMembership me, OrgInviteRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        if (req.emails() == null || req.emails().isEmpty()) throw OrgException.invalid("emails", "must name at least one address");
        int perBatch = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_MAX_PER_BATCH);
        if (req.emails().size() > perBatch) throw OrgException.limitReached("inviteBatch", perBatch);

        OrgRole role = req.role() != null ? req.role() : orgService.settingsOf(org).defaultRole();
        OrgRules.requireAssignable(role);
        requireMayInvite(me, role);
        requireSeatable(org, role);

        Long groupId = null;
        if (req.groupId() != null) groupId = groups.findByOrgIdAndId(me.orgId(), req.groupId()).orElseThrow(OrgNotFoundException::new).getId();
        Long supportOwnerId = supportOwner(me, role, req.supportOwnerMemberId());

        // Parse and validate every entry; nothing is written until the whole call is known to fit.
        List<OrgInviteResultDTO.Invalid> invalid = new ArrayList<>();
        List<Entry> entries = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String raw : req.emails()) {
            String shown = raw == null ? "" : raw.strip();
            Optional<Entry> parsed = parse(shown, invalid);
            if (parsed.isEmpty()) continue;
            if (!seen.add(parsed.get().email())) {
                invalid.add(new OrgInviteResultDTO.Invalid(shown, "duplicate"));
                continue;
            }
            entries.add(parsed.get());
        }

        List<String> alreadyMember = new ArrayList<>();
        List<Entry> fresh = new ArrayList<>();
        for (Entry e : entries) {
            if (holdsALiveSeat(me.orgId(), e.email())) alreadyMember.add(e.email());
            else fresh.add(e);
        }

        if (role == OrgRole.ADMIN && BEFORE_ACTIVATION.contains(org.getStatus())) {
            int cap = settings.getInt(ResumeBuilderSettingKeys.ORG_INVITE_DRAFT_ADMIN_CAP);
            long admins = members.countByOrgIdAndRoleAndStatusIn(me.orgId(), OrgRole.ADMIN, OrgMemberStatus.LIVE);
            if (admins + fresh.size() > cap) throw OrgException.limitReached("draftAdmins", cap);
        }
        Instant now = Instant.now();
        requireUnderDailyCap(me.orgId(), fresh.size(), now);

        if (fresh.isEmpty()) {
            return new OrgInviteResultDTO(null, List.of(), invalid, alreadyMember); // nothing to send, nothing to record
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
        List<OrgInviteResultDTO.Invited> invited = new ArrayList<>();
        List<Runnable> sends = new ArrayList<>();
        for (Entry e : fresh) {
            String token = InviteTokens.newToken();
            OrgMember seat = new OrgMember();
            seat.setOrgId(me.orgId());
            seat.setRole(role);
            seat.setStatus(OrgMemberStatus.INVITED);
            seat.setInviteEmail(e.email());
            seat.setInviteName(e.name());
            seat.setInviteTokenHash(InviteTokens.hash(token));
            seat.setInviteExpiresAt(expires);
            seat.setInvitedByMemberId(me.memberId());
            seat.setInviteBatchId(batch.getId());
            seat.setInviteSentAt(now);
            seat.setGroupId(groupId);
            seat.setSupportOwnerMemberId(supportOwnerId);
            try {
                seat = members.saveAndFlush(seat);
            } catch (DataIntegrityViolationException raced) { // someone invited the same address a moment ago
                alreadyMember.add(e.email());
                continue;
            }
            invited.add(new OrgInviteResultDTO.Invited(seat.getId(), e.email(), e.name(), role, expires));
            sends.add(() -> sendInvite(org, e.email(), e.name(), inviter, role, token, expires));
        }

        audit.record(me, OrgAuditService.MEMBER_INVITE, OrgAuditService.TARGET_ORG, null, String.valueOf(batch.getId()), "invited=" + invited.size() + " role=" + role + " invalid=" + invalid.size());
        afterCommit(() -> sends.forEach(Runnable::run));
        return new OrgInviteResultDTO(batch.getId(), invited, invalid, alreadyMember);
    }

    // ---- resend -----------------------------------------------------------------------------------------------------

    /** Rotates the token of a pending invite and emails the new link. Limited to N a week per invite (admin setting). */
    @Transactional
    public OrgInviteResultDTO.Invited resend(OrgMembership me, Long memberId) {
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() != OrgMemberStatus.INVITED || seat.getInviteEmail() == null) throw new OrgNotFoundException(); // nothing pending to resend
        requireMayInvite(me, seat.getRole());
        if (me.scopeOf(OrgPermission.MEMBERS_INVITE).filter(s -> s == OrgScope.MEMBER_ROLE_ONLY).isPresent() && !java.util.Objects.equals(seat.getSupportOwnerMemberId(), me.memberId())) {
            throw new OrgNotFoundException(); // STAFF only re-send their own people
        }
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        requireSeatable(org, seat.getRole());

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
        members.saveAndFlush(seat);

        audit.record(me, OrgAuditService.MEMBER_INVITE_RESEND, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()), "resend " + (used + 1) + " of " + perWeek + " this week");
        String inviter = displayNameOf(me.userId());
        String email = seat.getInviteEmail();
        String name = seat.getInviteName();
        OrgRole role = seat.getRole();
        afterCommit(() -> sendInvite(org, email, name, inviter, role, token, expires));
        return new OrgInviteResultDTO.Invited(seat.getId(), email, name, role, expires);
    }

    // ---- rules ------------------------------------------------------------------------------------------------------

    /** The role must be one the caller may invite: STAFF only MEMBER, ADMIN only below ADMIN, nobody a second OWNER. */
    private void requireMayInvite(OrgMembership me, OrgRole role) {
        if (role == OrgRole.OWNER) throw OrgException.invalid("role", "an owner cannot be invited; transfer ownership instead");
        OrgScope scope = me.scopeOf(OrgPermission.MEMBERS_INVITE).orElseThrow(OrgNotFoundException::new);
        if (scope == OrgScope.MEMBER_ROLE_ONLY && role != OrgRole.MEMBER) throw OrgException.invalid("role", "you can invite members only");
        if (me.role() == OrgRole.ADMIN && role == OrgRole.ADMIN) throw OrgException.invalid("role", "only an owner can invite another admin");
    }

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
            addr = named.group(1).isBlank() ? named.group(2) : named.group(2);
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

    // ---- email ------------------------------------------------------------------------------------------------------

    private void sendInvite(Organization org, String to, String name, String inviter, OrgRole role, String token, Instant expires) {
        try {
            mail.sendOrgInviteEmail(to, name, org.getName(), inviter, roleWord(role), List.of(), baseUrl + "/join/t/" + token, EXPIRES.format(expires));
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
