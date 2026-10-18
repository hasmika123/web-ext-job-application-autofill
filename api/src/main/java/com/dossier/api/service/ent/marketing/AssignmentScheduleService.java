package com.dossier.api.service.ent.marketing;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerAssignmentEvent;
import com.dossier.api.domain.ent.talent.MarketerAssignmentSchedule;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.OrgMemberStatus;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.MarketingBoardRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentScheduleRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.HandoverPreview;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.Person;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.Schedule;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.ScheduleList;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.TenantScoped;
import com.dossier.api.service.ent.members.MemberAccess;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Planned changes of a consultant's marketer (Sprint 2 / H-assign): a handover that takes effect on a future date, and temporary cover (a DELEGATE) that ends
 * by itself. Both are rows of {@code marketer_assignment_schedule}; {@code marketer_assignment} stays THE record of who carries the consultant, so every reader
 * of it (35 of them, the ASSIGNED scope, the board) sees cover exactly like any other marketer, and {@link AssignmentLifecycleService} is still the only place
 * that writes the history line, hands the open work over, keeps the {@code org_assignment} projection true and tells the people concerned.
 *
 * <p><b>Cover.</b> At its start the cover marketer becomes the marketer of the consultant, the marketer they were taken from is remembered on the plan
 * ({@code return_marketer_member_id}) and the open work moves to the cover (history action DELEGATE). At its end, from the scheduled job, the consultant goes back
 * and the open work with them (history action DELEGATE_END). If somebody has changed the consultant's marketer in between, the plan simply ends (outcome
 * SUPERSEDED) and nothing is moved; if the marketer to return to has left or no longer exists, the cover stays and the outcome says RETURN_UNAVAILABLE.
 *
 * <p><b>Rules.</b> Same gates as the board: roles from data, {@code assignments.manage} at a scope that covers the marketers involved, the generic 404 for
 * everything else. The cover or new marketer must be an ACTIVE marketer; cover needs an end date, a reason and at most {@code org.assignments.delegate_max_days};
 * a handover may be scheduled at most {@code org.assignments.schedule_max_days} ahead; one open plan of each kind per consultant. The board capacity is a warning
 * (409 OVER_CAPACITY, {@code allowOverCapacity}), the licence cap {@code consultants.max} is not (409 CONSULTANTS_LIMIT). Nothing here submits anything.
 */
@Service
public class AssignmentScheduleService {

    private static final Logger LOG = LoggerFactory.getLogger(AssignmentScheduleService.class);

    public static final String AUDIT_SCHEDULE = "MARKETING_SCHEDULE";
    public static final String AUDIT_SCHEDULE_CANCEL = "MARKETING_SCHEDULE_CANCEL";
    public static final String AUDIT_DELEGATE_START = "MARKETING_DELEGATE_START";
    public static final String AUDIT_DELEGATE_END = "MARKETING_DELEGATE_END";
    public static final String AUDIT_SCHEDULED_REASSIGN = "MARKETING_REASSIGN";
    public static final String AUDIT_SCHEDULE_FAILED = "MARKETING_SCHEDULE_FAILED";

    public static final String CODE_CONSULTANTS_LIMIT = "CONSULTANTS_LIMIT";
    public static final String CODE_SCHEDULE_EXISTS = "SCHEDULE_EXISTS";
    public static final String CODE_NOT_PENDING = "NOT_PENDING";

    public static final String OUT_APPLIED = "APPLIED";
    public static final String OUT_RETURNED = "RETURNED";
    public static final String OUT_ENDED_EARLY = "ENDED_EARLY";
    public static final String OUT_SUPERSEDED = "SUPERSEDED";
    public static final String OUT_RETURN_UNAVAILABLE = "RETURN_UNAVAILABLE";
    public static final String OUT_CANCELLED = "CANCELLED";
    public static final String OUT_MEMBER_LEFT = "MEMBER_LEFT";
    public static final String OUT_EXPIRED = "EXPIRED_BEFORE_START";
    public static final String OUT_UNASSIGNED = "CONSULTANT_UNASSIGNED";

    /** A change asked for "now" may be up to this far ahead and still counts as now (clock skew between the browser and the server). */
    static final Duration NOW_GRACE = Duration.ofMinutes(1);
    static final Set<String> PENDING = Set.of(MarketerAssignmentSchedule.SCHEDULED, MarketerAssignmentSchedule.ACTIVE);

    /** What one run of the job did. */
    public record RunResult(int started, int ended, int failed) {
        public int total() {
            return started + ended + failed;
        }
    }

    private final MarketerAssignmentScheduleRepository schedules;
    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final ConsultantProfileRepository consultants;
    private final OrgMemberRepository members;
    private final MarketingBoardRepository board;
    private final AssignmentLifecycleService lifecycle;
    private final MarketingSettings settings;
    private final MemberAccess access;
    private final OrgRoleService roles;
    private final OrgAuditService audit;
    private final ObjectMapper json;
    private final Clock clock;
    private final TransactionTemplate rowTx;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public AssignmentScheduleService(
        MarketerAssignmentScheduleRepository schedules,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        MarketingBoardRepository board,
        AssignmentLifecycleService lifecycle,
        MarketingSettings settings,
        MemberAccess access,
        OrgRoleService roles,
        OrgAuditService audit,
        ObjectMapper json,
        PlatformTransactionManager txManager
    ) {
        this(schedules, assignments, capacities, consultants, members, board, lifecycle, settings, access, roles, audit, json, Clock.systemUTC(), txManager);
    }

    AssignmentScheduleService(
        MarketerAssignmentScheduleRepository schedules,
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        OrgMemberRepository members,
        MarketingBoardRepository board,
        AssignmentLifecycleService lifecycle,
        MarketingSettings settings,
        MemberAccess access,
        OrgRoleService roles,
        OrgAuditService audit,
        ObjectMapper json,
        Clock clock,
        PlatformTransactionManager txManager
    ) {
        this.schedules = schedules;
        this.assignments = assignments;
        this.capacities = capacities;
        this.consultants = consultants;
        this.members = members;
        this.board = board;
        this.lifecycle = lifecycle;
        this.settings = settings;
        this.access = access;
        this.roles = roles;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
        this.rowTx = new TransactionTemplate(txManager); // REQUIRED: one transaction per plan when the job runs alone, the caller's when a test or a request already has one
    }

    /** The actor of a change nobody signed in for (the job, an offboarding): audited under {@code login}, no seat on the history line. */
    public static OrgMembership system(Long orgId, String login) {
        return new OrgMembership(orgId, null, null, login == null ? OrgAuditService.SYSTEM_ACTOR : login, null, OrgMemberStatus.ACTIVE, OrgStatus.ACTIVE, List.of(), Map.of());
    }

    // ---- gates -----------------------------------------------------------------------------------------------------------------

    private PermissionScope viewScope(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        return access.widest(me, List.of(MarketingAssignmentsService.KEY_VIEW, MarketingAssignmentsService.KEY_MANAGE)).orElseThrow(OrgNotFoundException::new);
    }

    private void gateWrite(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        access.requireWritable(me, MarketingAssignmentsService.KEY_MANAGE);
        access.requireScope(me, MarketingAssignmentsService.KEY_MANAGE);
    }

    /** Whether the caller may touch a consultant whose marketer is {@code current} (null = nobody: then only an organization-wide caller). */
    private boolean mayTouch(OrgMembership me, Long current) {
        if (current != null) return access.canAct(me, MarketingAssignmentsService.KEY_MANAGE, current);
        return access.visibleIds(me, access.requireScope(me, MarketingAssignmentsService.KEY_MANAGE)) == null;
    }

    // ---- create ----------------------------------------------------------------------------------------------------------------

    /**
     * Plans a handover that takes effect at {@code at} (more than a minute ahead; at most {@code org.assignments.schedule_max_days}).
     */
    @Transactional
    public Schedule scheduleReassign(OrgMembership me, Long consultantId, Long newMarketerId, Instant at, String reason, boolean allowOver) {
        gateWrite(me);
        Instant now = Instant.now(clock);
        int maxDays = settings.scheduleMaxDays(me.orgId());
        if (at == null || !at.isAfter(now.plus(NOW_GRACE))) throw OrgException.invalid("effectiveAt", "must be in the future");
        if (at.isAfter(now.plus(Duration.ofDays(maxDays)))) throw OrgException.invalid("effectiveAt", "at most " + maxDays + " days ahead");
        String why = MarketingAssignmentsService.reason(reason);
        return create(me, MarketerAssignmentSchedule.REASSIGN, consultantId, newMarketerId, at, null, why, allowOver, now);
    }

    /**
     * Plans temporary cover from {@code startsAt} (null or within a minute of now = starts at once) to {@code endsAt}. A reason is required.
     */
    @Transactional
    public Schedule delegate(OrgMembership me, Long consultantId, Long coverId, Instant startsAt, Instant endsAt, String reason, boolean allowOver) {
        gateWrite(me);
        Instant now = Instant.now(clock);
        Instant from = startsAt == null || !startsAt.isAfter(now.plus(NOW_GRACE)) ? now : startsAt;
        int scheduleDays = settings.scheduleMaxDays(me.orgId());
        int coverDays = settings.delegateMaxDays(me.orgId());
        if (startsAt != null && startsAt.isBefore(now.minus(Duration.ofDays(1)))) throw OrgException.invalid("startsAt", "cannot be in the past");
        if (from.isAfter(now.plus(Duration.ofDays(scheduleDays)))) throw OrgException.invalid("startsAt", "at most " + scheduleDays + " days ahead");
        if (endsAt == null) throw OrgException.invalid("endsAt", "is required for temporary cover");
        if (!endsAt.isAfter(from.plus(NOW_GRACE))) throw OrgException.invalid("endsAt", "must be after the start");
        if (endsAt.isAfter(from.plus(Duration.ofDays(coverDays)))) throw OrgException.invalid("endsAt", "temporary cover lasts at most " + coverDays + " days");
        String why = MarketingAssignmentsService.reason(reason);
        if (why == null || why.length() < 3) throw OrgException.invalid("reason", "tell us why (3 to 200 characters)");
        return create(me, MarketerAssignmentSchedule.DELEGATE, consultantId, coverId, from, endsAt, why, allowOver, now);
    }

    private Schedule create(OrgMembership me, String kind, Long consultantId, Long marketerId, Instant startsAt, Instant endsAt, String reason, boolean allowOver, Instant now) {
        Long orgId = me.orgId();
        if (consultantId == null || consultantId <= 0) throw OrgException.invalid("consultantId", "is required");
        if (marketerId == null || marketerId <= 0) throw OrgException.invalid("marketerMemberId", "is required");
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        if (!"ACTIVE".equals(c.getStatus())) throw new OrgNotFoundException();
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, consultantId).orElse(null);
        Long current = a == null ? null : a.getMarketerMemberId();
        if (!mayTouch(me, current)) throw new OrgNotFoundException();
        boolean delegate = MarketerAssignmentSchedule.DELEGATE.equals(kind);
        if (delegate && a == null) throw OrgException.coded(422, MarketingAssignmentsService.REASON_NO_ASSIGNMENT, "This consultant has no marketer to cover for", Map.of());
        MarketerCapacity target = capacities.findByOrgIdAndMemberId(orgId, marketerId).orElse(null);
        if (target == null || !access.canAct(me, MarketingAssignmentsService.KEY_MANAGE, target.getMemberId())) throw new OrgNotFoundException();
        if (!"ACTIVE".equals(target.getStatus())) {
            throw OrgException.coded(422, MarketingAssignmentsService.CODE_MARKETER_INVALID, "This marketer is paused and takes no new consultants", Map.of("marketerMemberId", target.getMemberId()));
        }
        if (target.getMemberId().equals(current)) throw OrgException.coded(409, MarketingAssignmentsService.CODE_ALREADY_MARKETER, "That marketer already carries this consultant", Map.of("memberId", target.getMemberId()));
        for (MarketerAssignmentSchedule open : schedules.findByConsultantAndStatus(orgId, consultantId, PENDING)) {
            if (open.getKind().equals(kind)) {
                throw OrgException.coded(409, CODE_SCHEDULE_EXISTS, delegate ? "There is already a temporary cover for this consultant; end it first" : "A handover is already scheduled for this consultant; cancel it first", Map.of("scheduleId", open.getId()));
            }
        }
        long carried = assignments.countByOrgIdAndMarketerMemberId(orgId, target.getMemberId());
        refuseOverLicence(orgId, target.getMemberId(), carried, 1);
        boolean over = carried + 1 > target.getCapacity();
        if (over && !allowOver) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("marketerMemberId", target.getMemberId());
            extra.put("capacity", target.getCapacity());
            extra.put("current", carried);
            extra.put("adding", 1);
            extra.put("projected", carried + 1);
            throw OrgException.coded(409, MarketingAssignmentsService.CODE_OVER_CAPACITY, "This would put the marketer over capacity", extra);
        }

        MarketerAssignmentSchedule s = new MarketerAssignmentSchedule();
        s.setOrgId(orgId);
        s.setConsultantId(consultantId);
        s.setKind(kind);
        s.setStatus(MarketerAssignmentSchedule.SCHEDULED);
        s.setNewMarketerMemberId(target.getMemberId());
        s.setStartsAt(startsAt);
        s.setEndsAt(endsAt);
        s.setReason(reason);
        s.setCreatedByMemberId(me.memberId());
        s.setCreatedAt(now);
        s = schedules.saveAndFlush(s);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("scheduleId", s.getId());
        details.put("kind", kind);
        details.put("marketer", target.getMemberId());
        details.put("from", current);
        details.put("startsAt", startsAt.toString());
        if (endsAt != null) details.put("endsAt", endsAt.toString());
        if (reason != null) details.put("reason", reason);
        if (over) details.put("overCapacity", true);
        audit(me, AUDIT_SCHEDULE, consultantId, details, over ? "MEDIUM" : "LOW");
        if (!startsAt.isAfter(now)) { // cover that starts at once
            applyStart(me, s, now);
            s = schedules.saveAndFlush(s);
        }
        return toDto(orgId, List.of(s)).get(0);
    }

    /** The licence cap: 409 CONSULTANTS_LIMIT, never waived by {@code allowOverCapacity}. */
    void refuseOverLicence(Long orgId, Long marketerId, long carried, int adding) {
        int max = settings.consultantsMax(orgId);
        if (max > 0 && carried + adding > max) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("marketerMemberId", marketerId);
            extra.put("max", max);
            extra.put("current", carried);
            extra.put("adding", adding);
            extra.put("projected", carried + adding);
            throw OrgException.coded(409, CODE_CONSULTANTS_LIMIT, "The licence allows " + max + " consultants per marketer", extra);
        }
    }

    // ---- reads -----------------------------------------------------------------------------------------------------------------

    /** The plans still to happen or happening (SCHEDULED, ACTIVE) that the caller may see, soonest first; one consultant's when {@code consultantId} is given. */
    @Transactional(readOnly = true)
    public ScheduleList list(OrgMembership me, Long consultantId) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        Set<Long> visible = access.visibleIds(me, scope);
        if (consultantId != null) { // one consultant: the same wall as the history (outside the caller's reach is the generic 404)
            consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
            MarketerAssignment cur = assignments.findByOrgIdAndConsultantId(orgId, consultantId).orElse(null);
            if (!(cur == null ? visible == null : (visible == null || visible.contains(cur.getMarketerMemberId())))) throw new OrgNotFoundException();
        }
        List<MarketerAssignmentSchedule> rows = consultantId == null ? schedules.findByStatus(orgId, PENDING) : schedules.findByConsultantAndStatus(orgId, consultantId, PENDING);
        List<MarketerAssignmentSchedule> mine = new ArrayList<>();
        for (MarketerAssignmentSchedule s : rows) {
            if (visible == null) {
                mine.add(s);
                continue;
            }
            MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, s.getConsultantId()).orElse(null);
            boolean sees = (a != null && visible.contains(a.getMarketerMemberId())) || visible.contains(s.getNewMarketerMemberId()) || (s.getReturnMarketerMemberId() != null && visible.contains(s.getReturnMarketerMemberId()));
            if (sees) mine.add(s);
        }
        return new ScheduleList(toDto(orgId, mine));
    }

    /** What the Reassign sheet shows before anything happens. */
    @Transactional(readOnly = true)
    public HandoverPreview preview(OrgMembership me, Long consultantId, Long toMemberId) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, consultantId).orElse(null);
        Set<Long> visible = access.visibleIds(me, scope);
        boolean inScope = a == null ? visible == null : (visible == null || visible.contains(a.getMarketerMemberId()));
        if (!inScope) throw new OrgNotFoundException();
        Long from = a == null ? null : a.getMarketerMemberId();
        MarketerCapacity target = toMemberId == null ? null : capacities.findByOrgIdAndMemberId(orgId, toMemberId).orElse(null);
        if (toMemberId != null && (target == null || !access.canAct(me, MarketingAssignmentsService.KEY_MANAGE, toMemberId))) throw new OrgNotFoundException();
        AssignmentLifecycleService.Handover h = lifecycle.previewHandover(orgId, consultantId, from, toMemberId);
        Integer toAssigned = null, toCapacity = null;
        boolean over = false, overLicence = false;
        int licence = settings.consultantsMax(orgId);
        if (target != null) {
            long carried = assignments.countByOrgIdAndMarketerMemberId(orgId, target.getMemberId());
            boolean already = target.getMemberId().equals(from);
            toAssigned = (int) carried;
            toCapacity = target.getCapacity();
            over = !already && carried + 1 > target.getCapacity();
            overLicence = !already && licence > 0 && carried + 1 > licence;
        }
        List<Long> ids = new ArrayList<>();
        if (from != null) ids.add(from);
        if (toMemberId != null) ids.add(toMemberId);
        Map<Long, String> names = names(orgId, ids);
        return new HandoverPreview(
            c.getId(), c.getDisplayName(), from == null ? null : new Person(from, names.getOrDefault(from, "Member")), toMemberId == null ? null : new Person(toMemberId, names.getOrDefault(toMemberId, "Member")),
            h.opportunities(), h.tasks(), h.followups(), h.total(), lifecycle.handoverEnabled(orgId), toAssigned, toCapacity, licence > 0 ? licence : null, over, overLicence,
            toDto(orgId, schedules.findByConsultantAndStatus(orgId, consultantId, PENDING))
        );
    }

    // ---- cancel / end early ----------------------------------------------------------------------------------------------------

    /** A plan that has not started is cancelled; a cover that is running ends now and the consultant goes back. Anything else is 409 NOT_PENDING. */
    @Transactional
    public Schedule cancel(OrgMembership me, Long scheduleId) {
        gateWrite(me);
        Long orgId = me.orgId();
        MarketerAssignmentSchedule s = schedules.findByOrgIdAndId(orgId, scheduleId).orElseThrow(OrgNotFoundException::new);
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, s.getConsultantId()).orElse(null);
        Long current = a == null ? null : a.getMarketerMemberId();
        if (!(current != null ? access.canAct(me, MarketingAssignmentsService.KEY_MANAGE, current) : mayTouch(me, null)) && !access.canAct(me, MarketingAssignmentsService.KEY_MANAGE, s.getNewMarketerMemberId())) {
            throw new OrgNotFoundException();
        }
        Instant now = Instant.now(clock);
        if (MarketerAssignmentSchedule.SCHEDULED.equals(s.getStatus())) {
            finish(s, MarketerAssignmentSchedule.CANCELLED, OUT_CANCELLED, now);
            Map<String, Object> details = detailsOf(s);
            audit(me, AUDIT_SCHEDULE_CANCEL, s.getConsultantId(), details, "LOW");
        } else if (MarketerAssignmentSchedule.ACTIVE.equals(s.getStatus())) {
            endDelegate(me, s, now, OUT_ENDED_EARLY);
        } else {
            throw OrgException.coded(409, CODE_NOT_PENDING, "That plan is no longer pending", Map.of("status", s.getStatus()));
        }
        return toDto(orgId, List.of(schedules.saveAndFlush(s))).get(0);
    }

    // ---- apply: start and end (shared by the job, a cover that starts at once, cancel and offboarding) -----------------------------

    /**
     * Applies the start of a plan. A plan that cannot go ahead (the consultant or the marketer is gone, the licence cap is reached...) becomes FAILED with the
     * reason code as its outcome and one audit row; it is never half applied.
     */
    void applyStart(OrgMembership actor, MarketerAssignmentSchedule s, Instant now) {
        Long orgId = s.getOrgId();
        boolean delegate = MarketerAssignmentSchedule.DELEGATE.equals(s.getKind());
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, s.getConsultantId()).orElse(null);
        if (c == null || !"ACTIVE".equals(c.getStatus())) {
            fail(actor, s, "CONSULTANT_GONE", now);
            return;
        }
        MarketerCapacity target = capacities.findByOrgIdAndMemberId(orgId, s.getNewMarketerMemberId()).orElse(null);
        if (target == null || !"ACTIVE".equals(target.getStatus()) || !seatActive(orgId, target.getMemberId())) {
            fail(actor, s, MarketingAssignmentsService.CODE_MARKETER_INVALID, now);
            return;
        }
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, c.getId()).orElse(null);
        if (delegate && a == null) {
            fail(actor, s, MarketingAssignmentsService.REASON_NO_ASSIGNMENT, now);
            return;
        }
        if (a != null && target.getMemberId().equals(a.getMarketerMemberId())) {
            fail(actor, s, MarketingAssignmentsService.CODE_ALREADY_MARKETER, now);
            return;
        }
        long carried = assignments.countByOrgIdAndMarketerMemberId(orgId, target.getMemberId());
        int max = settings.consultantsMax(orgId);
        if (max > 0 && carried + 1 > max) {
            fail(actor, s, CODE_CONSULTANTS_LIMIT, now);
            return;
        }
        AssignmentLifecycleService.Snap before = AssignmentLifecycleService.snap(a);
        MarketerAssignment row = a == null ? new MarketerAssignment() : a;
        if (a == null) {
            row.setOrgId(orgId);
            row.setConsultantId(c.getId());
        }
        if (delegate) s.setReturnMarketerMemberId(a.getMarketerMemberId());
        row.setMarketerMemberId(target.getMemberId());
        row.setAssignedAt(now);
        row.setAssignedByMemberId(actor.memberId() != null ? actor.memberId() : s.getCreatedByMemberId());
        if (row.getBackupMemberId() != null && row.getBackupMemberId().equals(target.getMemberId())) row.setBackupMemberId(null);
        row.setLastActivityAt(now);
        assignments.save(row);
        String why = s.getReason() != null ? s.getReason() : delegate ? "Temporary cover" : "Scheduled handover";
        AssignmentLifecycleService.Handover moved = lifecycle.record(actor, c.getId(), before, AssignmentLifecycleService.snap(row), why, delegate ? MarketerAssignmentEvent.DELEGATE : null);
        s.setStatus(delegate ? MarketerAssignmentSchedule.ACTIVE : MarketerAssignmentSchedule.DONE);
        s.setAppliedAt(now);
        s.setOutcome(OUT_APPLIED);
        if (!delegate) s.setFinishedAt(now);
        schedules.save(s);
        Map<String, Object> details = detailsOf(s);
        details.put("to", target.getMemberId());
        if (before != null) details.put("from", before.marketerMemberId());
        if (moved.total() > 0) details.put("handover", moved.summary());
        audit(actor, delegate ? AUDIT_DELEGATE_START : AUDIT_SCHEDULED_REASSIGN, c.getId(), details, "LOW");
    }

    /**
     * Ends a running cover: the consultant goes back to the marketer they were taken from, with the open work. Nothing moves when somebody changed the
     * consultant's marketer in between (outcome SUPERSEDED) or the marketer to return to is gone (RETURN_UNAVAILABLE, the cover stays).
     */
    void endDelegate(OrgMembership actor, MarketerAssignmentSchedule s, Instant now, String how) {
        Long orgId = s.getOrgId();
        MarketerAssignment a = assignments.findByOrgIdAndConsultantId(orgId, s.getConsultantId()).orElse(null);
        String outcome;
        AssignmentLifecycleService.Handover moved = AssignmentLifecycleService.Handover.NONE;
        if (a == null || !s.getNewMarketerMemberId().equals(a.getMarketerMemberId())) {
            outcome = OUT_SUPERSEDED;
        } else {
            Long back = s.getReturnMarketerMemberId();
            boolean canReturn = back != null && capacities.findByOrgIdAndMemberId(orgId, back).isPresent() && seatActive(orgId, back);
            if (!canReturn) {
                outcome = OUT_RETURN_UNAVAILABLE;
            } else {
                AssignmentLifecycleService.Snap before = AssignmentLifecycleService.snap(a);
                a.setMarketerMemberId(back);
                a.setAssignedAt(now);
                a.setAssignedByMemberId(actor.memberId() != null ? actor.memberId() : s.getCreatedByMemberId());
                if (a.getBackupMemberId() != null && a.getBackupMemberId().equals(back)) a.setBackupMemberId(null);
                a.setLastActivityAt(now);
                assignments.save(a);
                moved = lifecycle.record(actor, a.getConsultantId(), before, AssignmentLifecycleService.snap(a), "Cover ended", MarketerAssignmentEvent.DELEGATE_END);
                outcome = how;
            }
        }
        finish(s, MarketerAssignmentSchedule.ENDED, outcome, now);
        Map<String, Object> details = detailsOf(s);
        details.put("result", outcome);
        if (moved.total() > 0) details.put("handover", moved.summary());
        audit(actor, AUDIT_DELEGATE_END, s.getConsultantId(), details, OUT_RETURN_UNAVAILABLE.equals(outcome) ? "MEDIUM" : "LOW");
    }

    private void fail(OrgMembership actor, MarketerAssignmentSchedule s, String code, Instant now) {
        finish(s, MarketerAssignmentSchedule.FAILED, code, now);
        Map<String, Object> details = detailsOf(s);
        details.put("code", code);
        audit(actor, AUDIT_SCHEDULE_FAILED, s.getConsultantId(), details, "MEDIUM");
    }

    private void finish(MarketerAssignmentSchedule s, String status, String outcome, Instant now) {
        s.setStatus(status);
        s.setOutcome(outcome);
        s.setFinishedAt(now);
        schedules.save(s);
    }

    private boolean seatActive(Long orgId, Long memberId) {
        return members.findByOrgIdAndId(orgId, memberId).map(m -> m.getStatus() == OrgMemberStatus.ACTIVE).orElse(false);
    }

    // ---- reacting to other changes ---------------------------------------------------------------------------------------------

    /**
     * Called when somebody changes the marketer of a consultant by hand (the board, an undo): a running cover whose cover marketer no longer carries the consultant
     * is over (SUPERSEDED), and when the consultant is left without a marketer every plan waiting for them is cancelled. Writes no history and moves nothing.
     */
    public void onMarketerChanged(Long orgId, Long consultantId, Long newMarketerOrNull) {
        Instant now = Instant.now(clock);
        for (MarketerAssignmentSchedule s : schedules.findByConsultantAndStatus(orgId, consultantId, PENDING)) {
            if (MarketerAssignmentSchedule.ACTIVE.equals(s.getStatus())) { // somebody decided by hand: whatever they chose, the cover no longer returns by itself
                finish(s, MarketerAssignmentSchedule.ENDED, OUT_SUPERSEDED, now);
            } else if (MarketerAssignmentSchedule.SCHEDULED.equals(s.getStatus()) && newMarketerOrNull == null) {
                finish(s, MarketerAssignmentSchedule.CANCELLED, OUT_UNASSIGNED, now);
            }
        }
    }

    /**
     * A member is leaving: plans that start with or for them are cancelled, a running cover they give goes back to the marketer it was taken from, a running cover
     * they were taken from ends and leaves the cover where it is. Returns how many plans were touched.
     */
    public int onMemberLeaving(OrgMembership actor, Long orgId, Long memberId) {
        Instant now = Instant.now(clock);
        int touched = 0;
        for (MarketerAssignmentSchedule s : schedules.findByStatusInvolving(orgId, PENDING, memberId)) {
            touched++;
            if (MarketerAssignmentSchedule.SCHEDULED.equals(s.getStatus())) {
                finish(s, MarketerAssignmentSchedule.CANCELLED, OUT_MEMBER_LEFT, now);
                audit(actor, AUDIT_SCHEDULE_CANCEL, s.getConsultantId(), detailsOf(s), "LOW");
            } else if (memberId.equals(s.getNewMarketerMemberId())) {
                endDelegate(actor, s, now, OUT_MEMBER_LEFT); // the cover leaves: the consultant goes back to the marketer it was taken from
            } else {
                finish(s, MarketerAssignmentSchedule.ENDED, OUT_MEMBER_LEFT, now); // the marketer to return to leaves: the cover stays where it is
                audit(actor, AUDIT_DELEGATE_END, s.getConsultantId(), detailsOf(s), "MEDIUM");
            }
        }
        return touched;
    }

    // ---- the job ---------------------------------------------------------------------------------------------------------------

    /**
     * Applies every plan that is due at {@code now}, in every organization: plans waiting for their start date, and covers that have run to their end date. Each
     * plan runs in its own transaction inside its own organization; one failing plan never stops the others, and running it twice is a no-op (a plan that has
     * been applied is no longer due).
     */
    public RunResult runDue(Instant now) {
        List<MarketerAssignmentSchedule> due = em
            .createQuery(
                "select s from MarketerAssignmentSchedule s where (s.status = 'SCHEDULED' and s.startsAt <= :now) or (s.status = 'ACTIVE' and s.kind = 'DELEGATE' and s.endsAt <= :now) order by s.orgId asc, s.id asc",
                MarketerAssignmentSchedule.class
            )
            .setParameter("now", now)
            .getResultList();
        int started = 0, ended = 0, failed = 0;
        for (MarketerAssignmentSchedule row : due) {
            Long orgId = row.getOrgId();
            Long id = row.getId();
            try {
                String result = TenantScoped.get(orgId, () -> rowTx.execute(st -> process(orgId, id, now)));
                if ("STARTED".equals(result)) started++;
                else if ("ENDED".equals(result)) ended++;
                else if ("FAILED".equals(result)) failed++;
            } catch (RuntimeException e) {
                LOG.warn("Scheduled marketer change {} failed: {}", id, e.toString());
                failed++;
                try {
                    TenantScoped.run(orgId, () -> rowTx.executeWithoutResult(st -> schedules.findByOrgIdAndId(orgId, id).ifPresent(s -> {
                        if (PENDING.contains(s.getStatus())) {
                            finish(s, MarketerAssignmentSchedule.FAILED, "ERROR", now);
                            audit(system(orgId, null), AUDIT_SCHEDULE_FAILED, s.getConsultantId(), detailsOf(s), "MEDIUM");
                        }
                    })));
                } catch (RuntimeException again) {
                    LOG.warn("Could not mark scheduled marketer change {} as failed", id, again);
                }
            }
        }
        return new RunResult(started, ended, failed);
    }

    private String process(Long orgId, Long id, Instant now) {
        MarketerAssignmentSchedule s = schedules.findByOrgIdAndId(orgId, id).orElse(null);
        if (s == null) return "SKIPPED";
        OrgMembership actor = system(orgId, null);
        if (MarketerAssignmentSchedule.SCHEDULED.equals(s.getStatus()) && !s.getStartsAt().isAfter(now)) {
            if (s.getEndsAt() != null && !s.getEndsAt().isAfter(now)) { // the whole cover has already passed (the job was down): nothing to do
                finish(s, MarketerAssignmentSchedule.CANCELLED, OUT_EXPIRED, now);
                audit(actor, AUDIT_SCHEDULE_CANCEL, s.getConsultantId(), detailsOf(s), "LOW");
                return "SKIPPED";
            }
            applyStart(actor, s, now);
            return MarketerAssignmentSchedule.FAILED.equals(s.getStatus()) ? "FAILED" : "STARTED";
        }
        if (MarketerAssignmentSchedule.ACTIVE.equals(s.getStatus()) && s.getEndsAt() != null && !s.getEndsAt().isAfter(now)) {
            endDelegate(actor, s, now, OUT_RETURNED);
            return "ENDED";
        }
        return "SKIPPED";
    }

    // ---- mapping ---------------------------------------------------------------------------------------------------------------

    private List<Schedule> toDto(Long orgId, Collection<MarketerAssignmentSchedule> rows) {
        Set<Long> ids = new LinkedHashSet<>();
        Map<Long, Long> currentOf = new HashMap<>();
        Set<Long> consultantIds = new LinkedHashSet<>();
        for (MarketerAssignmentSchedule s : rows) {
            ids.add(s.getNewMarketerMemberId());
            if (s.getReturnMarketerMemberId() != null) ids.add(s.getReturnMarketerMemberId());
            if (s.getCreatedByMemberId() != null) ids.add(s.getCreatedByMemberId());
            consultantIds.add(s.getConsultantId());
        }
        for (Long cid : consultantIds) {
            assignments.findByOrgIdAndConsultantId(orgId, cid).ifPresent(a -> {
                currentOf.put(cid, a.getMarketerMemberId());
                ids.add(a.getMarketerMemberId());
            });
        }
        Map<Long, String> names = names(orgId, ids);
        Map<Long, String> consultantNames = new HashMap<>();
        for (Long cid : consultantIds) consultants.findByOrgIdAndId(orgId, cid).ifPresent(c -> consultantNames.put(cid, c.getDisplayName()));
        List<Schedule> out = new ArrayList<>();
        for (MarketerAssignmentSchedule s : rows) {
            out.add(new Schedule(
                s.getId(), s.getConsultantId(), consultantNames.get(s.getConsultantId()), s.getKind(), s.getStatus(), person(s.getNewMarketerMemberId(), names), person(s.getReturnMarketerMemberId(), names),
                person(currentOf.get(s.getConsultantId()), names), s.getStartsAt(), s.getEndsAt(), s.getReason(), s.getOutcome(), person(s.getCreatedByMemberId(), names), s.getCreatedAt(), s.getAppliedAt(), s.getFinishedAt()
            ));
        }
        return out;
    }

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

    private static Map<String, Object> detailsOf(MarketerAssignmentSchedule s) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("scheduleId", s.getId());
        d.put("kind", s.getKind());
        d.put("marketer", s.getNewMarketerMemberId());
        if (s.getReturnMarketerMemberId() != null) d.put("returnTo", s.getReturnMarketerMemberId());
        if (s.getOutcome() != null) d.put("outcome", s.getOutcome());
        return d;
    }

    private void audit(OrgMembership actor, String action, Long consultantId, Map<String, Object> details, String risk) {
        audit.record(actor.orgId(), actor.login(), actor.role(), action, MarketingAssignmentsService.TARGET_CONSULTANT, null, String.valueOf(consultantId), text(details), null, null, null, risk);
    }

    private String text(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            return String.valueOf(o);
        }
    }
}
