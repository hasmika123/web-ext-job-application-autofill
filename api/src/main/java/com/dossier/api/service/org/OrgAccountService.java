package com.dossier.api.service.org;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.UserService;
import com.dossier.api.service.dto.org.OrgAccountDTOs.CreateRequest;
import com.dossier.api.service.dto.org.OrgAccountDTOs.CreateResult;
import com.dossier.api.service.dto.org.OrgAccountDTOs.ResetResult;
import com.dossier.api.service.dto.org.OrgAccountDTOs.Suggestion;
import com.dossier.api.service.dto.org.OrgInviteRequest;
import com.dossier.api.service.dto.org.OrgInviteResultDTO;
import com.dossier.api.service.ent.AccountOnboardingNotices;
import com.dossier.api.service.ent.TenantUrls;
import com.dossier.api.service.privacy.SensitivePatterns;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Direct account creation by an Org Admin (anyone holding {@code members.invite}): the employee gets an ACTIVE account on the spot
 * with a server-generated or admin-chosen TEMPORARY password, is attached to the organization with the roles, team and manager the
 * invitation form offers (the very same validation: role ceiling, groups, manager chain), and must change the password at first
 * sign-in. In a SEPARATE organization (decision O4) the account is always a NEW enterprise account of that organization, whatever
 * personal accounts exist. The invitation flow is untouched and stays the alternative; in a legacy SHARED organization it is also the fallback when the address already has a
 * Kiwiply account: that person keeps their own password and receives a normal invitation to accept (their consent to share data with
 * the organization is theirs to give, so nobody is attached to an organization behind their back).
 *
 * <p>The clear-text password exists only in the request (when the admin typed or accepted one) or in the one response that returns a
 * generated one; it is hashed before it is stored and is never logged, audited or e-mailed. Audit rows are HIGH and carry the address and
 * the roles. At most {@code org.account.createPerHour} creations and resets per organization per hour.
 */
@Service
public class OrgAccountService {

    private final OrgInviteService invites;
    private final OrganizationRepository orgs;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final UserService userService;
    private final OrgAuditService audit;
    private final OrgAuditEventRepository auditRows;
    private final ResumeBuilderSettings settings;
    private final AccountOnboardingNotices notices;
    private final TenantUrls tenantUrls;
    private final AccountScopes accountScopes;

    public OrgAccountService(
        OrgInviteService invites,
        OrganizationRepository orgs,
        OrgMemberRepository members,
        UserRepository users,
        UserService userService,
        OrgAuditService audit,
        OrgAuditEventRepository auditRows,
        ResumeBuilderSettings settings,
        AccountOnboardingNotices notices,
        TenantUrls tenantUrls,
        AccountScopes accountScopes
    ) {
        this.invites = invites;
        this.orgs = orgs;
        this.members = members;
        this.users = users;
        this.userService = userService;
        this.audit = audit;
        this.auditRows = auditRows;
        this.settings = settings;
        this.notices = notices;
        this.tenantUrls = tenantUrls;
        this.accountScopes = accountScopes;
    }

    /** A fresh generated password for the form to show. Nothing is stored; it is just a suggestion the admin may overwrite. */
    public Suggestion suggest() {
        return new Suggestion(UserService.generateTempPassword());
    }

    @Transactional
    public CreateResult create(OrgMembership me, CreateRequest req) {
        if (req == null) throw OrgException.invalid("body", "is required");
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);

        List<OrgInviteResultDTO.Invalid> invalid = new ArrayList<>();
        String raw = req.email() == null ? "" : req.email().strip();
        OrgInviteService.Entry entry = invites.parse(raw, invalid).orElseThrow(() -> OrgException.invalid("email", invalid.isEmpty() ? "must be an email address" : invalid.get(0).reason()));
        String fullName = cleanName(req.fullName());

        OrgInviteRequest asInvite = new OrgInviteRequest(List.of(entry.email()), req.role(), req.groupId(), req.supportOwnerMemberId(), req.roleIds(), req.departmentGroupId(), req.teamGroupId(), req.managerMemberId(), fullName, null);
        OrgInviteService.Plan plan = invites.plan(me, org, asInvite); // the same role ceiling, groups and manager rules as an invitation
        if (invites.holdsALiveSeat(me.orgId(), entry.email())) throw OrgException.alreadyMember();
        requireUnderHourlyCap(me.orgId());

        // O4: a SEPARATE organization (switch on) always gets a NEW enterprise account of its own. A personal account with the same address is
        // never read, so there is no INVITED / "known address" branch and nothing in the answer depends on one (docs/enterprise-v2/19 R2, R7).
        boolean separate = accountScopes.scopeOf(me.orgId()) != null;
        if (!separate && accountScopes.findMemberAccountByEmail(me.orgId(), entry.email()).isPresent()) {
            // Someone with a Kiwiply account: no password is issued or changed; they get the normal invitation and accept it themselves.
            OrgInviteResultDTO r = invites.invite(me, asInvite);
            Long seatId = r.invited().isEmpty() ? null : r.invited().get(0).memberId();
            audit.record(me.orgId(), me.login(), me.role(), OrgAuditService.MEMBER_ACCOUNT_CREATE, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seatId),
                "mode=INVITED email=" + entry.email() + " roles=" + plan.roleKeys(), null, null, null, "HIGH");
            return new CreateResult(seatId, entry.email(), "INVITED", null, null, plan.roleIds());
        }

        String chosen = req.password() == null || req.password().isEmpty() ? null : req.password();
        if (chosen != null && (chosen.length() < 4 || chosen.length() > 100)) throw OrgException.invalid("password", "must be 4 to 100 characters");
        Instant expires = Instant.now().plus(Duration.ofDays(settings.getInt(ResumeBuilderSettingKeys.ORG_TEMP_PASSWORD_EXPIRY_DAYS)));
        String[] names = split(fullName != null ? fullName : entry.name());
        UserService.TempAccount account;
        if (separate) {
            User former = userService.findEnterpriseAccount(me.orgId(), entry.email()).orElse(null);
            if (former == null) {
                try {
                    account = userService.createEnterpriseAccount(me.orgId(), entry.email(), names[0], names[1], chosen, expires);
                } catch (com.dossier.api.service.EmailAlreadyUsedException raced) { // created at the same moment: the same generic answer as a duplicate
                    throw OrgException.alreadyMember();
                }
            } else if (former.isPasswordChangeRequired()) { // a former member who never chose a password: the same account, a fresh temporary one
                account = new UserService.TempAccount(former, userService.resetTempPassword(former, chosen, expires), false);
            } else { // their own credential is theirs: an Org Admin never overwrites it (they can invite the person instead)
                throw OrgException.alreadyMember();
            }
        } else {
            account = userService.createTempAccount(entry.email(), names[0], names[1], chosen, expires);
        }

        OrgMember seat = new OrgMember();
        seat.setOrgId(me.orgId());
        seat.setUserId(account.user().getId());
        seat.setRole(plan.mirror());
        seat.setStatus(OrgMemberStatus.ACTIVE);
        seat.setJoinedAt(Instant.now());
        seat.setInvitedByMemberId(me.memberId());
        seat.setGroupId(plan.groupId());
        seat.setDepartmentGroupId(plan.departmentGroupId());
        seat.setTeamGroupId(plan.teamGroupId());
        seat.setManagerMemberId(plan.managerMemberId());
        seat.setSupportOwnerMemberId(plan.supportOwnerId());
        seat = members.saveAndFlush(seat);
        invites.writeRoleRows(seat, plan.views(), me.memberId());

        audit.record(me.orgId(), me.login(), me.role(), OrgAuditService.MEMBER_ACCOUNT_CREATE, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "mode=ACCOUNT_CREATED email=" + entry.email() + " roles=" + plan.roleKeys() + " dept=" + plan.departmentGroupId() + " team=" + plan.teamGroupId() + " manager=" + plan.managerMemberId(), null, null, null, "HIGH");
        User creator = users.findById(me.userId()).orElse(null);
        notices.accountCreated(org, tenantUrls.liveHost(me.orgId()), account.user(), OrgInviteService.roleWord(plan).replaceFirst("^(an? )", ""), workspaceKeyOf(plan), false, true, expires, creator);
        return new CreateResult(seat.getId(), entry.email(), "ACCOUNT_CREATED", chosen == null ? account.tempPassword() : null, expires, plan.roleIds());
    }

    /**
     * A new temporary password for a member who has NOT yet chosen their own. A member who has is never touched (their credential is
     * theirs): 409 {@code PASSWORD_ALREADY_SET}, they use Forgot password. 404 for
     * another organization's seat, for the caller's own seat, and for an owner unless the caller is an owner.
     */
    @Transactional
    public ResetResult reset(OrgMembership me, Long memberId, String rawReason) {
        String reason = rawReason == null ? "" : rawReason.strip();
        if (reason.length() < 10) throw OrgException.invalid("reason", "a reason of at least 10 characters is required");
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getUserId() == null || seat.getStatus() != OrgMemberStatus.ACTIVE || seat.getUserId().equals(me.userId())) throw new OrgNotFoundException();
        if (seat.getRole() == OrgRole.OWNER && me.role() != OrgRole.OWNER) throw new OrgNotFoundException();
        User user = users.findById(seat.getUserId()).orElseThrow(OrgNotFoundException::new);
        if (!user.isPasswordChangeRequired()) {
            throw OrgException.coded(409, "PASSWORD_ALREADY_SET", "This person has already chosen their own password. They can use Forgot password on the sign-in page.", Map.of());
        }
        requireUnderHourlyCap(me.orgId());
        Organization org = orgs.findByOrgId(me.orgId()).orElseThrow(OrgNotFoundException::new);
        Instant expires = Instant.now().plus(Duration.ofDays(settings.getInt(ResumeBuilderSettingKeys.ORG_TEMP_PASSWORD_EXPIRY_DAYS)));
        String temp = userService.resetTempPassword(user, null, expires);
        audit.record(me.orgId(), me.login(), me.role(), OrgAuditService.MEMBER_PASSWORD_RESET, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "email=" + user.getEmail() + " reason=" + (reason.length() > 300 ? reason.substring(0, 300) : reason), null, null, null, "HIGH");
        notices.passwordReset(org, tenantUrls.liveHost(me.orgId()), user, expires, users.findById(me.userId()).orElse(null));
        return new ResetResult(seat.getId(), user.getEmail(), temp, expires);
    }

    /** The workspace the person's primary role opens: the role's template, else the template the legacy role mirrors to. */
    private static String workspaceKeyOf(OrgInviteService.Plan plan) {
        String template = plan.views().isEmpty()
            ? com.dossier.api.service.ent.LegacyRoleMirror.toTemplateKey(plan.mirror()).orElse(null)
            : plan.views().get(0).templateKey();
        return template == null ? null : com.dossier.api.service.ent.RoleTemplates.find(template).map(com.dossier.api.service.ent.RoleTemplates.Template::workspaceKey).orElse(null);
    }

    private void requireUnderHourlyCap(Long orgId) {
        int cap = settings.getInt(ResumeBuilderSettingKeys.ORG_ACCOUNT_CREATE_PER_HOUR);
        long used = auditRows.countByOrgIdAndActionInAndCreatedAtAfter(orgId, List.of(OrgAuditService.MEMBER_ACCOUNT_CREATE, OrgAuditService.MEMBER_PASSWORD_RESET), Instant.now().minus(Duration.ofHours(1)));
        if (used >= cap) throw OrgException.limitReached("accountCreatePerHour", cap);
    }

    /** A person name: trimmed, control characters dropped, at most 80 characters, and refused when it looks like an ID, bank or tax number. */
    private static String cleanName(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String name = raw.strip().replaceAll("\\s+", " ").replaceAll("\\p{Cntrl}", "");
        if (name.length() > 80) throw OrgException.invalid("fullName", "at most 80 characters");
        if (!SensitivePatterns.scanField("name", name).isEmpty()) throw OrgException.invalid("fullName", "must not contain ID, bank or tax numbers");
        return name;
    }

    private static String[] split(String full) {
        if (full == null) return new String[] { null, null };
        String n = full.strip();
        int i = n.indexOf(' ');
        return i < 0 ? new String[] { n, null } : new String[] { n.substring(0, i), n.substring(i + 1) };
    }
}
