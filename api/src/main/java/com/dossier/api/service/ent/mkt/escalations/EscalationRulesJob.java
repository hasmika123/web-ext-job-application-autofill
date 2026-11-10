package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.TenantModule;
import com.dossier.api.service.ent.TenantModules;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.privacy.JobLeaseService;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * The escalation rules, every 15 minutes (docs/enterprise-v2/deferred/marketing-manager.md section 4.2): for each organization whose marketing module is on, wake the
 * snoozes that ran out, run the five rules one by one (each its own transaction, so one failing rule never undoes the others) and tell the managers about the new
 * HIGH rows. Works one organization at a time inside {@link TenantScoped#get}; one organization's failure never stops the others. A lease
 * ({@code mkt-escalations}, {@link JobLeaseService}) keeps a second API instance from running the same pass.
 */
@Component
public class EscalationRulesJob {

    private static final Logger LOG = LoggerFactory.getLogger(EscalationRulesJob.class);
    static final String LEASE = "mkt-escalations";

    /** What a run did, for the log and the lease summary. */
    public record Result(int organizations, int raised, int resolved, int bumped, int woken, int notices) {
        String summary() {
            return "orgs=" + organizations + " raised=" + raised + " resolved=" + resolved + " bumped=" + bumped + " woken=" + woken + " notices=" + notices;
        }
    }

    private final OrganizationRepository organizations;
    private final TenantModules modules;
    private final EscalationRules rules;
    private final EscalationNotices notices;
    private final JobLeaseService leases;

    public EscalationRulesJob(OrganizationRepository organizations, TenantModules modules, EscalationRules rules, EscalationNotices notices, JobLeaseService leases) {
        this.organizations = organizations;
        this.modules = modules;
        this.rules = rules;
        this.notices = notices;
        this.leases = leases;
    }

    @Scheduled(fixedDelayString = "${dossier.ent.mkt.escalation-delay-ms:900000}", initialDelayString = "${dossier.ent.mkt.escalation-initial-delay-ms:180000}")
    public void scheduled() {
        try {
            Instant now = Instant.now();
            leases.withLease(LEASE, Duration.ofMinutes(10), now, () -> runOnce(now), Result::summary);
        } catch (RuntimeException e) {
            LOG.warn("Escalation rules run failed", e); // the next run retries; nothing here is time critical
        }
    }

    /** One pass over every organization with the marketing module on. */
    public Result runOnce(Instant now) {
        List<Long> orgIds = new ArrayList<>();
        TenantScoped.unscoped(() -> orgIds.addAll(organizations.findAllOrgIds())); // the one cross-tenant read: which organizations to visit
        int orgs = 0, raised = 0, resolved = 0, bumped = 0, woken = 0, told = 0;
        for (Long orgId : orgIds) {
            try {
                if (!modules.isOn(TenantModule.MARKETING, orgId)) continue;
                Result r = TenantScoped.get(orgId, () -> runOrganization(orgId, now));
                orgs++;
                raised += r.raised();
                resolved += r.resolved();
                bumped += r.bumped();
                woken += r.woken();
                told += r.notices();
            } catch (RuntimeException e) {
                LOG.warn("Escalation rules failed for org {}", orgId, e);
            }
        }
        if (raised + resolved + woken > 0) LOG.info("Escalations: raised {}, cleared {}, raised in severity {}, woken {} in {} organization(s)", raised, resolved, bumped, woken, orgs);
        return new Result(orgs, raised, resolved, bumped, woken, told);
    }

    private Result runOrganization(Long orgId, Instant now) {
        List<EscalationRules.Raised> newRows = new ArrayList<>();
        int resolved = 0, bumped = 0, woken = 0;
        woken += guarded(orgId, "wakeSnoozes", () -> rules.wakeSnoozes(orgId, now), 0);
        for (Supplier<EscalationRules.Outcome> rule : List.<Supplier<EscalationRules.Outcome>>of(
            () -> rules.stalledOpportunities(orgId, now),
            () -> rules.overdueFollowups(orgId, now),
            () -> rules.unansweredQuestions(orgId, now),
            () -> rules.overloadedMarketers(orgId, now),
            () -> rules.agingApprovals(orgId, now)
        )) {
            EscalationRules.Outcome o = guarded(orgId, "rule", rule, null);
            if (o == null) continue;
            newRows.addAll(o.raised());
            resolved += o.resolved();
            bumped += o.bumped();
        }
        int told = notices.notifyNewHigh(orgId, newRows);
        return new Result(1, newRows.size(), resolved, bumped, woken, told);
    }

    private <T> T guarded(Long orgId, String what, Supplier<T> work, T onFailure) {
        try {
            return work.get();
        } catch (RuntimeException e) {
            LOG.warn("Escalation step {} failed for org {}", what, orgId, e); // the other rules still run
            return onFailure;
        }
    }
}
