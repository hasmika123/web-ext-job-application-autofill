package com.dossier.api.service.ent;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgAccountMode;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.AccountModeQueryRepository;
import com.dossier.api.repository.ent.AccountModeQueryRepository.PersonalSeat;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.AdminAuditService;
import com.dossier.api.service.UserService;
import com.dossier.api.service.dto.AdminAccountDTOs.AccountModeCheck;
import com.dossier.api.service.dto.AdminAccountDTOs.MigrationReport;
import com.dossier.api.service.dto.AdminAccountDTOs.OrgMigration;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.settings.SettingsException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one-off migrator of decision O4 (docs/enterprise-v2/19 section 5.3): for a legacy SHARED organization whose members are PERSONAL accounts, a dry run
 * counts what would change and an apply moves each seat onto a NEW enterprise account of that organization. It is never automatic (no startup hook, no
 * schedule): the platform admin calls it per organization and applies it only with a reason, and it never flips {@code enterprise.separate_accounts} or
 * an organization's {@code account_mode} (that stays a separate, deliberate step after {@link #check} says zero).
 *
 * <p>What an apply does, per live seat on a personal account: creates the enterprise account through {@code UserService.createEnterpriseAccount} (name,
 * address and language only; ROLE_USER only; a random password nobody is told, so the person sets their own through the tenant's forgot-password page
 * or an Org Admin issues a temporary one), repoints {@code org_member.user_id} (roles, groups and assignments hang on the seat and follow it), and, when the
 * personal account created the organization, repoints {@code created_by_user_id}. The personal account is never read for anything else, never changed,
 * and no resume, mailbox, plan, token or setting is moved. Org data keyed by the person (consultant links, org resumes) is not re-linked: that needs the
 * person's consent and is deferred. An address that already has an enterprise account of the organization is reused (a re-run is idempotent).
 * The report carries counts and organization ids only.
 */
@Service
public class EnterpriseAccountMigrationJob {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseAccountMigrationJob.class);

    private final AccountModeQueryRepository query;
    private final OrganizationRepository organizations;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final UserService userService;
    private final AdminAuditService adminAudit;
    private final OrgAuditService orgAudit;

    public EnterpriseAccountMigrationJob(
        AccountModeQueryRepository query,
        OrganizationRepository organizations,
        OrgMemberRepository members,
        UserRepository users,
        UserService userService,
        AdminAuditService adminAudit,
        OrgAuditService orgAudit
    ) {
        this.query = query;
        this.organizations = organizations;
        this.members = members;
        this.users = users;
        this.userService = userService;
        this.adminAudit = adminAudit;
        this.orgAudit = orgAudit;
    }

    /** The pre-flip check of one organization (read-only). */
    @Transactional(readOnly = true)
    public AccountModeCheck check(Long orgId) {
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        long personal = query.countSeatsOnPersonalAccounts(orgId);
        return new AccountModeCheck(orgId, org.getAccountMode().name(), personal, query.countSeatsOnEnterpriseAccounts(orgId), personal == 0);
    }

    /** A dry run over every SHARED organization that holds seats on personal accounts. Writes nothing. */
    @Transactional(readOnly = true)
    public MigrationReport dryRunAll() {
        List<OrgMigration> perOrg = new ArrayList<>();
        for (Long orgId : query.sharedOrgIdsWithPersonalSeats()) {
            Organization org = organizations.findByOrgId(orgId).orElse(null);
            if (org != null) perOrg.add(walk(org, false));
        }
        return report(true, perOrg);
    }

    /** A dry run ({@code apply} false) or the migration ({@code apply} true, needs {@code reason}) of one organization. */
    @Transactional
    public MigrationReport run(Long orgId, boolean apply, String reason) {
        Organization org = organizations.findByOrgId(orgId).orElseThrow(OrgNotFoundException::new);
        if (org.getAccountMode() != OrgAccountMode.SHARED) throw OrgException.notEditable("Only a SHARED organization has personal accounts to migrate");
        String why = apply ? requireReason(reason) : null;
        OrgMigration done = walk(org, apply);
        if (apply) {
            String details = "seats=" + done.seatsOnPersonalAccounts() + " created=" + done.created() + " reused=" + done.reused() + " repointed=" + done.repointed() + " skipped=" + (done.skippedNoEmail() + done.conflicts());
            String login = SecurityUtils.getCurrentUserLogin().orElse(OrgAuditService.SYSTEM_ACTOR);
            adminAudit.record(AdminAuditService.ORG_ACCOUNT_MIGRATE, AdminAuditService.TARGET_ORG, String.valueOf(orgId), why, details);
            orgAudit.record(orgId, login, null, OrgAuditService.ADMIN_ACCOUNT_MIGRATE, OrgAuditService.TARGET_ORG, null, String.valueOf(orgId), details + " reason=" + why, null, null, null, "HIGH");
            LOG.info("Account migration applied to organization {}: {}", orgId, details);
        }
        return report(!apply, List.of(done));
    }

    private OrgMigration walk(Organization org, boolean apply) {
        Long orgId = org.getId();
        long considered = 0;
        long wouldCreate = 0;
        long wouldReuse = 0;
        long noEmail = 0;
        long conflicts = 0;
        long created = 0;
        long reused = 0;
        long repointed = 0;
        for (PersonalSeat s : query.seatsOnPersonalAccounts(orgId)) {
            considered++;
            User personal = users.findById(s.userId()).orElse(null);
            if (personal == null || personal.getEmail() == null || personal.getEmail().isBlank()) {
                noEmail++;
                continue;
            }
            User existing = users.findOneByOrgIdAndEmailIgnoreCase(orgId, personal.getEmail()).orElse(null);
            if (existing != null && !members.findByOrgIdAndUserIdAndStatusIn(orgId, existing.getId(), List.of(OrgMemberStatus.ACTIVE, OrgMemberStatus.SUSPENDED, OrgMemberStatus.INVITED)).isEmpty()) {
                conflicts++; // the address already has an enterprise account that holds a live seat: a person to look at, not to guess about
                continue;
            }
            if (existing != null) wouldReuse++;
            else wouldCreate++;
            if (!apply) continue;
            User target = existing;
            if (target == null) {
                target = userService.createEnterpriseAccount(orgId, personal.getEmail(), personal.getFirstName(), personal.getLastName(), UUID.randomUUID() + "Aa1!", null).user();
                created++;
            } else {
                reused++;
            }
            OrgMember seat = members.findByOrgIdAndId(orgId, s.memberId()).orElse(null);
            if (seat == null) continue;
            seat.setUserId(target.getId());
            members.saveAndFlush(seat);
            repointed++;
            if (personal.getId().equals(org.getCreatedByUserId())) {
                org.setCreatedByUserId(target.getId());
                organizations.save(org);
            }
        }
        return new OrgMigration(orgId, org.getSlug(), org.getAccountMode().name(), considered, wouldCreate, wouldReuse, noEmail, conflicts, created, reused, repointed);
    }

    private static MigrationReport report(boolean dryRun, List<OrgMigration> perOrg) {
        long seats = 0;
        long created = 0;
        long repointed = 0;
        for (OrgMigration o : perOrg) {
            seats += o.seatsOnPersonalAccounts();
            created += o.created();
            repointed += o.repointed();
        }
        return new MigrationReport(dryRun, perOrg.size(), seats, created, repointed, 0, perOrg);
    }

    private static String requireReason(String raw) {
        String reason = raw == null ? "" : raw.strip();
        if (reason.length() < SettingsException.REASON_MIN_LENGTH) {
            throw OrgException.invalid("reason", "a reason of at least " + SettingsException.REASON_MIN_LENGTH + " characters is required to apply");
        }
        return reason.length() > 500 ? reason.substring(0, 500) : reason;
    }
}
