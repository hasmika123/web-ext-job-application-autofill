package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.domain.ent.mgmt.MktApprovalRequest;
import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.repository.ent.mgmt.MgmtRulesRepository;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.marketing.MarketingSettings;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
import com.dossier.api.service.privacy.SensitiveContentException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The rules that raise escalations (docs/enterprise-v2/deferred/marketing-manager.md section 4.2). Each rule works out, from the organization's own rows, WHICH
 * things need a manager now, then reconciles that list with the escalations it raised earlier: a thing already open stays one row (its severity only ever goes up),
 * a new thing becomes a row, and a row whose condition went away is resolved by the system with "Cleared: ...". Thresholds are admin settings
 * ({@link EscalationSettings}); the only numbers here are the ones the design fixes (twice the stalled days is HIGH, a follow-up 7 days overdue is MEDIUM, a marketer must
 * be over the line for 3 runs in a row).
 *
 * <p>Each rule is its own transaction (the job calls them one by one), so one failing rule never undoes the others. Metadata only: a title is names and a job
 * title, a detail is a figure. The rules read; the only things they write are escalation rows and their trail. Nothing here submits an application (E1).
 */
@Component
public class EscalationRules {

    public static final String RULE_STALLED = "STALLED_OPPORTUNITY";
    public static final String RULE_FOLLOWUP = "OVERDUE_FOLLOWUP";
    public static final String RULE_QUESTION = "UNANSWERED_QUESTION";
    public static final String RULE_OVERLOAD = "OVERLOADED_MARKETER";
    public static final String RULE_APPROVAL = "APPROVAL_AGING";

    /** The opportunity states that are still open for the marketer. */
    static final Set<String> OPEN_STATES = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");
    /** Runs in a row a marketer must be over the line before it is raised (the design's "3 consecutive runs"). */
    static final int OVERLOAD_RUNS = 3;
    /** A follow-up this many days overdue is MEDIUM instead of LOW (design table). */
    static final int FOLLOWUP_MEDIUM_DAYS = 7;

    /** What a rule found that should be open now. */
    record Wanted(String kind, String severity, String subjectType, Long subjectId, Long consultantId, Long marketerMemberId, String title, String detail) {
        String key() {
            return subjectType + ":" + subjectId;
        }
    }

    /** A row a rule raised (what the notices need). */
    public record Raised(Long id, String severity, Long marketerMemberId, Long consultantId, String title) {}

    /** What one rule did. */
    public record Outcome(String rule, List<Raised> raised, int resolved, int bumped) {
        static Outcome none(String rule) {
            return new Outcome(rule, List.of(), 0, 0);
        }
    }

    private final MktEscalationRepository escalations;
    private final EscalationService service;
    private final EscalationSettings settings;
    private final MgmtRulesRepository facts;
    private final MktFollowupService followups;
    private final MktApprovalRequestRepository approvals;
    private final MarketerCapacityRepository capacities;
    private final MarketerAssignmentRepository assignments;
    private final MarketingSettings marketing;
    private final ApplicationNames names;
    private final Clock clock;
    /** Runs in a row each marketer has been over the line, by "orgId:memberId". Held in memory: a restart only delays a raise by up to three runs. */
    private final Map<String, Integer> overloadRuns = new ConcurrentHashMap<>();

    @Autowired
    public EscalationRules(
        MktEscalationRepository escalations,
        EscalationService service,
        EscalationSettings settings,
        MgmtRulesRepository facts,
        MktFollowupService followups,
        MktApprovalRequestRepository approvals,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MarketingSettings marketing,
        ApplicationNames names
    ) {
        this(escalations, service, settings, facts, followups, approvals, capacities, assignments, marketing, names, Clock.systemUTC());
    }

    EscalationRules(
        MktEscalationRepository escalations,
        EscalationService service,
        EscalationSettings settings,
        MgmtRulesRepository facts,
        MktFollowupService followups,
        MktApprovalRequestRepository approvals,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MarketingSettings marketing,
        ApplicationNames names,
        Clock clock
    ) {
        this.escalations = escalations;
        this.service = service;
        this.settings = settings;
        this.facts = facts;
        this.followups = followups;
        this.approvals = approvals;
        this.capacities = capacities;
        this.assignments = assignments;
        this.marketing = marketing;
        this.names = names;
        this.clock = clock;
    }

    // ---- the rules ---------------------------------------------------------------------------------------------------------------

    /** An assigned opportunity with no timeline line for {@code org.pipeline.stalled_days}: MEDIUM, HIGH after twice as long. */
    @Transactional
    public Outcome stalledOpportunities(Long orgId, Instant now) {
        int days = settings.stalledDays(orgId);
        List<Wanted> wanted = new ArrayList<>();
        for (Object[] r : facts.openOpportunityActivity(orgId, OPEN_STATES)) {
            Instant last = r[3] != null ? (Instant) r[3] : (Instant) r[4];
            long idle = Duration.between(last, now).toDays();
            if (idle < days) continue;
            String severity = idle >= 2L * days ? "HIGH" : "MEDIUM";
            wanted.add(new Wanted(
                MktEscalation.KIND_STALLED_OPPORTUNITY, severity, "MKT_OPPORTUNITY", (Long) r[0], (Long) r[1], (Long) r[2],
                cut(r[6] + ": " + r[5] + " has had no activity for " + idle + " days"), "Last activity " + idle + " days ago; the limit is " + days + " days."
            ));
        }
        return reconcile(orgId, RULE_STALLED, wanted, "the opportunity has activity again or is closed", now);
    }

    /** A follow-up overdue for {@code org.pipeline.followup_overdue_days}: LOW, MEDIUM once it is 7 days overdue. */
    @Transactional
    public Outcome overdueFollowups(Long orgId, Instant now) {
        int days = settings.followupOverdueDays(orgId);
        List<Wanted> wanted = new ArrayList<>();
        for (MktFollowup f : followups.overdue(orgId, days)) {
            long overdue = Math.max(0, Duration.between(f.getDueAt(), now).toDays());
            wanted.add(new Wanted(
                MktEscalation.KIND_OVERDUE_FOLLOWUP, overdue >= FOLLOWUP_MEDIUM_DAYS ? "MEDIUM" : "LOW", "MKT_FOLLOWUP", f.getId(), f.getConsultantId(), f.getOwnerMemberId(),
                cut("Overdue follow-up: " + f.getTitle()), "Overdue by " + overdue + " days; the limit is " + days + " days."
            ));
        }
        return reconcile(orgId, RULE_FOLLOWUP, wanted, "the follow-up is done or no longer overdue", now);
    }

    /** A consultant's question that has waited {@code org.pipeline.question_sla_hours} for the marketer's answer: HIGH. */
    @Transactional
    public Outcome unansweredQuestions(Long orgId, Instant now) {
        int hours = settings.questionSlaHours(orgId);
        List<Wanted> wanted = new ArrayList<>();
        for (Object[] r : facts.unansweredQuestions(orgId)) {
            Instant asked = r[3] != null ? (Instant) r[3] : (Instant) r[4];
            long waited = Duration.between(asked, now).toHours();
            if (waited < hours) continue;
            wanted.add(new Wanted(
                MktEscalation.KIND_UNANSWERED_QUESTION, "HIGH", "CWS_QUESTION", (Long) r[0], (Long) r[1], (Long) r[2],
                cut(r[6] + " asked about " + r[5] + " and is still waiting"), "Waiting " + waited + " hours; the limit is " + hours + " hours."
            ));
        }
        return reconcile(orgId, RULE_QUESTION, wanted, "the question was answered", now);
    }

    /** A marketer at or above {@code org.marketing.overload_pct} of their capacity for 3 runs in a row: MEDIUM. */
    @Transactional
    public Outcome overloadedMarketers(Long orgId, Instant now) {
        int pct = marketing.overloadPct(orgId);
        Map<Long, Integer> assigned = new HashMap<>();
        assignments.findByOrgId(orgId).forEach(a -> assigned.merge(a.getMarketerMemberId(), 1, Integer::sum));
        Map<Long, Integer> over = new LinkedHashMap<>();
        for (MarketerCapacity c : capacities.findByOrgIdAndStatus(orgId, "ACTIVE")) {
            int n = assigned.getOrDefault(c.getMemberId(), 0);
            String key = orgId + ":" + c.getMemberId();
            boolean isOver = c.getCapacity() != null && c.getCapacity() > 0 && n * 100L >= (long) pct * c.getCapacity();
            if (!isOver) {
                overloadRuns.remove(key);
                continue;
            }
            int runs = overloadRuns.merge(key, 1, Integer::sum);
            if (runs >= OVERLOAD_RUNS) over.put(c.getMemberId(), Math.round(n * 100f / c.getCapacity()));
        }
        Map<Long, String> who = names.memberNames(orgId, over.keySet());
        List<Wanted> wanted = new ArrayList<>();
        for (Map.Entry<Long, Integer> e : over.entrySet()) {
            wanted.add(new Wanted(
                MktEscalation.KIND_OVERLOADED_MARKETER, "MEDIUM", "MARKETER", e.getKey(), null, e.getKey(),
                cut(who.getOrDefault(e.getKey(), "A marketer") + " is at " + e.getValue() + "% of capacity"), "At or above " + pct + "% of capacity for " + OVERLOAD_RUNS + " runs in a row."
            ));
        }
        return reconcile(orgId, RULE_OVERLOAD, wanted, "the load is back under " + pct + "% of capacity", now);
    }

    /** An approval request that has waited {@code org.pipeline.approval_sla_hours} for a decision: MEDIUM. */
    @Transactional
    public Outcome agingApprovals(Long orgId, Instant now) {
        int hours = settings.approvalSlaHours(orgId);
        List<Wanted> wanted = new ArrayList<>();
        for (MktApprovalRequest r : approvals.findPendingOlderThan(orgId, now.minus(Duration.ofHours(hours)))) {
            wanted.add(new Wanted(
                MktEscalation.KIND_APPROVAL_AGING, "MEDIUM", "MKT_APPROVAL_REQUEST", r.getId(), r.getConsultantId(), r.getRequestedByMemberId(),
                cut("Approval waiting: " + r.getTitle()), "Waiting " + Duration.between(r.getRequestedAt(), now).toHours() + " hours; the limit is " + hours + " hours."
            ));
        }
        return reconcile(orgId, RULE_APPROVAL, wanted, "the request was decided", now);
    }

    /** Snoozes that have run out come back as OPEN. Returns how many woke. */
    @Transactional
    public int wakeSnoozes(Long orgId, Instant now) {
        int n = 0;
        for (MktEscalation e : escalations.findWokenSnoozes(orgId, now)) {
            service.wake(e, now);
            n++;
        }
        return n;
    }

    // ---- the reconciliation ------------------------------------------------------------------------------------------------------

    private Outcome reconcile(Long orgId, String ruleKey, Collection<Wanted> wanted, String clearedBecause, Instant now) {
        Map<String, Wanted> byKey = new LinkedHashMap<>();
        for (Wanted w : wanted) byKey.put(w.key(), w);
        int resolved = 0;
        int bumped = 0;
        for (MktEscalation live : escalations.findLiveByRule(orgId, ruleKey)) {
            Wanted w = byKey.remove(live.getSubjectType() + ":" + live.getSubjectId());
            if (w == null) {
                service.systemResolve(live, clearedBecause, now);
                resolved++;
            } else if (EscalationService.rank(w.severity()) > EscalationService.rank(live.getSeverity())) {
                service.bump(live, w.severity(), "Severity raised to " + w.severity() + ": " + w.detail(), now);
                bumped++;
            }
        }
        List<Raised> raised = new ArrayList<>();
        for (Wanted w : byKey.values()) {
            try {
                EscalationDTO dto = service.raise(
                    orgId, new EscalationService.Raise(w.kind(), w.severity(), w.subjectType(), w.subjectId(), w.consultantId(), w.marketerMemberId(), w.title(), w.detail(), ruleKey, null)
                );
                raised.add(new Raised(dto.id(), dto.severity(), w.marketerMemberId(), w.consultantId(), dto.title()));
            } catch (SensitiveContentException looksSensitive) {
                // the title is made of stored names and a job title; if the scanner still objects, that one thing is not escalated (thrown before any write)
            }
        }
        return new Outcome(ruleKey, raised, resolved, bumped);
    }

    private static String cut(String title) {
        return title.length() > EscalationService.TITLE_MAX ? title.substring(0, EscalationService.TITLE_MAX) : title;
    }
}
