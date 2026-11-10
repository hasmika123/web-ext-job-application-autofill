package com.dossier.api.service.org;

import com.dossier.api.domain.enumeration.InviteStatus;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.TenantScoped;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ends invitations whose link ran out (X1.15). Until it runs an expired invitation is still INVITED (the Invitations page and the join
 * endpoints already treat it as expired by comparing the clock), so this job is housekeeping with one real effect: it frees the
 * address's one-live-seat slot, so the person can be invited again, and it gives the audit trail one {@code MEMBER_INVITE_EXPIRED} row.
 *
 * <p>Scheduled work acts for ONE organization at a time inside {@link TenantScoped#run} (X1.10, 04-tenancy-and-security.md section 3):
 * the platform-wide query only lists which organizations have work, every row is then read and written through that organization's
 * own scope, and the tenant is gone again when its turn ends. The job holds no tenant of its own.
 */
@Component
public class OrgInviteExpiryJob {

    private static final Logger LOG = LoggerFactory.getLogger(OrgInviteExpiryJob.class);
    static final int PAGE = 500;
    static final int MAX_PAGES_PER_ORG = 20;

    private final OrgMemberRepository members;
    private final OrgInviteExpiryWork work;

    public OrgInviteExpiryJob(OrgMemberRepository members, OrgInviteExpiryWork work) {
        this.members = members;
        this.work = work;
    }

    @Scheduled(cron = "${dossier.org.invite-expiry-cron:0 10 * * * *}", zone = "UTC")
    public void scheduled() {
        try {
            int ended = runOnce(Instant.now());
            if (ended > 0) LOG.info("Expired {} organization invitations", ended);
        } catch (RuntimeException e) {
            LOG.warn("Invitation expiry run failed", e); // the next run retries; nothing here is time critical
        }
    }

    /** One pass over every organization with expired invitations; returns how many invitations were ended. */
    public int runOnce(Instant now) {
        AtomicInteger total = new AtomicInteger();
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(members.findOrgIdsWithExpiredInvites(now))); // the one cross-tenant read: which orgs have work
        for (Long orgId : orgIds) {
            try {
                TenantScoped.run(orgId, () -> {
                    for (int page = 0; page < MAX_PAGES_PER_ORG; page++) {
                        int n = work.expireOrg(orgId, now);
                        total.addAndGet(n);
                        if (n < PAGE) break;
                    }
                });
            } catch (RuntimeException e) {
                LOG.warn("Invitation expiry failed for org {}", orgId, e); // one organization's failure never stops the others
            }
        }
        return total.get();
    }

    /** The transactional step for one organization, split out so the proxy applies to it. */
    @Component
    public static class OrgInviteExpiryWork {

        private final OrgMemberRepository members;
        private final OrgAuditService audit;

        public OrgInviteExpiryWork(OrgMemberRepository members, OrgAuditService audit) {
            this.members = members;
            this.audit = audit;
        }

        /** Ends up to one page of this organization's expired invitations and writes one audit row; returns how many. */
        @Transactional
        public int expireOrg(Long orgId, Instant now) {
            List<OrgMember> batch = members.findExpiredInvites(orgId, now, PageRequest.of(0, PAGE));
            for (OrgMember m : batch) {
                m.setStatus(OrgMemberStatus.REMOVED);
                m.setInviteEndedReason(InviteStatus.REASON_EXPIRED); // the token hash stays: an old link still answers "expired", not "never existed"
                m.setInviteEndedAt(now);
                members.save(m);
            }
            if (!batch.isEmpty()) {
                audit.record(orgId, OrgAuditService.SYSTEM_ACTOR, null, OrgAuditService.MEMBER_INVITE_EXPIRED, OrgAuditService.TARGET_ORG, null, null, "expired=" + batch.size(), null);
            }
            return batch.size();
        }
    }
}
