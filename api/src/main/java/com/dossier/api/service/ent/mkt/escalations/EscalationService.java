package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.domain.ent.mgmt.MktEscalation;
import com.dossier.api.domain.ent.mgmt.MktEscalationEvent;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationEventRepository;
import com.dossier.api.repository.ent.mgmt.MktEscalationRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.mgmt.TeamScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Escalations (docs/enterprise-v2/deferred/marketing-manager.md section 4.2, decision DD-2): what a Marketing Manager must look at. Rows come from the rules of
 * {@link EscalationRules} (stalled opportunity, overdue follow-up, unanswered question, overloaded marketer, aging approval) and from a marketer's manual raise;
 * a rule never raises the same thing twice while it is open (the generated {@code open_key}) and clears its own rows when the condition goes away.
 *
 * <p>A manager works them: acknowledge, assign to a marketer of the team, snooze, resolve (with a resolution text), dismiss, reopen, comment. {@code escalations.manage}
 * at TEAM scope or wider decides; a row is the team's when its marketer or its consultant is (an organization-wide caller reaches every row); one outside the
 * team and an unknown id are the generic 404; an action on a closed row is 409 {@code ESCALATION_NOT_OPEN}. Every action is one row in the escalation's own
 * append-only trail and one audit row; free text is scanned for sensitive data. Nothing here submits an application (E1).
 */
@Service
public class EscalationService {

    public static final String KEY = "escalations.manage";
    public static final String TARGET = "MKT_ESCALATION";
    public static final String AUDIT_RAISE = "MKT_ESCALATION_RAISE";
    public static final String AUDIT_ACKNOWLEDGE = "MKT_ESCALATION_ACKNOWLEDGE";
    public static final String AUDIT_ASSIGN = "MKT_ESCALATION_ASSIGN";
    public static final String AUDIT_SNOOZE = "MKT_ESCALATION_SNOOZE";
    public static final String AUDIT_RESOLVE = "MKT_ESCALATION_RESOLVE";
    public static final String AUDIT_DISMISS = "MKT_ESCALATION_DISMISS";
    public static final String AUDIT_REOPEN = "MKT_ESCALATION_REOPEN";
    public static final String AUDIT_COMMENT = "MKT_ESCALATION_COMMENT";

    public static final String CODE_NOT_OPEN = "ESCALATION_NOT_OPEN";
    public static final String CODE_ALREADY_OPEN = "ESCALATION_ALREADY_OPEN";

    public static final List<String> KINDS = List.of(
        MktEscalation.KIND_STALLED_OPPORTUNITY, MktEscalation.KIND_OVERDUE_FOLLOWUP, MktEscalation.KIND_UNANSWERED_QUESTION, MktEscalation.KIND_OVERLOADED_MARKETER,
        MktEscalation.KIND_MANUAL, MktEscalation.KIND_APPROVAL_AGING
    );
    public static final List<String> SEVERITIES = List.of("LOW", "MEDIUM", "HIGH");
    public static final Set<String> SUBJECT_TYPES = Set.of("MKT_OPPORTUNITY", "MKT_FOLLOWUP", "CWS_QUESTION", "MARKETER", "MKT_APPROVAL_REQUEST", "CONSULTANT");
    public static final int TITLE_MAX = 160;
    public static final int DETAIL_MAX = 500;
    public static final int RESOLUTION_MAX = 300;
    public static final int COMMENT_MAX = 500;
    /** The longest a snooze may be (a date picker can go far; a year is the most that makes sense for something that needs a manager). */
    static final Duration SNOOZE_MAX = Duration.ofDays(365);

    /** What to raise. {@code ruleKey} null = a person raised it (never deduplicated); a rule key makes the call idempotent on (rule, subject). */
    public record Raise(
        String kind, String severity, String subjectType, Long subjectId, Long consultantId, Long marketerMemberId, String title, String detail, String ruleKey, Long raisedByMemberId
    ) {}

    /** The manager's filters: {@code status} OPEN (default; OPEN and ACKNOWLEDGED), SNOOZED, RESOLVED (RESOLVED and DISMISSED), ALL or one status; optional severity, kind, marketer, consultant and a title search. */
    public record Filter(String status, String severity, String kind, Long marketerMemberId, Long consultantId, String q) {}

    private final MktEscalationRepository escalations;
    private final MktEscalationEventRepository trail;
    private final MgmtLookupRepository lookup;
    private final ApplicationNames names;
    private final TeamScope teamScope;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public EscalationService(
        MktEscalationRepository escalations,
        MktEscalationEventRepository trail,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        TeamScope teamScope,
        OrgAuditService audit
    ) {
        this(escalations, trail, lookup, names, teamScope, audit, Clock.systemUTC());
    }

    EscalationService(
        MktEscalationRepository escalations,
        MktEscalationEventRepository trail,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        TeamScope teamScope,
        OrgAuditService audit,
        Clock clock
    ) {
        this.escalations = escalations;
        this.trail = trail;
        this.lookup = lookup;
        this.names = names;
        this.teamScope = teamScope;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- raise -----------------------------------------------------------------------------------------------------------------------

    /**
     * Records an escalation (a rule, or a person through {@code MktEscalationsService}). Idempotent on (rule, subject type, subject id) while the earlier row is live:
     * that row is returned (its severity raised when the new one is higher). A person's raise (no rule key) is always a new row.
     */
    @Transactional
    public EscalationDTO raise(Long orgId, Raise r) {
        if (orgId == null || r == null) throw new OrgNotFoundException();
        String kind = oneOf("kind", r.kind(), KINDS);
        String severity = oneOf("severity", r.severity(), SEVERITIES);
        String subjectType = r.subjectType() == null ? "" : r.subjectType().strip().toUpperCase(Locale.ROOT);
        if (!SUBJECT_TYPES.contains(subjectType)) throw OrgException.invalid("subjectType", "must be one of " + SUBJECT_TYPES);
        if (r.subjectId() == null || r.subjectId() <= 0) throw OrgException.invalid("subjectId", "is required");
        String title = text("title", r.title(), TITLE_MAX, true);
        String detail = text("detail", r.detail(), DETAIL_MAX, false);
        Instant now = clock.instant();
        if (r.ruleKey() != null) {
            MktEscalation live = escalations.findLive(orgId, r.ruleKey(), subjectType, r.subjectId()).orElse(null);
            if (live != null) {
                if (rank(severity) > rank(live.getSeverity())) bump(live, severity, "Severity raised to " + severity + ".", now);
                return dtos(orgId, List.of(live), false).get(0);
            }
        }
        MktEscalation e = new MktEscalation();
        e.setOrgId(orgId);
        e.setKind(kind);
        e.setSeverity(severity);
        e.setSubjectType(subjectType);
        e.setSubjectId(r.subjectId());
        e.setConsultantId(r.consultantId());
        e.setMarketerMemberId(r.marketerMemberId());
        e.setTitle(title);
        e.setDetail(detail);
        e.setRuleKey(r.ruleKey());
        e.setRaisedByMemberId(r.raisedByMemberId());
        e.setRaisedAt(now);
        e.setStatus(MktEscalation.STATUS_OPEN);
        e.setCreatedAt(now);
        e.setUpdatedAt(now);
        MktEscalation saved = escalations.saveAndFlush(e);
        event(saved, MktEscalationEvent.RAISED, r.raisedByMemberId(), detail, now);
        return dtos(orgId, List.of(saved), false).get(0);
    }

    // ---- reads -----------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public EscalationDTO.Page list(OrgMembership me, Filter f, int page, int size) {
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > 100) throw OrgException.invalid("size", "must be between 1 and 100");
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        Filter filter = f == null ? new Filter(null, null, null, null, null, null) : f;
        List<String> statuses = statuses(filter.status());
        String severity = filter.severity() == null || filter.severity().isBlank() ? null : oneOf("severity", filter.severity(), SEVERITIES);
        String kind = filter.kind() == null || filter.kind().isBlank() ? null : oneOf("kind", filter.kind(), KINDS);
        if (filter.marketerMemberId() != null && !team.all()) teamScope.require(team, filter.marketerMemberId());
        if (filter.consultantId() != null) teamScope.requireConsultant(team, filter.consultantId());
        String q = search(filter.q());
        boolean closedOnly = statuses.stream().allMatch(s -> MktEscalation.STATUS_RESOLVED.equals(s) || MktEscalation.STATUS_DISMISSED.equals(s));
        PageRequest p = PageRequest.of(page, size);
        Page<MktEscalation> rows = closedOnly
            ? escalations.searchClosed(team.orgId(), team.all(), ids(team.marketerMemberIds()), ids(team.consultantIds()), statuses, severity, kind, filter.marketerMemberId(), filter.consultantId(), q, p)
            : escalations.searchLive(team.orgId(), team.all(), ids(team.marketerMemberIds()), ids(team.consultantIds()), statuses, severity, kind, filter.marketerMemberId(), filter.consultantId(), q, p);
        return new EscalationDTO.Page(dtos(team.orgId(), rows.getContent(), false), rows.getNumber(), rows.getSize(), rows.getTotalElements(), rows.hasNext());
    }

    /** One escalation with its trail. A row outside the team: the generic 404. */
    @Transactional(readOnly = true)
    public EscalationDTO get(OrgMembership me, Long id) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        MktEscalation e = escalations.findByOrgIdAndId(team.orgId(), id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        requireVisible(team, e);
        return dtos(team.orgId(), List.of(e), true).get(0);
    }

    @Transactional(readOnly = true)
    public EscalationDTO.Counts counts(OrgMembership me) {
        return counts(teamScope.resolve(me, AuthzOperation.READ, KEY));
    }

    /** The live escalations of the team by severity (the badge and the Home tile). */
    @Transactional(readOnly = true)
    public EscalationDTO.Counts counts(TeamScope.View team) {
        long high = 0, medium = 0, low = 0, snoozed = 0;
        for (Object[] row : escalations.liveCounts(team.orgId(), team.all(), ids(team.marketerMemberIds()), ids(team.consultantIds()))) {
            String severity = String.valueOf(row[0]);
            String status = String.valueOf(row[1]);
            long n = ((Number) row[2]).longValue();
            if (MktEscalation.STATUS_SNOOZED.equals(status)) snoozed += n;
            else if ("HIGH".equals(severity)) high += n;
            else if ("MEDIUM".equals(severity)) medium += n;
            else low += n;
        }
        return new EscalationDTO.Counts(high + medium + low, high, medium, low, snoozed);
    }

    /** The team's oldest live HIGH escalations (the Home page's "needs you" list). */
    @Transactional(readOnly = true)
    public List<EscalationDTO> topHigh(TeamScope.View team, int limit) {
        return dtos(
            team.orgId(),
            escalations.liveOfSeverity(team.orgId(), team.all(), ids(team.marketerMemberIds()), ids(team.consultantIds()), "HIGH", PageRequest.of(0, Math.max(1, limit))),
            false
        );
    }

    // ---- the manager's actions ---------------------------------------------------------------------------------------------------

    /** The permission wall of the actions: callable on its own so a route can refuse before it looks at the Idempotency-Key header. */
    public void gateWrite(OrgMembership me) {
        teamScope.resolve(me, AuthzOperation.WRITE, KEY);
    }

    @Transactional
    public EscalationDTO acknowledge(OrgMembership me, Long id) {
        Ctx c = lock(me, id);
        requireLive(c.e());
        if (!MktEscalation.STATUS_ACKNOWLEDGED.equals(c.e().getStatus())) {
            c.e().setStatus(MktEscalation.STATUS_ACKNOWLEDGED);
            c.e().setSnoozedUntil(null);
            save(c.e(), c.now());
            event(c.e(), MktEscalationEvent.ACKNOWLEDGED, me.memberId(), null, c.now());
            audit(me, AUDIT_ACKNOWLEDGE, c.e(), null);
        }
        return out(c);
    }

    @Transactional
    public EscalationDTO assign(OrgMembership me, Long id, Long memberId) {
        Ctx c = lock(me, id);
        requireLive(c.e());
        if (memberId == null || (!c.team().hasMarketer(memberId) && !memberId.equals(me.memberId()))) throw new OrgNotFoundException(); // a person outside the team is the generic 404
        if (!memberId.equals(c.e().getAssigneeMemberId())) {
            c.e().setAssigneeMemberId(memberId);
            save(c.e(), c.now());
            String who = names.memberNames(c.e().getOrgId(), Set.of(memberId)).getOrDefault(memberId, "a member");
            event(c.e(), MktEscalationEvent.ASSIGNED, me.memberId(), "Assigned to " + who + ".", c.now());
            audit(me, AUDIT_ASSIGN, c.e(), "assignee=" + memberId);
        }
        return out(c);
    }

    @Transactional
    public EscalationDTO snooze(OrgMembership me, Long id, Instant until) {
        Ctx c = lock(me, id);
        requireLive(c.e());
        if (until == null || !until.isAfter(c.now()) || until.isAfter(c.now().plus(SNOOZE_MAX))) throw OrgException.invalid("until", "must be a time in the future, within a year");
        c.e().setStatus(MktEscalation.STATUS_SNOOZED);
        c.e().setSnoozedUntil(until);
        save(c.e(), c.now());
        event(c.e(), MktEscalationEvent.SNOOZED, me.memberId(), "Snoozed until " + until + ".", c.now());
        audit(me, AUDIT_SNOOZE, c.e(), "until=" + until);
        return out(c);
    }

    @Transactional
    public EscalationDTO resolve(OrgMembership me, Long id, String resolution) {
        Ctx c = lock(me, id);
        requireLive(c.e());
        String text = text("resolution", resolution, RESOLUTION_MAX, true);
        close(c.e(), MktEscalation.STATUS_RESOLVED, me.memberId(), text, c.now());
        event(c.e(), MktEscalationEvent.RESOLVED, me.memberId(), text, c.now());
        audit(me, AUDIT_RESOLVE, c.e(), null);
        return out(c);
    }

    @Transactional
    public EscalationDTO dismiss(OrgMembership me, Long id, String note) {
        Ctx c = lock(me, id);
        requireLive(c.e());
        String text = text("note", note, RESOLUTION_MAX, false);
        close(c.e(), MktEscalation.STATUS_DISMISSED, me.memberId(), text, c.now());
        event(c.e(), MktEscalationEvent.DISMISSED, me.memberId(), text, c.now());
        audit(me, AUDIT_DISMISS, c.e(), null);
        return out(c);
    }

    /** Brings a closed or snoozed escalation back as OPEN (the Undo of resolve and dismiss, and the wake of a snooze). */
    @Transactional
    public EscalationDTO reopen(OrgMembership me, Long id) {
        Ctx c = lock(me, id);
        MktEscalation e = c.e();
        if (MktEscalation.STATUS_OPEN.equals(e.getStatus()) || MktEscalation.STATUS_ACKNOWLEDGED.equals(e.getStatus())) {
            throw OrgException.coded(409, CODE_ALREADY_OPEN, "This escalation is already open.", Map.of("status", e.getStatus()));
        }
        if (e.getRuleKey() != null && !e.isLive() && escalations.findLive(e.getOrgId(), e.getRuleKey(), e.getSubjectType(), e.getSubjectId()).isPresent()) {
            throw OrgException.coded(409, CODE_ALREADY_OPEN, "The same thing is already open as another escalation.", Map.of());
        }
        e.setStatus(MktEscalation.STATUS_OPEN);
        e.setSnoozedUntil(null);
        e.setResolvedByMemberId(null);
        e.setResolvedAt(null);
        e.setResolution(null);
        save(e, c.now());
        event(e, MktEscalationEvent.REOPENED, me.memberId(), null, c.now());
        audit(me, AUDIT_REOPEN, e, null);
        return out(c);
    }

    @Transactional
    public EscalationDTO comment(OrgMembership me, Long id, String note) {
        Ctx c = lock(me, id);
        String text = text("note", note, COMMENT_MAX, true);
        event(c.e(), MktEscalationEvent.COMMENTED, me.memberId(), text, c.now());
        audit(me, AUDIT_COMMENT, c.e(), null);
        return out(c);
    }

    // ---- the rules' and the job's helpers (called inside their transactions) -----------------------------------------------------------

    /** The system clears a row whose condition went away: RESOLVED with "Cleared: reason", no person. */
    void systemResolve(MktEscalation e, String reason, Instant now) {
        close(e, MktEscalation.STATUS_RESOLVED, null, "Cleared: " + reason, now);
        event(e, MktEscalationEvent.RESOLVED, null, "Cleared: " + reason, now);
    }

    /** Raises the severity of a live row (never lowers it) and notes why in its trail. */
    void bump(MktEscalation e, String severity, String note, Instant now) {
        e.setSeverity(severity);
        save(e, now);
        event(e, MktEscalationEvent.RAISED, null, note, now);
    }

    /** A snooze ran out: the row is OPEN again. */
    void wake(MktEscalation e, Instant now) {
        e.setStatus(MktEscalation.STATUS_OPEN);
        e.setSnoozedUntil(null);
        save(e, now);
        event(e, MktEscalationEvent.REOPENED, null, "Snooze ended.", now);
    }

    static int rank(String severity) {
        return SEVERITIES.indexOf(severity);
    }

    // ---- internals ---------------------------------------------------------------------------------------------------------------------

    private record Ctx(TeamScope.View team, MktEscalation e, Instant now, OrgMembership me) {}

    private Ctx lock(OrgMembership me, Long id) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY);
        MktEscalation e = escalations.lockByOrgIdAndId(team.orgId(), id == null ? -1L : id).orElseThrow(OrgNotFoundException::new);
        requireVisible(team, e);
        return new Ctx(team, e, clock.instant(), me);
    }

    private EscalationDTO out(Ctx c) {
        return dtos(c.team().orgId(), List.of(c.e()), true).get(0);
    }

    /** A row is the team's when its marketer or its consultant is; an organization-wide caller reaches every row. */
    private void requireVisible(TeamScope.View team, MktEscalation e) {
        if (team.all()) return;
        if (e.getMarketerMemberId() != null && team.hasMarketer(e.getMarketerMemberId())) return;
        if (e.getConsultantId() != null && team.hasConsultant(e.getConsultantId())) return;
        throw new OrgNotFoundException();
    }

    private static void requireLive(MktEscalation e) {
        if (!e.isLive()) throw OrgException.coded(409, CODE_NOT_OPEN, "This escalation is already closed.", Map.of("status", e.getStatus()));
    }

    private void close(MktEscalation e, String status, Long by, String resolution, Instant now) {
        e.setStatus(status);
        e.setSnoozedUntil(null);
        e.setResolvedByMemberId(by);
        e.setResolvedAt(now);
        e.setResolution(resolution);
        save(e, now);
    }

    private void save(MktEscalation e, Instant now) {
        e.setUpdatedAt(now);
        escalations.save(e);
    }

    void event(MktEscalation e, String kind, Long actor, String note, Instant at) {
        MktEscalationEvent ev = new MktEscalationEvent();
        ev.setOrgId(e.getOrgId());
        ev.setEscalationId(e.getId());
        ev.setKind(kind);
        ev.setActorMemberId(actor);
        ev.setNote(note == null ? null : (note.length() > COMMENT_MAX ? note.substring(0, COMMENT_MAX) : note));
        ev.setOccurredAt(at);
        trail.save(ev);
    }

    private void audit(OrgMembership me, String action, MktEscalation e, String extra) {
        audit.record(
            me.orgId(), me.login(), me.role(), action, TARGET, null, String.valueOf(e.getId()),
            "kind=" + e.getKind() + " severity=" + e.getSeverity() + " subject=" + e.getSubjectType() + ":" + e.getSubjectId() + (extra == null ? "" : " " + extra), null, null, null, "LOW"
        );
    }

    private List<EscalationDTO> dtos(Long orgId, List<MktEscalation> rows, boolean withTrail) {
        if (rows.isEmpty()) return List.of();
        Set<Long> memberIds = new HashSet<>();
        Set<Long> consultantIds = new HashSet<>();
        for (MktEscalation e : rows) {
            for (Long m : new Long[] { e.getMarketerMemberId(), e.getRaisedByMemberId(), e.getAssigneeMemberId(), e.getResolvedByMemberId() }) if (m != null) memberIds.add(m);
            if (e.getConsultantId() != null) consultantIds.add(e.getConsultantId());
        }
        Map<Long, List<MktEscalationEvent>> events = new HashMap<>();
        if (withTrail) {
            for (MktEscalation e : rows) {
                List<MktEscalationEvent> list = trail.findByOrgIdAndEscalationIdOrderByOccurredAtAscIdAsc(orgId, e.getId());
                events.put(e.getId(), list);
                for (MktEscalationEvent ev : list) if (ev.getActorMemberId() != null) memberIds.add(ev.getActorMemberId());
            }
        }
        Map<Long, String> members = names.memberNames(orgId, memberIds);
        Map<Long, String> consultants = new HashMap<>();
        if (!consultantIds.isEmpty()) for (Object[] c : lookup.consultantNames(orgId, consultantIds)) consultants.put((Long) c[0], (String) c[1]);
        Instant now = clock.instant();
        List<EscalationDTO> out = new ArrayList<>();
        for (MktEscalation e : rows) {
            List<EscalationDTO.Event> trailOut = null;
            if (withTrail) {
                trailOut = new ArrayList<>();
                for (MktEscalationEvent ev : events.getOrDefault(e.getId(), List.of())) {
                    trailOut.add(new EscalationDTO.Event(ev.getId(), ev.getKind(), person(ev.getActorMemberId(), members), ev.getNote(), ev.getOccurredAt()));
                }
            }
            Instant since = e.getRaisedAt() == null ? now : e.getRaisedAt();
            Instant until = e.getResolvedAt() != null ? e.getResolvedAt() : now;
            out.add(new EscalationDTO(
                e.getId(), e.getKind(), e.getSeverity(), e.getSubjectType(), e.getSubjectId(),
                e.getConsultantId() == null ? null : new EscalationDTO.Person(e.getConsultantId(), consultants.getOrDefault(e.getConsultantId(), "Consultant")),
                person(e.getMarketerMemberId(), members), e.getTitle(), e.getDetail(), e.getRuleKey(), person(e.getRaisedByMemberId(), members), e.getRaisedAt(), e.getStatus(),
                person(e.getAssigneeMemberId(), members), e.getSnoozedUntil(), person(e.getResolvedByMemberId(), members), e.getResolvedAt(), e.getResolution(),
                Math.max(0, Duration.between(since, until).toHours()), trailOut
            ));
        }
        return out;
    }

    private static EscalationDTO.Person person(Long memberId, Map<Long, String> members) {
        return memberId == null ? null : new EscalationDTO.Person(memberId, members.getOrDefault(memberId, "Member"));
    }

    private static List<String> statuses(String raw) {
        String v = raw == null || raw.isBlank() ? "OPEN" : raw.strip().toUpperCase(Locale.ROOT);
        return switch (v) {
            case "OPEN" -> List.of(MktEscalation.STATUS_OPEN, MktEscalation.STATUS_ACKNOWLEDGED);
            case "SNOOZED" -> List.of(MktEscalation.STATUS_SNOOZED);
            case "RESOLVED" -> List.of(MktEscalation.STATUS_RESOLVED, MktEscalation.STATUS_DISMISSED);
            case "ALL" -> List.of(MktEscalation.STATUS_OPEN, MktEscalation.STATUS_ACKNOWLEDGED, MktEscalation.STATUS_SNOOZED, MktEscalation.STATUS_RESOLVED, MktEscalation.STATUS_DISMISSED);
            case "ACKNOWLEDGED", "DISMISSED" -> List.of(v);
            default -> throw OrgException.invalid("status", "must be OPEN, SNOOZED, RESOLVED, ALL, ACKNOWLEDGED or DISMISSED");
        };
    }

    private static String search(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String t = raw.strip().toLowerCase(Locale.ROOT);
        if (t.length() < 2 || t.length() > 80) throw OrgException.invalid("q", "must be 2 to 80 characters");
        return "%" + t.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private static String oneOf(String field, String raw, List<String> allowed) {
        String v = raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + allowed);
        return v;
    }

    private static String text(String field, String raw, int max, boolean required) {
        if (raw == null || raw.isBlank()) {
            if (required) throw OrgException.invalid(field, "enter 1 to " + max + " characters");
            return null;
        }
        String t = raw.strip();
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        SensitiveContent.check(field, field, t);
        return t;
    }

    /** Never an empty collection in an IN list. */
    private static Collection<Long> ids(Set<Long> ids) {
        return ids.isEmpty() ? List.of(-1L) : ids;
    }
}
