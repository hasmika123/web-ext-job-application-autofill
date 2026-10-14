package com.dossier.api.service.ent.mkt.tasks;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktTask;
import com.dossier.api.domain.ent.mkt.MktTaskEvent;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktTaskConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktTaskEventRepository;
import com.dossier.api.repository.ent.mkt.MktTaskRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.ActionResult;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Calendar;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.CalendarDay;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.CreateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Kpi;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Option;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Options;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Page;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Query;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Row;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tab;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.Tabs;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.UpdateRequest;
import com.dossier.api.service.ent.mkt.tasks.MktTasksDto.View;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing workspace's task service (Tasks page, `/w/marketing/tasks`). Permission {@code followups.manage}, ASSIGNED scope.
 *
 * <p>Reach: a caller whose scope is the whole organization ({@link MktScope.View#all()}) sees every task; anyone narrower sees only the tasks they OWN, and
 * only those about a consultant they may see (or about none). So "Team Tasks" (open tasks owned by someone else) is 0 for an ASSIGNED marketer. A task or
 * consultant outside the reach is the generic 404.
 *
 * <p>Windows (UTC, "now" from the clock): <b>overdue</b> is derived (open and due before now); <b>due this week</b> is open and due in {@code [now, now+7d)};
 * <b>completed this week</b> is completed in the last 7 days. "Open" means not COMPLETED; the All / My / Team tabs and "Total Tasks" count open tasks.
 * Deltas compare with the same moment a week ago, computed from {@code created_at}/{@code completed_at} (no history table); no previous value, no chip.
 *
 * <p>E1: every write only RECORDS. Nothing is emailed or messaged, and nothing submits an application for a consultant.
 */
@Service
public class MktTasksService {

    public static final String PERMISSION = "followups.manage";
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 10;
    static final int UPCOMING = 4;

    static final String AUDIT_CREATE = "MARKETER_TASK_CREATE";
    static final String AUDIT_UPDATE = "MARKETER_TASK_UPDATE";
    static final String AUDIT_COMPLETE = "MARKETER_TASK_COMPLETE";
    static final String AUDIT_REOPEN = "MARKETER_TASK_REOPEN";
    static final String AUDIT_REASSIGN = "MARKETER_TASK_REASSIGN";
    static final String AUDIT_DELETE = "MARKETER_TASK_DELETE";
    static final String TARGET = "TASK";
    private static final List<Long> NO_IDS = List.of(-1L);

    private final MktScope scope;
    private final MktTaskRepository tasks;
    private final MktTaskEventRepository events;
    private final MktTaskConsultantRepository consultants;
    private final ClientAccountRepository clients;
    private final MarketerAssignmentRepository assignments;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktTasksService(
        MktScope scope, MktTaskRepository tasks, MktTaskEventRepository events, MktTaskConsultantRepository consultants, ClientAccountRepository clients,
        MarketerAssignmentRepository assignments, OrgMemberRepository members, UserRepository users, OrgAuditService audit
    ) {
        this(scope, tasks, events, consultants, clients, assignments, members, users, audit, Clock.systemUTC());
    }

    MktTasksService(
        MktScope scope, MktTaskRepository tasks, MktTaskEventRepository events, MktTaskConsultantRepository consultants, ClientAccountRepository clients,
        MarketerAssignmentRepository assignments, OrgMemberRepository members, UserRepository users, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.tasks = tasks;
        this.events = events;
        this.consultants = consultants;
        this.clients = clients;
        this.assignments = assignments;
        this.members = members;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- the page ------------------------------------------------------------------------------------------------------

    /** The whole board in one call: four KPI tiles, the tab counts, one page of the filtered list, the Upcoming Deadlines and the form options. */
    @Transactional(readOnly = true)
    public View view(OrgMembership me, Query query) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        List<MktTask> all = load(v, now);
        Query q = query == null ? new Query(Tab.ALL, null, null, null, null, null, null, 0, DEFAULT_SIZE, null) : query;
        Tab tab = q.tab() == null ? Tab.ALL : q.tab();
        List<MktTask> rows = all.stream().filter(inTab(tab, v.memberId(), now)).filter(filters(q, v.memberId(), now)).toList();
        int size = clampSize(q.size());
        int page = Math.max(0, q.page());
        Map<Long, ConsultantProfile> consultantsById = new HashMap<>();
        Map<Long, String> clientNames = clientNames(v.orgId());
        Map<Long, String> ownerNames = memberNames(v.orgId(), all.stream().map(MktTask::getOwnerMemberId).collect(Collectors.toSet()));
        for (ConsultantProfile c : consultantsOf(v.orgId(), all)) consultantsById.put(c.getId(), c);
        List<MktTask> sorted = sorted(rows, q.sort(), tab, consultantsById, ownerNames);
        int from = Math.min(sorted.size(), page * size);
        int to = Math.min(sorted.size(), from + size);
        Page list = new Page(sorted.subList(from, to).stream().map(t -> row(t, v.memberId(), now, consultantsById, clientNames, ownerNames)).toList(), sorted.size(), page, size);
        List<Row> upcoming = all.stream().filter(t -> t.isOpen() && !t.getDueAt().isBefore(now)).limit(UPCOMING)
            .map(t -> row(t, v.memberId(), now, consultantsById, clientNames, ownerNames)).toList();
        return new View(now, v.all(), kpis(all, now), tabs(all, v.memberId(), now), list, upcoming, options(v, all, ownerNames));
    }

    /** The Calendar card: the days of {@code month} (yyyy-MM, default the current month) that have tasks, with the top priority of each. */
    @Transactional(readOnly = true)
    public Calendar calendar(OrgMembership me, String month) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        YearMonth ym = parseMonth(month, clock.instant());
        Instant from = ym.atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Instant to = ym.plusMonths(1).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        Map<LocalDate, List<MktTask>> byDay = new TreeMap<>();
        for (MktTask t : tasks.findVisibleDueBetween(v.orgId(), v.all(), ids(v), v.memberId(), from, to)) {
            byDay.computeIfAbsent(LocalDate.ofInstant(t.getDueAt(), ZoneOffset.UTC), d -> new ArrayList<>()).add(t);
        }
        List<CalendarDay> days = new ArrayList<>();
        byDay.forEach((d, list) -> {
            String top = list.stream().map(MktTask::getPriority).min(Comparator.comparingInt(MktTask.PRIORITIES::indexOf)).orElse("MEDIUM");
            days.add(new CalendarDay(d.toString(), list.size(), (int) list.stream().filter(MktTask::isOpen).count(), top));
        });
        return new Calendar(ym.toString(), days);
    }

    /** Who this task can be handed to: the marketer and backup of its consultant (or any marketer for a task about no consultant), never the current owner. */
    @Transactional(readOnly = true)
    public List<Option> assignees(OrgMembership me, Long id) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        Set<Long> ids = eligibleOwners(v.orgId(), t.getConsultantId());
        ids.remove(t.getOwnerMemberId());
        Map<Long, String> names = memberNames(v.orgId(), ids);
        return ids.stream().map(i -> new Option(i, names.getOrDefault(i, "Member " + i))).sorted(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER)).toList();
    }

    // ---- writes (record only; 404 outside the reach) -------------------------------------------------------------------

    @Transactional
    public ActionResult create(OrgMembership me, CreateRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Long orgId = v.orgId();
        String title = text("title", req.title(), 160, true);
        String detail = text("detail", req.detail(), 200, false);
        String label = text("relatedLabel", req.relatedLabel(), 120, false);
        String category = oneOf("category", req.category(), MktTask.CATEGORIES, "FOLLOW_UP");
        String priority = oneOf("priority", req.priority(), MktTask.PRIORITIES, "MEDIUM");
        String status = oneOf("status", req.status(), MktTask.STATUSES, MktTask.NOT_STARTED);
        ConsultantProfile consultant = null;
        if (req.consultantId() != null) {
            scope.require(v, req.consultantId());
            consultant = consultants.findByOrgIdAndIdIn(orgId, List.of(req.consultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        }
        ClientAccount client = null;
        if (req.clientAccountId() != null) client = clients.findByOrgIdAndId(orgId, req.clientAccountId()).orElseThrow(OrgNotFoundException::new);
        Long owner = req.ownerMemberId() == null ? me.memberId() : req.ownerMemberId();
        if (!owner.equals(me.memberId()) && !eligibleOwners(orgId, req.consultantId()).contains(owner)) throw new OrgNotFoundException();
        Instant now = clock.instant();
        MktTask t = new MktTask();
        t.setOrgId(orgId);
        t.setConsultantId(consultant == null ? null : consultant.getId());
        t.setClientAccountId(client == null ? null : client.getId());
        t.setRelatedLabel(label);
        t.setTitle(title);
        t.setDetail(detail != null ? detail : consultant != null ? consultant.getDisplayName() + (consultant.getJobTitle() == null ? "" : " - " + consultant.getJobTitle()) : null);
        t.setCategory(category);
        t.setPriority(priority);
        t.setStatus(status);
        t.setDueAt(req.dueAt());
        t.setCompletedAt(MktTask.COMPLETED.equals(status) ? now : null);
        t.setOwnerMemberId(owner);
        t.setCreatedByMemberId(me.memberId());
        t.setCreatedAt(now);
        t.setUpdatedAt(now);
        tasks.save(t);
        event(t, MktTaskEvent.CREATED, null, me, now);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(t.getId()), "category=" + category + " priority=" + priority + (consultant == null ? "" : " consultant=" + consultant.getId()));
        return result(v, t, MktTaskEvent.CREATED, now);
    }

    /** Changes only the fields that are sent. Completing stamps {@code completed_at}; moving a completed task to another status clears it. */
    @Transactional
    public ActionResult update(OrgMembership me, Long id, UpdateRequest req) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        Instant now = clock.instant();
        List<String> changed = new ArrayList<>();
        if (req.title() != null) {
            t.setTitle(text("title", req.title(), 160, true));
            changed.add("title");
        }
        if (req.detail() != null) {
            t.setDetail(text("detail", req.detail(), 200, false));
            changed.add("detail");
        }
        if (req.relatedLabel() != null) {
            t.setRelatedLabel(text("relatedLabel", req.relatedLabel(), 120, false));
            changed.add("relatedLabel");
        }
        if (req.category() != null) {
            t.setCategory(oneOf("category", req.category(), MktTask.CATEGORIES, null));
            changed.add("category");
        }
        if (req.priority() != null) {
            t.setPriority(oneOf("priority", req.priority(), MktTask.PRIORITIES, null));
            changed.add("priority");
        }
        if (req.dueAt() != null) {
            t.setDueAt(req.dueAt());
            changed.add("dueAt");
        }
        String kind = MktTaskEvent.UPDATED;
        if (req.status() != null) {
            String next = oneOf("status", req.status(), MktTask.STATUSES, null);
            if (!next.equals(t.getStatus())) {
                boolean wasOpen = t.isOpen();
                t.setStatus(next);
                t.setCompletedAt(MktTask.COMPLETED.equals(next) ? now : null);
                changed.add("status");
                if (MktTask.COMPLETED.equals(next)) kind = MktTaskEvent.COMPLETED;
                else if (!wasOpen) kind = MktTaskEvent.REOPENED;
            }
        }
        if (!changed.isEmpty()) {
            t.setUpdatedAt(now);
            tasks.save(t);
            event(t, kind, String.join(", ", changed), me, now);
            audit.record(me, AUDIT_UPDATE, TARGET, null, String.valueOf(t.getId()), "changed " + String.join(", ", changed));
        }
        return result(v, t, kind, now);
    }

    @Transactional
    public ActionResult complete(OrgMembership me, Long id) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        Instant now = clock.instant();
        if (t.isOpen()) {
            t.setStatus(MktTask.COMPLETED);
            t.setCompletedAt(now);
            t.setUpdatedAt(now);
            tasks.save(t);
            event(t, MktTaskEvent.COMPLETED, null, me, now);
            audit.record(me, AUDIT_COMPLETE, TARGET, null, String.valueOf(t.getId()), "completed");
        }
        return result(v, t, MktTaskEvent.COMPLETED, now);
    }

    /** A completed task goes back to PENDING (open again, completion time cleared). */
    @Transactional
    public ActionResult reopen(OrgMembership me, Long id) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        Instant now = clock.instant();
        if (!t.isOpen()) {
            t.setStatus(MktTask.PENDING);
            t.setCompletedAt(null);
            t.setUpdatedAt(now);
            tasks.save(t);
            event(t, MktTaskEvent.REOPENED, null, me, now);
            audit.record(me, AUDIT_REOPEN, TARGET, null, String.valueOf(t.getId()), "reopened");
        }
        return result(v, t, MktTaskEvent.REOPENED, now);
    }

    /** Hands the task to another marketer who can see its consultant (any marketer when it has none). Anyone else is the generic 404. */
    @Transactional
    public ActionResult reassign(OrgMembership me, Long id, Long newOwner) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        if (!newOwner.equals(t.getOwnerMemberId())) {
            if (!eligibleOwners(v.orgId(), t.getConsultantId()).contains(newOwner)) throw new OrgNotFoundException();
            Instant now = clock.instant();
            Long previous = t.getOwnerMemberId();
            t.setOwnerMemberId(newOwner);
            t.setUpdatedAt(now);
            tasks.save(t);
            event(t, MktTaskEvent.REASSIGNED, "member " + previous + " -> member " + newOwner, me, now);
            audit.record(me, AUDIT_REASSIGN, TARGET, null, String.valueOf(t.getId()), "owner " + previous + " -> " + newOwner);
        }
        return result(v, t, MktTaskEvent.REASSIGNED, clock.instant());
    }

    /** Deletes a task the caller owns and that is still open. Someone else's task is the generic 404; a completed one is refused (it is history). */
    @Transactional
    public ActionResult delete(OrgMembership me, Long id) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        MktTask t = visible(v, id);
        if (!t.getOwnerMemberId().equals(me.memberId())) throw new OrgNotFoundException();
        if (!t.isOpen()) throw OrgException.invalid("task", "only an open task can be deleted");
        events.deleteByOrgIdAndTaskId(v.orgId(), t.getId());
        tasks.deleteByOrgIdAndId(v.orgId(), t.getId());
        audit.record(me, AUDIT_DELETE, TARGET, null, String.valueOf(t.getId()), "deleted an open task");
        return new ActionResult(null, "DELETED", false);
    }

    // ---- reach ---------------------------------------------------------------------------------------------------------

    private MktTask visible(MktScope.View v, Long id) {
        MktTask t = tasks.findByOrgIdAndId(v.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!v.all() && !t.getOwnerMemberId().equals(v.memberId())) throw new OrgNotFoundException();
        if (t.getConsultantId() != null) scope.require(v, t.getConsultantId());
        return t;
    }

    /** Members a task about {@code consultantId} may be given to: that consultant's marketer and backup; for no consultant, every marketer that has assignments. */
    private Set<Long> eligibleOwners(Long orgId, Long consultantId) {
        Set<Long> ids = new LinkedHashSet<>();
        if (consultantId != null) {
            assignments.findByOrgIdAndConsultantId(orgId, consultantId).ifPresent(a -> {
                if (a.getMarketerMemberId() != null) ids.add(a.getMarketerMemberId());
                if (a.getBackupMemberId() != null) ids.add(a.getBackupMemberId());
            });
        } else {
            for (MarketerAssignment a : assignments.findByOrgId(orgId)) if (a.getMarketerMemberId() != null) ids.add(a.getMarketerMemberId());
        }
        return ids;
    }

    private List<MktTask> load(MktScope.View v, Instant now) {
        return tasks.findVisibleOpenOrCompletedSince(v.orgId(), v.all(), ids(v), v.memberId(), now.minus(30, ChronoUnit.DAYS));
    }

    private static Collection<Long> ids(MktScope.View v) {
        return v.all() || v.consultantIds().isEmpty() ? NO_IDS : v.consultantIds();
    }

    // ---- tabs, filters, KPIs -------------------------------------------------------------------------------------------

    private static Predicate<MktTask> inTab(Tab tab, Long me, Instant now) {
        Instant week = now.plus(7, ChronoUnit.DAYS);
        return switch (tab) {
            case ALL -> MktTask::isOpen;
            case MY -> t -> t.isOpen() && me.equals(t.getOwnerMemberId());
            case TEAM -> t -> t.isOpen() && !me.equals(t.getOwnerMemberId());
            case OVERDUE -> t -> t.isOverdueAt(now);
            case DUE_WEEK -> t -> t.isOpen() && !t.getDueAt().isBefore(now) && t.getDueAt().isBefore(week);
            case COMPLETED -> t -> !t.isOpen() && t.getCompletedAt() != null && !t.getCompletedAt().isBefore(now.minus(7, ChronoUnit.DAYS));
        };
    }

    private Predicate<MktTask> filters(Query q, Long me, Instant now) {
        Predicate<MktTask> p = t -> true;
        if (notBlank(q.category())) {
            String c = q.category().strip().toUpperCase(Locale.ROOT);
            p = p.and(t -> t.getCategory().equals(c));
        }
        if (notBlank(q.priority())) {
            String c = q.priority().strip().toUpperCase(Locale.ROOT);
            p = p.and(t -> t.getPriority().equals(c));
        }
        if (notBlank(q.status())) {
            String c = q.status().strip().toUpperCase(Locale.ROOT);
            p = p.and(t -> t.getStatus().equals(c));
        }
        if (notBlank(q.owner())) {
            Long owner = "me".equalsIgnoreCase(q.owner().strip()) ? me : parseId(q.owner());
            p = p.and(t -> owner != null && owner.equals(t.getOwnerMemberId()));
        }
        if (notBlank(q.due())) {
            Instant[] day = day(q.due());
            p = p.and(t -> day != null && !t.getDueAt().isBefore(day[0]) && t.getDueAt().isBefore(day[1]));
        }
        if (notBlank(q.q())) {
            String needle = q.q().strip().toLowerCase(Locale.ROOT);
            p = p.and(t -> contains(t.getTitle(), needle) || contains(t.getDetail(), needle) || contains(t.getRelatedLabel(), needle));
        }
        return p;
    }

    private List<Kpi> kpis(List<MktTask> all, Instant now) {
        Instant start = startOfDay(now);
        Instant weekAgo = now.minus(7, ChronoUnit.DAYS);
        Instant weekAhead = now.plus(7, ChronoUnit.DAYS);
        long total = all.stream().filter(MktTask::isOpen).count();
        long overdue = all.stream().filter(t -> t.isOverdueAt(now)).count();
        long dueWeek = countDueWeek(all, now);
        long doneWeek = countCompleted(all, weekAgo, now);
        List<Long> totalSpark = new ArrayList<>();
        List<Long> overdueSpark = new ArrayList<>();
        List<Long> dueSpark = new ArrayList<>();
        List<Long> doneSpark = new ArrayList<>();
        for (int back = 7; back >= 0; back--) {
            Instant from = start.minus(back, ChronoUnit.DAYS);
            Instant to = from.plus(1, ChronoUnit.DAYS);
            Instant at = to.isAfter(now) ? now : to;
            totalSpark.add(openAt(all, at));
            overdueSpark.add(overdueAt(all, at));
            dueSpark.add(all.stream().filter(t -> !t.getDueAt().isBefore(from) && t.getDueAt().isBefore(to)).count());
            doneSpark.add(countCompleted(all, from, to));
        }
        return List.of(
            new Kpi("total", total, pct(total, openAt(all, weekAgo)), totalSpark),
            new Kpi("overdue", overdue, pct(overdue, overdueAt(all, weekAgo)), overdueSpark),
            new Kpi("dueThisWeek", dueWeek, pct(dueWeek, all.stream().filter(t -> wasOpenAt(t, weekAgo) && !t.getDueAt().isBefore(weekAgo) && t.getDueAt().isBefore(now)).count()), dueSpark),
            new Kpi("completedThisWeek", doneWeek, pct(doneWeek, countCompleted(all, now.minus(14, ChronoUnit.DAYS), weekAgo)), doneSpark)
        );
    }

    private static long countDueWeek(List<MktTask> all, Instant now) {
        Instant week = now.plus(7, ChronoUnit.DAYS);
        return all.stream().filter(t -> t.isOpen() && !t.getDueAt().isBefore(now) && t.getDueAt().isBefore(week)).count();
    }

    private static long countCompleted(List<MktTask> all, Instant from, Instant to) {
        return all.stream().filter(t -> !t.isOpen() && t.getCompletedAt() != null && !t.getCompletedAt().isBefore(from) && t.getCompletedAt().isBefore(to)).count();
    }

    /** Created by {@code at} and not completed by then. */
    private static boolean wasOpenAt(MktTask t, Instant at) {
        return !t.getCreatedAt().isAfter(at) && (t.getCompletedAt() == null || t.getCompletedAt().isAfter(at));
    }

    private static long openAt(List<MktTask> all, Instant at) {
        return all.stream().filter(t -> wasOpenAt(t, at)).count();
    }

    private static long overdueAt(List<MktTask> all, Instant at) {
        return all.stream().filter(t -> wasOpenAt(t, at) && t.getDueAt().isBefore(at)).count();
    }

    private static Tabs tabs(List<MktTask> all, Long me, Instant now) {
        long open = all.stream().filter(MktTask::isOpen).count();
        long mine = all.stream().filter(inTab(Tab.MY, me, now)).count();
        return new Tabs(
            open, mine, open - mine, all.stream().filter(t -> t.isOverdueAt(now)).count(), countDueWeek(all, now), all.stream().filter(inTab(Tab.COMPLETED, me, now)).count()
        );
    }

    private Options options(MktScope.View v, List<MktTask> all, Map<Long, String> ownerNames) {
        List<ConsultantProfile> list = v.all() ? consultants.findTop200ByOrgIdOrderByDisplayNameAsc(v.orgId())
            : v.consultantIds().isEmpty() ? List.of() : consultants.findByOrgIdAndIdIn(v.orgId(), v.consultantIds());
        List<Option> cons = list.stream().limit(200).map(c -> new Option(c.getId(), c.getDisplayName())).toList();
        List<Option> cl = clientNames(v.orgId()).entrySet().stream().map(e -> new Option(e.getKey(), e.getValue()))
            .sorted(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER)).toList();
        Set<Long> ownerIds = all.stream().map(MktTask::getOwnerMemberId).collect(Collectors.toCollection(LinkedHashSet::new));
        ownerIds.add(v.memberId());
        Map<Long, String> names = new HashMap<>(ownerNames);
        names.putAll(memberNames(v.orgId(), ownerIds.stream().filter(i -> !names.containsKey(i)).collect(Collectors.toSet())));
        List<Option> owners = ownerIds.stream().map(i -> new Option(i, names.getOrDefault(i, "Member " + i))).sorted(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER)).toList();
        return new Options(cons, cl, owners);
    }

    // ---- rows and lookups ----------------------------------------------------------------------------------------------

    private ActionResult result(MktScope.View v, MktTask t, String event, Instant now) {
        Map<Long, ConsultantProfile> c = new HashMap<>();
        for (ConsultantProfile p : consultantsOf(v.orgId(), List.of(t))) c.put(p.getId(), p);
        return new ActionResult(row(t, v.memberId(), now, c, clientNames(v.orgId()), memberNames(v.orgId(), Set.of(t.getOwnerMemberId()))), event, false);
    }

    private Row row(MktTask t, Long me, Instant now, Map<Long, ConsultantProfile> consultantsById, Map<Long, String> clientNames, Map<Long, String> ownerNames) {
        ConsultantProfile c = t.getConsultantId() == null ? null : consultantsById.get(t.getConsultantId());
        boolean mine = me != null && me.equals(t.getOwnerMemberId());
        return new Row(
            t.getId(), t.getTitle(), t.getDetail(), t.getCategory(), t.getPriority(), t.getStatus(), t.isOverdueAt(now), t.getDueAt(), t.getCompletedAt(),
            t.getConsultantId(), c == null ? null : c.getDisplayName(), t.getClientAccountId(), t.getClientAccountId() == null ? null : clientNames.get(t.getClientAccountId()), t.getRelatedLabel(),
            t.getOwnerMemberId(), ownerNames.getOrDefault(t.getOwnerMemberId(), ""), null, mine, mine && t.isOpen()
        );
    }

    private List<ConsultantProfile> consultantsOf(Long orgId, List<MktTask> rows) {
        Set<Long> ids = new LinkedHashSet<>();
        for (MktTask t : rows) if (t.getConsultantId() != null) ids.add(t.getConsultantId());
        return ids.isEmpty() ? List.of() : consultants.findByOrgIdAndIdIn(orgId, ids);
    }

    private Map<Long, String> clientNames(Long orgId) {
        Map<Long, String> out = new LinkedHashMap<>();
        for (ClientAccount c : clients.findByOrgId(orgId)) out.put(c.getId(), c.getName());
        return out;
    }

    private Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        Set<Long> ids = new LinkedHashSet<>();
        for (Long id : memberIds) if (id != null && id > 0) ids.add(id);
        if (ids.isEmpty()) return Map.of();
        Map<Long, Long> userOf = new HashMap<>();
        for (OrgMember m : members.findByOrgIdAndIdIn(orgId, ids)) if (m.getUserId() != null) userOf.put(m.getId(), m.getUserId());
        Map<Long, String> byUser = new HashMap<>();
        for (User u : users.findAllById(userOf.values())) {
            String full = ((u.getFirstName() == null ? "" : u.getFirstName().trim()) + " " + (u.getLastName() == null ? "" : u.getLastName().trim())).trim();
            if (!full.isEmpty()) byUser.put(u.getId(), full);
        }
        Map<Long, String> out = new HashMap<>();
        userOf.forEach((memberId, userId) -> {
            String n = byUser.get(userId);
            if (n != null) out.put(memberId, n);
        });
        return out;
    }

    private void event(MktTask t, String kind, String note, OrgMembership me, Instant at) {
        MktTaskEvent e = new MktTaskEvent();
        e.setOrgId(t.getOrgId());
        e.setTaskId(t.getId());
        e.setKind(kind);
        e.setNote(note);
        e.setOccurredAt(at);
        e.setByMemberId(me.memberId());
        events.save(e);
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------

    static Instant startOfDay(Instant now) {
        return LocalDate.ofInstant(now, ZoneOffset.UTC).atStartOfDay().toInstant(ZoneOffset.UTC);
    }

    /** Percent change, null when there is no previous value to compare to. */
    static Double pct(long current, long previous) {
        return previous <= 0 ? null : Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    private static int clampSize(int size) {
        return size <= 0 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needle);
    }

    private static Long parseId(String s) {
        try {
            return Long.parseLong(s.strip());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** {@code [start, end)} of a UTC day given as yyyy-MM-dd; null when it is not a date. */
    private static Instant[] day(String iso) {
        try {
            Instant from = LocalDate.parse(iso.strip()).atStartOfDay().toInstant(ZoneOffset.UTC);
            return new Instant[] { from, from.plus(1, ChronoUnit.DAYS) };
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static YearMonth parseMonth(String month, Instant now) {
        try {
            if (month != null && !month.isBlank()) return YearMonth.parse(month.strip());
        } catch (DateTimeParseException ignored) {
            // falls through to the current month
        }
        return YearMonth.from(now.atZone(ZoneOffset.UTC));
    }

    private List<MktTask> sorted(List<MktTask> rows, String sort, Tab tab, Map<Long, ConsultantProfile> consultantsById, Map<Long, String> ownerNames) {
        String key = "dueAt";
        boolean desc = tab == Tab.COMPLETED;
        if (sort != null && !sort.isBlank()) {
            String[] parts = sort.split(",");
            key = parts[0].strip();
            desc = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].strip());
        }
        Comparator<MktTask> cmp = switch (key) {
            case "priority" -> Comparator.comparingInt((MktTask t) -> MktTask.PRIORITIES.indexOf(t.getPriority()));
            case "title" -> Comparator.comparing(MktTask::getTitle, String.CASE_INSENSITIVE_ORDER);
            case "status" -> Comparator.comparingInt((MktTask t) -> MktTask.STATUSES.indexOf(t.getStatus()));
            case "owner" -> Comparator.comparing((MktTask t) -> ownerNames.getOrDefault(t.getOwnerMemberId(), ""), String.CASE_INSENSITIVE_ORDER);
            case "related" -> Comparator.comparing((MktTask t) -> Optional.ofNullable(t.getConsultantId()).map(consultantsById::get).map(ConsultantProfile::getDisplayName).orElse(Optional.ofNullable(t.getRelatedLabel()).orElse("")), String.CASE_INSENSITIVE_ORDER);
            default -> tab == Tab.COMPLETED && sort == null ? Comparator.comparing(MktTask::getCompletedAt, Comparator.nullsFirst(Comparator.naturalOrder())) : Comparator.comparing(MktTask::getDueAt);
        };
        List<MktTask> out = new ArrayList<>(rows);
        out.sort(desc ? cmp.reversed() : cmp);
        return out;
    }

    /** Free text: trimmed, no control characters or angle brackets, length-capped, never a sensitive identifier. */
    static String text(String field, String raw, int max, boolean required) {
        String t = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String oneOf(String field, String raw, List<String> allowed, String fallback) {
        if (raw == null || raw.isBlank()) {
            if (fallback == null) throw OrgException.invalid(field, "is required");
            return fallback;
        }
        String v = raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + String.join(", ", allowed));
        return v;
    }
}
