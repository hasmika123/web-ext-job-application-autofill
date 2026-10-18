package com.dossier.api.service.ent.members;

import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgRole;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.AccountDeletionService;
import com.dossier.api.service.AccountExportService;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * The end of an offboarded person's ENTERPRISE account (decision O4, docs/enterprise-v2/19 phase S8, open questions O4-Q2 and O4-Q3).
 *
 * <p><b>Retention.</b> An offboarded person's account stays, disabled, for {@code org.account.retentionDays} (default 90) counted from
 * {@code org_member.left_at}; then {@link #runDue} erases it through {@link AccountDeletionService#deleteEnterpriseAccount} (the daily
 * {@link #runScheduled}). One row per transaction, each in its own tenant scope; a row that fails is logged and left for the next run.
 *
 * <p><b>Export.</b> Within that window an administrator who may offboard the person can obtain the account's export ({@code AccountExportService}, the same
 * data the person's own export holds, never an inbox password) to hand over, because the person can no longer sign in. Audit {@code ACCOUNT_EXPORTED}, HIGH.
 *
 * <p><b>Early erase.</b> The same administrator may erase the account before the window ends (a person's request). Audit {@code ACCOUNT_ERASED}, HIGH.
 *
 * <p>Everything here concerns an account whose {@code org_id} is the organization and a seat that has ended (REMOVED). A seat of a legacy SHARED organization
 * (a personal account), an active or suspended seat, and a seat of another organization are never touched: the generic 404 or a 409, as the route says.
 * A personal account with the same address is a different row and is never read or changed.
 */
@Service
public class EnterpriseAccountRetention {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseAccountRetention.class);

    public static final String CODE_NOT_AN_ENTERPRISE_ACCOUNT = "NO_ENTERPRISE_ACCOUNT";

    private final OrgMemberRepository members;
    private final EnterpriseAccountLifecycle accounts;
    private final AccountDeletionService deletion;
    private final AccountExportService exports;
    private final OrgAuditService audit;
    private final MemberAccess access;
    private final Clock clock;
    private final TransactionTemplate rowTx;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public EnterpriseAccountRetention(
        OrgMemberRepository members,
        EnterpriseAccountLifecycle accounts,
        AccountDeletionService deletion,
        AccountExportService exports,
        OrgAuditService audit,
        MemberAccess access,
        PlatformTransactionManager txManager
    ) {
        this(members, accounts, deletion, exports, audit, access, txManager, Clock.systemUTC());
    }

    EnterpriseAccountRetention(
        OrgMemberRepository members,
        EnterpriseAccountLifecycle accounts,
        AccountDeletionService deletion,
        AccountExportService exports,
        OrgAuditService audit,
        MemberAccess access,
        PlatformTransactionManager txManager,
        Clock clock
    ) {
        this.members = members;
        this.accounts = accounts;
        this.deletion = deletion;
        this.exports = exports;
        this.audit = audit;
        this.access = access;
        this.clock = clock;
        this.rowTx = new TransactionTemplate(txManager);
    }

    // ---- the retention job ------------------------------------------------------------------------------------------------------

    /** Daily: erases every enterprise account whose person left more than the retention window ago. */
    @Scheduled(cron = "${dossier.ent.account-retention-cron:0 20 3 * * *}", zone = "UTC")
    public void runScheduled() {
        try {
            int erased = runDue(Instant.now(clock));
            if (erased > 0) LOG.info("Account retention job erased {} enterprise account(s)", erased);
        } catch (RuntimeException e) {
            LOG.error("Account retention job failed", e);
        }
    }

    /** Erases the enterprise accounts of REMOVED seats whose {@code left_at} is at or before {@code now} minus the retention days; returns how many. */
    public int runDue(Instant now) {
        int days = accounts.retentionDays();
        Instant cutoff = now.minus(Duration.ofDays(days));
        List<Object[]> due = em
            .createQuery(
                "select m.orgId, m.id from OrgMember m, User u where m.userId = u.id and u.orgId = m.orgId and m.status = :removed and m.leftAt is not null and m.leftAt <= :cutoff order by m.leftAt asc, m.id asc",
                Object[].class
            )
            .setParameter("removed", OrgMemberStatus.REMOVED)
            .setParameter("cutoff", cutoff)
            .getResultList();
        int erased = 0;
        for (Object[] row : due) {
            Long orgId = (Long) row[0];
            Long memberId = (Long) row[1];
            try {
                Boolean ok = TenantScoped.get(orgId, () -> rowTx.execute(status -> eraseSeat(orgId, memberId, OrgAuditService.SYSTEM_ACTOR, null, "RETENTION", days)));
                if (Boolean.TRUE.equals(ok)) erased++;
            } catch (RuntimeException e) {
                LOG.warn("Retention erase of seat {} in organization {} failed: {}", memberId, orgId, e.toString());
            }
        }
        return erased;
    }

    // ---- an administrator's early erase and export ----------------------------------------------------------------------------------

    /** Erases the enterprise account of an offboarded person now. 404 when the caller cannot reach the seat; 409 when it is not an ended enterprise seat. */
    @Transactional
    public void erase(OrgMembership me, Long memberId) {
        OrgMember seat = reachableEnded(me, memberId);
        if (!eraseSeat(me.orgId(), seat.getId(), me.login(), me.role(), "ADMIN_REQUEST", accounts.retentionDays())) {
            throw notExportable();
        }
    }

    /** The export of an offboarded person's enterprise account, for the administrator to hand over. 404 when unreachable; 409 when there is no such account. */
    @Transactional
    public Map<String, Object> export(OrgMembership me, Long memberId) {
        OrgMember seat = reachableEnded(me, memberId);
        User account = accounts.accountOf(me.orgId(), seat).orElseThrow(EnterpriseAccountRetention::notExportable);
        Map<String, Object> out = exports.exportAccount(account.getLogin());
        audit.record(
            me.orgId(), me.login(), me.role(), MemberAuditActions.ACCOUNT_EXPORTED, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "{\"sections\":" + out.size() + "}", null, null, null, "HIGH"
        );
        return out;
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------------------

    private OrgMember reachableEnded(OrgMembership me, Long memberId) {
        access.requireWritable(me, MemberAccess.KEY_REMOVE);
        OrgMember seat = members.findByOrgIdAndId(me.orgId(), memberId).orElseThrow(OrgNotFoundException::new);
        if (seat.getStatus() == OrgMemberStatus.ERASED || !access.canAct(me, MemberAccess.KEY_REMOVE, seat.getId())) throw new OrgNotFoundException();
        if (seat.getStatus() != OrgMemberStatus.REMOVED || accounts.accountOf(me.orgId(), seat).isEmpty()) throw notExportable();
        return seat;
    }

    private boolean eraseSeat(Long orgId, Long memberId, String actorLogin, OrgRole actorRole, String mode, int retentionDays) {
        Optional<OrgMember> found = members.findByOrgIdAndId(orgId, memberId);
        if (found.isEmpty() || found.get().getStatus() != OrgMemberStatus.REMOVED) return false;
        OrgMember seat = found.get();
        Optional<User> account = accounts.accountOf(orgId, seat);
        if (account.isEmpty()) return false;
        deletion.deleteEnterpriseAccount(orgId, account.get().getId());
        audit.record(
            orgId, actorLogin, actorRole, MemberAuditActions.ACCOUNT_ERASED, OrgAuditService.TARGET_MEMBER, null, String.valueOf(seat.getId()),
            "{\"mode\":\"" + mode + "\",\"retentionDays\":" + retentionDays + "}", null, null, null, "HIGH"
        );
        return true;
    }

    private static OrgException notExportable() {
        return OrgException.coded(409, CODE_NOT_AN_ENTERPRISE_ACCOUNT, "Only an offboarded person's organization account can be exported or erased this way", Map.of());
    }
}
