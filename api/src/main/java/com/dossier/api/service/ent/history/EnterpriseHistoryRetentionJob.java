package com.dossier.api.service.ent.history;

import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
import com.dossier.api.repository.ent.mkt.MktSubmissionEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.org.OrgAuditService;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Change-audit retention for the organization side (docs/change-audit/README.md section 4.4, X9.15). Every night, for each organization whose
 * {@code enterprise.history.retention_months} (its own {@code org_setting} row first, then the registry value) is above 0, the rows of
 * {@code talent_application_event}, {@code talent_interview_event} and {@code mkt_submission_event} older than that many months are deleted, EXCEPT the
 * newest row of every record, so a record never loses its last known "who and when". At 0 (the default, "for the life of the record") nothing is touched.
 *
 * <p>This job and account erasure are the only deleters of these tables. It writes ONE {@code HISTORY_PURGED} SYSTEM audit row per organization per run
 * (counts only, never content). Work is done one organization at a time inside {@link TenantScoped#run}; an organization's failure never stops the others;
 * each batch commits on its own so a long backlog is worked off over a few nights without holding a long transaction. Re-running is a no-op.
 * Plain {@code @Scheduled} like the other nightly jobs: there is no distributed-lock library in this codebase, and a second concurrent run only deletes
 * rows that are already gone.
 */
@Component
public class EnterpriseHistoryRetentionJob {

    private static final Logger LOG = LoggerFactory.getLogger(EnterpriseHistoryRetentionJob.class);
    static final int BATCH = 500;
    static final int MAX_BATCHES_PER_TABLE = 40;

    /** The three tables, in the order they are purged. */
    public enum Table {
        APPLICATIONS,
        INTERVIEWS,
        SUBMISSIONS
    }

    /** What one run did for one organization. */
    public record OrgResult(Long orgId, int months, int applications, int interviews, int submissions) {
        public int total() {
            return applications + interviews + submissions;
        }
    }

    private final OrganizationRepository organizations;
    private final EnterpriseHistorySettings settings;
    private final EnterpriseHistoryRetentionWork work;

    public EnterpriseHistoryRetentionJob(OrganizationRepository organizations, EnterpriseHistorySettings settings, EnterpriseHistoryRetentionWork work) {
        this.organizations = organizations;
        this.settings = settings;
        this.work = work;
    }

    @Scheduled(cron = "${dossier.enterprise.history-retention-cron:0 20 3 * * *}", zone = "UTC")
    public void scheduled() {
        try {
            Instant now = Instant.now();
            List<OrgResult> done = runOnce(now);
            int total = done.stream().mapToInt(OrgResult::total).sum();
            List<MgmtResult> mgmt = runMktMgmt(now);
            int mgmtTotal = mgmt.stream().mapToInt(MgmtResult::total).sum();
            if (mgmtTotal > 0) LOG.info("Purged {} Marketing Manager record(s) past their retention window in {} organization(s)", mgmtTotal, mgmt.size());
            if (total > 0) LOG.info("Purged {} organization history row(s) past their retention window in {} organization(s)", total, done.size());
        } catch (RuntimeException e) {
            LOG.warn("Organization history retention run failed", e); // the next night retries; nothing here is time critical
        }
    }

    /** What one run did for one organization's Marketing Manager records (MM-01): decided approval requests and closed escalations past their window. */
    public record MgmtResult(Long orgId, int months, int approvals, int escalations) {
        public int total() {
            return approvals + escalations;
        }
    }

    /**
     * One pass over the Marketing Manager records (docs/enterprise-v2/deferred/marketing-manager.md section 3): for every organization whose
     * {@code enterprise.history.mkt_mgmt_months} (its own {@code org_setting} row first, then the registry value, default 36) is above 0, approval requests that are no
     * longer PENDING and escalations that are RESOLVED or DISMISSED, untouched for longer than that, are deleted (an escalation's trail goes with it). An open
     * record is never touched. Returns the organizations that lost rows; each gets one SYSTEM audit row with counts only.
     */
    public List<MgmtResult> runMktMgmt(Instant now) {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds()));
        List<MgmtResult> out = new ArrayList<>();
        for (Long orgId : orgIds) {
            try {
                int months = settings.mktMgmtMonths(orgId);
                if (months <= 0) continue;
                Instant cutoff = now.atZone(ZoneOffset.UTC).minusMonths(months).toInstant();
                MgmtResult r = TenantScoped.get(orgId, () -> purgeMgmt(orgId, months, cutoff));
                if (r.total() > 0) out.add(r);
            } catch (RuntimeException e) {
                LOG.warn("Marketing Manager records retention failed for org {}", orgId, e);
            }
        }
        return out;
    }

    private MgmtResult purgeMgmt(Long orgId, int months, Instant cutoff) {
        int approvals = 0;
        int escalations = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
            int n = work.purgeApprovalBatch(orgId, cutoff);
            approvals += n;
            if (n < BATCH) break;
        }
        for (int i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
            int n = work.purgeEscalationBatch(orgId, cutoff);
            escalations += n;
            if (n < BATCH) break;
        }
        MgmtResult r = new MgmtResult(orgId, months, approvals, escalations);
        if (r.total() > 0) work.recordMgmtPurge(r);
        return r;
    }

    /** One pass over every organization with a retention window; returns the organizations that lost rows. */
    public List<OrgResult> runOnce(Instant now) {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds())); // the one cross-tenant read: which organizations to visit
        List<OrgResult> out = new ArrayList<>();
        for (Long orgId : orgIds) {
            try {
                int months = settings.retentionMonths(orgId);
                if (months <= 0) continue; // 0 = for the life of the record
                Instant cutoff = now.atZone(ZoneOffset.UTC).minusMonths(months).toInstant();
                OrgResult r = TenantScoped.get(orgId, () -> purgeOrg(orgId, months, cutoff));
                if (r.total() > 0) out.add(r);
            } catch (RuntimeException e) {
                LOG.warn("History retention failed for org {}", orgId, e); // one organization's failure never stops the others
            }
        }
        return out;
    }

    private OrgResult purgeOrg(Long orgId, int months, Instant cutoff) {
        int apps = drain(orgId, cutoff, Table.APPLICATIONS);
        int interviews = drain(orgId, cutoff, Table.INTERVIEWS);
        int submissions = drain(orgId, cutoff, Table.SUBMISSIONS);
        OrgResult r = new OrgResult(orgId, months, apps, interviews, submissions);
        if (r.total() > 0) work.recordPurge(r);
        return r;
    }

    private int drain(Long orgId, Instant cutoff, Table table) {
        int total = 0;
        for (int i = 0; i < MAX_BATCHES_PER_TABLE; i++) {
            int n = work.purgeBatch(orgId, cutoff, table);
            total += n;
            if (n < BATCH) break;
        }
        return total;
    }


    /** The transactional steps, split out so the proxy applies to them. */
    @Component
    public static class EnterpriseHistoryRetentionWork {

        private final TalentApplicationEventRepository applications;
        private final TalentInterviewEventRepository interviews;
        private final MktSubmissionEventRepository submissions;
        private final MktApprovalRequestRepository approvalRequests;
        private final MktEscalationRepository escalationRows;
        private final OrgAuditService audit;

        public EnterpriseHistoryRetentionWork(
            TalentApplicationEventRepository applications,
            TalentInterviewEventRepository interviews,
            MktSubmissionEventRepository submissions,
            MktApprovalRequestRepository approvalRequests,
            MktEscalationRepository escalationRows,
            OrgAuditService audit
        ) {
            this.applications = applications;
            this.interviews = interviews;
            this.submissions = submissions;
            this.approvalRequests = approvalRequests;
            this.escalationRows = escalationRows;
            this.audit = audit;
        }

        /** Deletes up to one page of this organization's decided or closed approval requests untouched since {@code cutoff}; returns how many went. */
        @Transactional
        public int purgeApprovalBatch(Long orgId, Instant cutoff) {
            List<Long> ids = approvalRequests.purgeableIds(orgId, cutoff, PageRequest.of(0, BATCH));
            return ids.isEmpty() ? 0 : approvalRequests.deleteByOrgIdAndIdIn(orgId, ids);
        }

        /** Deletes up to one page of this organization's resolved or dismissed escalations untouched since {@code cutoff} (their trail goes with them); returns how many went. */
        @Transactional
        public int purgeEscalationBatch(Long orgId, Instant cutoff) {
            List<Long> ids = escalationRows.purgeableIds(orgId, cutoff, PageRequest.of(0, BATCH));
            return ids.isEmpty() ? 0 : escalationRows.deleteByOrgIdAndIdIn(orgId, ids);
        }

        /** The one SYSTEM audit row of this run for this organization's Marketing Manager records: counts and the window, never content. */
        @Transactional
        public void recordMgmtPurge(MgmtResult r) {
            audit.record(
                r.orgId(),
                OrgAuditService.SYSTEM_ACTOR,
                null,
                OrgAuditService.HISTORY_PURGED,
                OrgAuditService.TARGET_ORG,
                null,
                String.valueOf(r.orgId()),
                "months=" + r.months() + " mktApprovals=" + r.approvals() + " mktEscalations=" + r.escalations(),
                null
            );
        }

        /** Deletes up to one page of this organization's purgeable rows of {@code table} (never the newest of a record); returns how many went. */
        @Transactional
        public int purgeBatch(Long orgId, Instant cutoff, Table table) {
            PageRequest page = PageRequest.of(0, BATCH);
            List<Long> ids = switch (table) {
                case APPLICATIONS -> applications.purgeableIds(orgId, cutoff, page);
                case INTERVIEWS -> interviews.purgeableIds(orgId, cutoff, page);
                case SUBMISSIONS -> submissions.purgeableIds(orgId, cutoff, page);
            };
            if (ids.isEmpty()) return 0;
            return switch (table) {
                case APPLICATIONS -> applications.deleteByOrgIdAndIdIn(orgId, ids);
                case INTERVIEWS -> interviews.deleteByOrgIdAndIdIn(orgId, ids);
                case SUBMISSIONS -> submissions.deleteByOrgIdAndIdIn(orgId, ids);
            };
        }

        /** The one SYSTEM audit row of this run for this organization: counts and the window, never content. */
        @Transactional
        public void recordPurge(OrgResult r) {
            audit.record(
                r.orgId(),
                OrgAuditService.SYSTEM_ACTOR,
                null,
                OrgAuditService.HISTORY_PURGED,
                OrgAuditService.TARGET_ORG,
                null,
                String.valueOf(r.orgId()),
                "months=" + r.months() + " applications=" + r.applications() + " interviews=" + r.interviews() + " submissions=" + r.submissions(),
                null
            );
        }
    }
}
