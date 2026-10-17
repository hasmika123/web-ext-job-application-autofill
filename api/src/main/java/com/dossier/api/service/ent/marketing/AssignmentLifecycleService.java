package com.dossier.api.service.ent.marketing;

import com.dossier.api.domain.ent.OrgAssignment;
import com.dossier.api.domain.ent.consultantws.CwsNotification;
import com.dossier.api.domain.ent.mkt.MktFollowup;
import com.dossier.api.domain.ent.mkt.MktFollowupEvent;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.mkt.MktOpportunityEvent;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignmentEvent;
import com.dossier.api.domain.enumeration.AssignmentHealth;
import com.dossier.api.domain.enumeration.AssignmentKind;
import com.dossier.api.domain.enumeration.NotificationKind;
import com.dossier.api.repository.ent.MarketingBoardRepository;
import com.dossier.api.repository.ent.OrgAssignmentRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupEventRepository;
import com.dossier.api.repository.ent.mkt.MktFollowupRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityEventRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentEventRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.NotificationService;
import com.dossier.api.service.ent.consultantws.ConsultantNotificationGenerator;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The lifecycle of a consultant's marketer assignment (Sprint 2 / B1): the single place that, whenever {@code marketer_assignment} changes, writes the
 * history row, hands the open work over, keeps the {@code org_assignment} projection true and tells the people concerned.
 *
 * <p><b>The authoritative model.</b> {@code marketer_assignment} is THE record of who the marketer and the backup of a consultant profile are (35 readers,
 * the working board, consultants that hold no seat). {@code org_assignment} (the specification table behind the ASSIGNED scope and authorization step 9)
 * is a projection of it for consultants that DO hold a seat: this service is the only writer, so the two can never disagree. A reassignment ends the
 * old PRIMARY row with {@code end_reason = REASSIGNED}, opens the new one and links them with {@code replaced_by_assignment_id}; a PAUSED assignment grants
 * nothing (the same rule {@code MktScope} applies), so its projected rows are ended and reopened on resume. MANAGER and DELEGATE rows are not touched.
 *
 * <p><b>Handover.</b> When the marketer changes, the not-finished work the previous marketer owned FOR THAT CONSULTANT moves with them: opportunities in
 * flight (state ASSIGNED, VIEWED, INTERESTED, NEEDS_INFO), tasks that are not completed and follow-ups that are not completed. Work owned by a third
 * person stays where it is. Each moved record gets a line on its own timeline, the move is audited as one {@code MARKETING_HANDOVER} row with the counts,
 * and the history row keeps the same summary. If the consultant is unassigned, the work goes to the backup when there is one; otherwise it stays (and the
 * summary says nothing moved). An admin switch ({@code org.assignments.handover_open_work}) turns the move off.
 *
 * <p><b>Notifications</b> use the kinds that exist: the consultant gets a message in their own feed (category MESSAGE) and the new marketer an in-app
 * notice of the general kind (no e-mail). They never block the change: a failure is logged.
 *
 * <p>Nothing here submits anything or acts for a consultant (E1); consent is not touched. Joins the caller's transaction, so the change and its
 * consequences commit or roll back together.
 */
@Service
public class AssignmentLifecycleService {

    private static final Logger LOG = LoggerFactory.getLogger(AssignmentLifecycleService.class);

    public static final String AUDIT_HANDOVER = "MARKETING_HANDOVER";
    public static final String EVENT_OWNER_CHANGED = "OWNER_CHANGED";
    public static final String EVENT_REASSIGNED = "REASSIGNED";
    /** The opportunity states that are still open for the marketer: the same set {@code OpportunityAssignmentService.CLOSABLE} closes. */
    static final Set<String> OPEN_OPPORTUNITY_STATES = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");

    /** The part of an assignment that matters to history and to the projection. A null snapshot means "no assignment". */
    public record Snap(Long marketerMemberId, Long backupMemberId, String status, String priority) {}

    /** What moved with a reassignment. */
    public record Handover(int opportunities, int tasks, int followups, Long fromMemberId, Long toMemberId) {
        public static final Handover NONE = new Handover(0, 0, 0, null, null);

        public int total() {
            return opportunities + tasks + followups;
        }

        public String summary() {
            if (total() == 0) return null;
            return opportunities + " opportunities, " + tasks + " tasks, " + followups + " follow-ups moved";
        }
    }

    private final MarketerAssignmentEventRepository history;
    private final OrgAssignmentRepository projection;
    private final ConsultantProfileRepository consultants;
    private final MktOpportunityRepository opportunities;
    private final MktOpportunityEventRepository opportunityEvents;
    private final MktTaskRepository tasks;
    private final MktTaskEventRepository taskEvents;
    private final MktFollowupRepository followups;
    private final MktFollowupEventRepository followupEvents;
    private final MarketingBoardRepository board;
    private final OrgMemberRepository members;
    private final OrgAuditService audit;
    private final PipelineGuardSettings settings;
    private final Clock clock;
    private ConsultantNotificationGenerator consultantFeed;
    private NotificationService memberFeed;

    @Autowired
    public AssignmentLifecycleService(
        MarketerAssignmentEventRepository history,
        OrgAssignmentRepository projection,
        ConsultantProfileRepository consultants,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        MktTaskRepository tasks,
        MktTaskEventRepository taskEvents,
        MktFollowupRepository followups,
        MktFollowupEventRepository followupEvents,
        MarketingBoardRepository board,
        OrgMemberRepository members,
        OrgAuditService audit,
        PipelineGuardSettings settings
    ) {
        this(history, projection, consultants, opportunities, opportunityEvents, tasks, taskEvents, followups, followupEvents, board, members, audit, settings, Clock.systemUTC());
    }

    AssignmentLifecycleService(
        MarketerAssignmentEventRepository history,
        OrgAssignmentRepository projection,
        ConsultantProfileRepository consultants,
        MktOpportunityRepository opportunities,
        MktOpportunityEventRepository opportunityEvents,
        MktTaskRepository tasks,
        MktTaskEventRepository taskEvents,
        MktFollowupRepository followups,
        MktFollowupEventRepository followupEvents,
        MarketingBoardRepository board,
        OrgMemberRepository members,
        OrgAuditService audit,
        PipelineGuardSettings settings,
        Clock clock
    ) {
        this.history = history;
        this.projection = projection;
        this.consultants = consultants;
        this.opportunities = opportunities;
        this.opportunityEvents = opportunityEvents;
        this.tasks = tasks;
        this.taskEvents = taskEvents;
        this.followups = followups;
        this.followupEvents = followupEvents;
        this.board = board;
        this.members = members;
        this.audit = audit;
        this.settings = settings;
        this.clock = clock;
    }

    @Autowired(required = false)
    void setFeeds(ConsultantNotificationGenerator consultantFeed, NotificationService memberFeed) {
        this.consultantFeed = consultantFeed;
        this.memberFeed = memberFeed;
    }

    public static Snap snap(com.dossier.api.domain.ent.talent.MarketerAssignment a) {
        return a == null ? null : new Snap(a.getMarketerMemberId(), a.getBackupMemberId(), a.getStatus(), a.getPriority());
    }

    // ---- the one entry point ---------------------------------------------------------------------------------------------------

    /**
     * Records one change of one consultant's assignment: {@code before} and {@code after} are the row as it was and as it is now (null = none). Does
     * nothing when they do not differ. {@code via} is {@link MarketerAssignmentEvent#RESTORE} for an undo, otherwise null (the action is derived).
     *
     * @return what the handover moved (never null)
     */
    @Transactional
    public Handover record(OrgMembership actor, Long consultantId, Snap before, Snap after, String reason, String via) {
        if (Objects.equals(before, after)) return Handover.NONE;
        Long orgId = actor.orgId();
        Instant now = Instant.now(clock);
        String action = via != null ? via : actionOf(before, after);

        Handover moved = Handover.NONE;
        boolean marketerChanged = before != null && (after == null || !Objects.equals(before.marketerMemberId(), after.marketerMemberId()));
        if (marketerChanged && settings.handoverOpenWork(orgId)) {
            Long to = after != null ? after.marketerMemberId() : before.backupMemberId();
            if (to != null && !to.equals(before.marketerMemberId())) {
                moved = handOver(actor, orgId, consultantId, before.marketerMemberId(), to, reason, now);
            }
        }

        MarketerAssignmentEvent e = new MarketerAssignmentEvent();
        e.setOrgId(orgId);
        e.setConsultantId(consultantId);
        e.setAction(action);
        e.setFromMarketerMemberId(before == null ? null : before.marketerMemberId());
        e.setToMarketerMemberId(after == null ? null : after.marketerMemberId());
        e.setFromBackupMemberId(before == null ? null : before.backupMemberId());
        e.setToBackupMemberId(after == null ? null : after.backupMemberId());
        e.setReason(reason);
        e.setActorMemberId(actor.memberId());
        e.setHandoverSummary(moved.summary());
        e.setOccurredAt(now);
        history.save(e);

        project(actor, orgId, consultantId, after, reason, now);
        notifyPeople(orgId, consultantId, before, after, now);
        return moved;
    }

    static String actionOf(Snap before, Snap after) {
        if (before == null) return MarketerAssignmentEvent.ASSIGN;
        if (after == null) return MarketerAssignmentEvent.UNASSIGN;
        if (!Objects.equals(before.marketerMemberId(), after.marketerMemberId())) return MarketerAssignmentEvent.REASSIGN;
        if (!Objects.equals(before.status(), after.status())) return "PAUSED".equals(after.status()) ? MarketerAssignmentEvent.PAUSE : MarketerAssignmentEvent.RESUME;
        if (!Objects.equals(before.backupMemberId(), after.backupMemberId())) return MarketerAssignmentEvent.BACKUP;
        return MarketerAssignmentEvent.PRIORITY;
    }

    // ---- handover --------------------------------------------------------------------------------------------------------------

    private Handover handOver(OrgMembership actor, Long orgId, Long consultantId, Long from, Long to, String reason, Instant now) {
        Map<Long, String> names = names(orgId, List.of(from, to));
        String toName = names.getOrDefault(to, "the new marketer");
        String fromName = names.getOrDefault(from, "the previous marketer");
        String why = reason == null || reason.isBlank() ? "" : " (" + reason + ")";

        int opps = 0, taskCount = 0, followupCount = 0;
        for (MktOpportunity o : opportunities.lockOpenOwnedByForConsultant(orgId, consultantId, from, OPEN_OPPORTUNITY_STATES)) {
            o.setOwnerMemberId(to);
            o.setUpdatedAt(now);
            opportunities.save(o);
            MktOpportunityEvent ev = new MktOpportunityEvent();
            ev.setOrgId(orgId);
            ev.setOpportunityId(o.getId());
            ev.setKind(EVENT_OWNER_CHANGED);
            ev.setActorMemberId(actor.memberId());
            ev.setText(cut("is now handled by " + toName, 200));
            ev.setOccurredAt(now);
            opportunityEvents.save(ev);
            opps++;
        }
        for (MktTask t : tasks.findOpenOwnedByForConsultant(orgId, consultantId, from)) {
            t.setOwnerMemberId(to);
            t.setUpdatedAt(now);
            tasks.save(t);
            MktTaskEvent ev = new MktTaskEvent();
            ev.setOrgId(orgId);
            ev.setTaskId(t.getId());
            ev.setKind(MktTaskEvent.REASSIGNED);
            ev.setNote(cut("Handed over from " + fromName + " to " + toName + " with the consultant" + why, 500));
            ev.setOccurredAt(now);
            ev.setByMemberId(actor.memberId());
            taskEvents.save(ev);
            taskCount++;
        }
        for (MktFollowup f : followups.findOpenOwnedByForConsultant(orgId, consultantId, from)) {
            f.setOwnerMemberId(to);
            f.setUpdatedAt(now);
            followups.save(f);
            MktFollowupEvent ev = new MktFollowupEvent();
            ev.setOrgId(orgId);
            ev.setFollowupId(f.getId());
            ev.setKind(EVENT_REASSIGNED);
            ev.setNote(cut("Handed over from " + fromName + " to " + toName + " with the consultant" + why, 500));
            ev.setOccurredAt(now);
            ev.setByMemberId(actor.memberId());
            followupEvents.save(ev);
            followupCount++;
        }
        Handover h = new Handover(opps, taskCount, followupCount, from, to);
        if (h.total() > 0) {
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("from", from);
            d.put("to", to);
            d.put("opportunities", opps);
            d.put("tasks", taskCount);
            d.put("followups", followupCount);
            audit.record(actor, AUDIT_HANDOVER, "CONSULTANT", null, String.valueOf(consultantId), d.toString());
        }
        return h;
    }

    // ---- the org_assignment projection -----------------------------------------------------------------------------------------

    /** Makes the open PRIMARY and BACKUP rows of the consultant's seat say what {@code after} says. A consultant without a seat has nothing to project. */
    private void project(OrgMembership actor, Long orgId, Long consultantId, Snap after, String reason, Instant now) {
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElse(null);
        if (c == null || c.getMemberId() == null) return;
        boolean active = after != null && "ACTIVE".equals(after.status());
        Long primary = active ? after.marketerMemberId() : null;
        Long backup = active ? after.backupMemberId() : null;
        String endReason = after == null ? "MANUAL" : active ? "REASSIGNED" : "PAUSED";
        sync(actor, orgId, c.getMemberId(), AssignmentKind.PRIMARY, primary, endReason, reason, now);
        sync(actor, orgId, c.getMemberId(), AssignmentKind.BACKUP, backup, endReason, reason, now);
    }

    private void sync(OrgMembership actor, Long orgId, Long seat, AssignmentKind kind, Long wanted, String endReason, String reason, Instant now) {
        final Long desired = wanted != null && wanted.equals(seat) ? null : wanted; // a consultant is never their own marketer
        List<OrgAssignment> open = projection.findOpenByConsultantAndKind(orgId, seat, kind);
        boolean keep = desired != null && open.stream().anyMatch(a -> desired.equals(a.getAssigneeMemberId()));
        if (keep && open.size() == 1) return;
        OrgAssignment opened = null;
        if (desired != null && !keep) {
            opened = new OrgAssignment();
            opened.setOrgId(orgId);
            opened.setConsultantMemberId(seat);
            opened.setAssigneeMemberId(desired);
            opened.setKind(kind);
            opened.setStartsAt(now);
            opened.setReason(reason);
            opened.setCreatedByMemberId(actor.memberId() != null ? actor.memberId() : desired);
            opened.setHealth(AssignmentHealth.OK);
            opened = projection.saveAndFlush(opened);
        }
        for (OrgAssignment a : open) {
            if (keep && desired.equals(a.getAssigneeMemberId())) continue;
            a.setEndsAt(now);
            a.setEndReason(endReason);
            if (opened != null) a.setReplacedByAssignmentId(opened.getId());
            projection.save(a);
        }
    }

    // ---- notifications ---------------------------------------------------------------------------------------------------------

    private void notifyPeople(Long orgId, Long consultantId, Snap before, Snap after, Instant now) {
        Long newMarketer = after == null ? null : after.marketerMemberId();
        Long oldMarketer = before == null ? null : before.marketerMemberId();
        if (Objects.equals(newMarketer, oldMarketer)) return;
        try {
            Map<Long, String> names = names(orgId, newMarketer == null ? List.of() : List.of(newMarketer));
            if (consultantFeed != null) {
                String title = newMarketer == null ? "You have no marketer right now" : "Your marketer changed";
                String body = newMarketer == null ? "Your organization removed your marketer assignment. They will tell you who takes over." : names.getOrDefault(newMarketer, "Someone on your team") + " is now your marketer.";
                consultantFeed.push(orgId, consultantId, "assignment:" + consultantId + ":" + now.toEpochMilli(), CwsNotification.MESSAGE, title, body, CwsNotification.MEDIUM, "See my marketer", "/w/consultant/marketer", "MARKETER", consultantId);
            }
            if (memberFeed != null && newMarketer != null) {
                var seat = members.findByOrgIdAndId(orgId, newMarketer).orElse(null);
                if (seat != null && seat.getUserId() != null) {
                    String who = consultants.findByOrgIdAndId(orgId, consultantId).map(ConsultantProfile::getDisplayName).orElse("A consultant");
                    memberFeed.publish(
                        NotificationKind.SYSTEM,
                        seat.getUserId(),
                        new NotificationService.Payload("You now look after " + who, who + " was assigned to you. Their open work moved with them.", "/w/marketing/talent", null, null, "assignment:" + orgId + ":" + consultantId + ":" + now.toEpochMilli(), null, false, null)
                    );
                }
            }
        } catch (RuntimeException e) {
            LOG.warn("Could not notify about the marketer change of consultant {} in org {}", consultantId, orgId, e); // the change itself stands
        }
    }

    // ---- reads -----------------------------------------------------------------------------------------------------------------

    /** The history of one consultant, newest first, with names resolved. */
    @Transactional(readOnly = true)
    public List<HistoryLine> history(Long orgId, Long consultantId) {
        List<MarketerAssignmentEvent> rows = history.findByOrgIdAndConsultantIdOrderByOccurredAtDescIdDesc(orgId, consultantId);
        List<Long> ids = new ArrayList<>();
        for (MarketerAssignmentEvent e : rows) {
            for (Long m : new Long[] { e.getFromMarketerMemberId(), e.getToMarketerMemberId(), e.getFromBackupMemberId(), e.getToBackupMemberId(), e.getActorMemberId() }) if (m != null) ids.add(m);
        }
        Map<Long, String> names = names(orgId, ids);
        List<HistoryLine> out = new ArrayList<>();
        for (MarketerAssignmentEvent e : rows) {
            out.add(new HistoryLine(
                e.getId(), e.getAction(), person(e.getFromMarketerMemberId(), names), person(e.getToMarketerMemberId(), names), person(e.getFromBackupMemberId(), names), person(e.getToBackupMemberId(), names),
                e.getReason(), person(e.getActorMemberId(), names), e.getHandoverSummary(), e.getOccurredAt()
            ));
        }
        return out;
    }

    /** A person on a history line; null when the line has none. */
    public record Person(Long memberId, String name) {}

    public record HistoryLine(
        Long id, String action, Person fromMarketer, Person toMarketer, Person fromBackup, Person toBackup, String reason, Person actor, String handover, Instant at
    ) {}

    private static Person person(Long id, Map<Long, String> names) {
        return id == null ? null : new Person(id, names.getOrDefault(id, "Member"));
    }

    private Map<Long, String> names(Long orgId, Collection<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (Object[] r : board.seatNames(orgId, ids)) {
            String n = ((r[1] == null ? "" : r[1]) + " " + (r[2] == null ? "" : r[2])).strip();
            if (n.isEmpty() && r[3] != null) n = r[3].toString();
            if (n.isEmpty() && r[4] != null) n = r[4].toString();
            out.put((Long) r[0], n.isEmpty() ? "Member" : n);
        }
        return out;
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
