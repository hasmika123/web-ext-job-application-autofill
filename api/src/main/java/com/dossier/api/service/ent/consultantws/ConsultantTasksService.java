package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.consultantws.CwsSubmission;
import com.dossier.api.domain.ent.consultantws.CwsTask;
import com.dossier.api.domain.ent.consultantws.CwsTaskDetail;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgMemberDirectoryRepository;
import com.dossier.api.repository.ent.consultantws.CwsSubmissionRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskAccessRepository;
import com.dossier.api.repository.ent.consultantws.CwsTaskDetailRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.AssignedBy;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Deadline;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.FocusItem;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Insights;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.JobOption;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Reminder;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Row;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.TabCounts;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.TaskPage;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.TaskRequest;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Tile;
import com.dossier.api.service.ent.consultantws.ConsultantTasksDTO.Tiles;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace Tasks and Follow-ups page (docs/enterprise-v2/page-consultant-tasks.md). The gate is
 * {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404); every query is organization id first
 * plus the caller's own consultant id, so another consultant's task (or another tenant's) is the same 404. The tasks live in {@code cws_task},
 * the same table the Home page's Tasks card and Today's Focus read, so completing a task here shows there. Filtering, sorting and paging run here
 * (over the consultant's own rows, in memory: a consultant's task list is capped at {@link #MAX_TASKS}) and never in the browser.
 */
@Service
public class ConsultantTasksService {

    public static final int MAX_TASKS = 500;
    static final int MIN_TITLE = 3;
    static final int MAX_TITLE = 200;
    static final int DEFAULT_PAGE_SIZE = 8;
    static final int MAX_PAGE_SIZE = 50;
    static final int WEEKS = 6;
    static final int MAX_QUERY = 100;
    static final int MAX_JOB_OPTIONS = 60;

    public static final String NOT_STARTED = "NOT_STARTED";
    public static final String IN_PROGRESS = "IN_PROGRESS";
    public static final String PENDING = "PENDING";
    public static final String DONE = "DONE";
    static final Set<String> STATUSES = new LinkedHashSet<>(List.of(NOT_STARTED, IN_PROGRESS, PENDING, DONE));
    static final List<String> PRIORITY_ORDER = List.of("HIGH", "MEDIUM", "LOW");
    static final Set<String> TYPES = new LinkedHashSet<>(
        List.of("RESUME_PROFILE", "SUBMISSION_APPROVAL", "INTERVIEW_COORDINATION", "INTERVIEW_PREPARATION", "COMMUNICATION", "CLIENT_REQUIREMENTS", "AVAILABILITY", "OFFER_REVIEW", "OTHER")
    );
    static final Set<String> TABS = Set.of("ALL", "TODAY", "WEEK", "OVERDUE", "COMPLETED");
    static final Set<String> DUE_FILTERS = Set.of("ANY", "OVERDUE", "TODAY", "NEXT_7", "NEXT_30", "NO_DATE");
    static final Set<String> SORTS = Set.of("due", "title", "priority", "status", "completed");

    /** The list parameters, all optional, all validated here. */
    public record Query(String tab, String type, String priority, String assignedBy, String due, String q, String sort, String dir, Integer page, Integer size) {
        public static Query none() {
            return new Query(null, null, null, null, null, null, null, null, null, null);
        }
    }

    private final ConsultantHomeService gate;
    private final CwsTaskAccessRepository tasks;
    private final CwsTaskDetailRepository details;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final RequirementMatchRepository matches;
    private final TalentApplicationRepository applications;
    private final TalentInterviewRepository interviews;
    private final CwsSubmissionRepository submissions;
    private final OrgMemberDirectoryRepository memberDirectory;
    private final UserRepository users;
    private final Clock clock;

    @Autowired
    public ConsultantTasksService(
        ConsultantHomeService gate,
        CwsTaskAccessRepository tasks,
        CwsTaskDetailRepository details,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        TalentInterviewRepository interviews,
        CwsSubmissionRepository submissions,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users
    ) {
        this(gate, tasks, details, requirements, clients, matches, applications, interviews, submissions, memberDirectory, users, Clock.systemUTC());
    }

    ConsultantTasksService(
        ConsultantHomeService gate,
        CwsTaskAccessRepository tasks,
        CwsTaskDetailRepository details,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        TalentInterviewRepository interviews,
        CwsSubmissionRepository submissions,
        OrgMemberDirectoryRepository memberDirectory,
        UserRepository users,
        Clock clock
    ) {
        this.gate = gate;
        this.tasks = tasks;
        this.details = details;
        this.requirements = requirements;
        this.clients = clients;
        this.matches = matches;
        this.applications = applications;
        this.interviews = interviews;
        this.submissions = submissions;
        this.memberDirectory = memberDirectory;
        this.users = users;
        this.clock = clock;
    }

    // ---- the page -------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response page(OrgMembership me, Query query) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        LocalDate today = today(now);
        Params params = Params.of(query);

        List<CwsTask> all = tasks.findByOrgIdAndConsultantId(org, c.getId());
        Lookups look = lookups(org, c, all);
        List<Row> rows = all.stream().map(t -> row(t, look, today)).toList();
        TaskPage taskPage = taskPage(rows, params, today);

        List<Row> open = rows.stream().filter(r -> !DONE.equals(r.status())).toList();
        return new Response(
            org, now, today, c.getDisplayName(), tiles(all, today, now), taskPage, focus(rows, today), deadlines(open, today), insights(all, today, now),
            reminders(c, today, now), look.jobOptions, assigners(rows)
        );
    }

    /** The table only (filters, tab, sort and the pager call this). */
    @Transactional(readOnly = true)
    public TaskPage list(OrgMembership me, Query query) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        LocalDate today = today(now);
        Params params = Params.of(query);
        List<CwsTask> all = tasks.findByOrgIdAndConsultantId(c.getOrgId(), c.getId());
        Lookups look = lookups(c.getOrgId(), c, all);
        return taskPage(all.stream().map(t -> row(t, look, today)).toList(), params, today);
    }

    static LocalDate today(Instant now) {
        return now.atZone(ZoneOffset.UTC).toLocalDate();
    }

    // ---- parameters, filtering, sorting, paging -------------------------------------------------------------------

    private record Params(String tab, String type, String priority, String assignedBy, String due, String q, String sort, boolean desc, int page, int size) {
        static Params of(Query in) {
            String tab = upper(in.tab(), "ALL");
            if (!TABS.contains(tab)) throw TrackerException.invalid("tab", "is not a tab of this page");
            String type = upper(in.type(), null);
            if (type != null && !TYPES.contains(type)) throw TrackerException.invalid("type", "is not a task type");
            String priority = upper(in.priority(), null);
            if (priority != null && !PRIORITY_ORDER.contains(priority)) throw TrackerException.invalid("priority", "must be HIGH, MEDIUM or LOW");
            String due = upper(in.due(), "ANY");
            if (!DUE_FILTERS.contains(due)) throw TrackerException.invalid("due", "is not a due-date filter");
            String assignedBy = in.assignedBy() == null || in.assignedBy().isBlank() ? null : in.assignedBy().strip();
            if (assignedBy != null && assignedBy.length() > 120) throw TrackerException.invalid("assignedBy", "is too long");
            String q = in.q() == null || in.q().isBlank() ? null : in.q().strip();
            if (q != null && q.length() > MAX_QUERY) throw TrackerException.invalid("q", "must be at most " + MAX_QUERY + " characters");
            String sort = in.sort() == null || in.sort().isBlank() ? "due" : in.sort().strip().toLowerCase(Locale.ROOT);
            if (!SORTS.contains(sort)) throw TrackerException.invalid("sort", "is not a sort key");
            String dir = in.dir() == null || in.dir().isBlank() ? "asc" : in.dir().strip().toLowerCase(Locale.ROOT);
            if (!dir.equals("asc") && !dir.equals("desc")) throw TrackerException.invalid("dir", "must be asc or desc");
            int page = in.page() == null ? 0 : in.page();
            int size = in.size() == null ? DEFAULT_PAGE_SIZE : in.size();
            if (page < 0) throw TrackerException.invalid("page", "must be 0 or more");
            if (size < 1 || size > MAX_PAGE_SIZE) throw TrackerException.invalid("size", "must be between 1 and " + MAX_PAGE_SIZE);
            return new Params(tab, type, priority, assignedBy, due, q == null ? null : q.toLowerCase(Locale.ROOT), sort, dir.equals("desc"), page, size);
        }

        private static String upper(String v, String d) {
            return v == null || v.isBlank() ? d : v.strip().toUpperCase(Locale.ROOT);
        }
    }

    static boolean isOpen(Row r) {
        return !DONE.equals(r.status());
    }

    static boolean inWeek(Row r, LocalDate today) {
        return isOpen(r) && r.dueOn() != null && !r.dueOn().isBefore(today) && !r.dueOn().isAfter(today.plusDays(6));
    }

    static Predicate<Row> tabFilter(String tab, LocalDate today) {
        return switch (tab) {
            case "TODAY" -> r -> isOpen(r) && today.equals(r.dueOn());
            case "WEEK" -> r -> inWeek(r, today);
            case "OVERDUE" -> r -> isOpen(r) && r.dueOn() != null && r.dueOn().isBefore(today);
            case "COMPLETED" -> r -> DONE.equals(r.status());
            default -> r -> true;
        };
    }

    private static Predicate<Row> dueFilter(String due, LocalDate today) {
        return switch (due) {
            case "OVERDUE" -> r -> r.dueOn() != null && r.dueOn().isBefore(today);
            case "TODAY" -> r -> today.equals(r.dueOn());
            case "NEXT_7" -> r -> r.dueOn() != null && !r.dueOn().isBefore(today) && !r.dueOn().isAfter(today.plusDays(7));
            case "NEXT_30" -> r -> r.dueOn() != null && !r.dueOn().isBefore(today) && !r.dueOn().isAfter(today.plusDays(30));
            case "NO_DATE" -> r -> r.dueOn() == null;
            default -> r -> true;
        };
    }

    private TaskPage taskPage(List<Row> rows, Params p, LocalDate today) {
        TabCounts counts = new TabCounts(
            rows.size(),
            rows.stream().filter(tabFilter("TODAY", today)).count(),
            rows.stream().filter(tabFilter("WEEK", today)).count(),
            rows.stream().filter(tabFilter("OVERDUE", today)).count(),
            rows.stream().filter(tabFilter("COMPLETED", today)).count()
        );
        Predicate<Row> keep = tabFilter(p.tab(), today).and(dueFilter(p.due(), today));
        if (p.type() != null) keep = keep.and(r -> p.type().equals(r.type()));
        if (p.priority() != null) keep = keep.and(r -> p.priority().equals(r.priority()));
        if (p.assignedBy() != null) {
            keep = keep.and(r -> "SELF".equalsIgnoreCase(p.assignedBy()) ? "SELF".equals(r.assignedBy().kind()) : "MARKETER".equals(r.assignedBy().kind()) && p.assignedBy().equalsIgnoreCase(r.assignedBy().name()));
        }
        if (p.q() != null) {
            keep = keep.and(r -> contains(r.title(), p.q()) || contains(r.jobTitle(), p.q()) || contains(r.company(), p.q()) || contains(typeLabel(r.type()), p.q()));
        }
        List<Row> filtered = rows.stream().filter(keep).sorted(comparator(p.sort(), p.desc())).toList();
        int from = (int) Math.min((long) p.page() * p.size(), filtered.size());
        int to = Math.min(from + p.size(), filtered.size());
        int totalPages = (filtered.size() + p.size() - 1) / p.size();
        return new TaskPage(filtered.subList(from, to), p.page(), p.size(), filtered.size(), totalPages, counts);
    }

    private static boolean contains(String hay, String needleLower) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needleLower);
    }

    /** Human label of a type key (the search matches it; the page has the same words). */
    static String typeLabel(String type) {
        return switch (type == null ? "OTHER" : type) {
            case "RESUME_PROFILE" -> "Resume & Profile";
            case "SUBMISSION_APPROVAL" -> "Submission Approval";
            case "INTERVIEW_COORDINATION" -> "Interview Coordination";
            case "INTERVIEW_PREPARATION" -> "Interview Preparation";
            case "COMMUNICATION" -> "Communication";
            case "CLIENT_REQUIREMENTS" -> "Client Requirements";
            case "AVAILABILITY" -> "Profile & Availability";
            case "OFFER_REVIEW" -> "Offer Review";
            default -> "General";
        };
    }

    /** A due date sorts by day with undated tasks always last; every other key falls back to due date, priority, title and id so the order never jumps. */
    static Comparator<Row> comparator(String sort, boolean desc) {
        Comparator<Row> tie = Comparator.comparing((Row r) -> r.dueOn(), Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(r -> prio(r.priority()))
            .thenComparing(Row::title, String.CASE_INSENSITIVE_ORDER)
            .thenComparingLong(Row::id);
        Comparator<Row> main = switch (sort) {
            case "title" -> Comparator.comparing(Row::title, String.CASE_INSENSITIVE_ORDER);
            case "priority" -> Comparator.comparingInt((Row r) -> prio(r.priority()));
            case "status" -> Comparator.comparingInt((Row r) -> STATUS_ORDER.indexOf(r.status()));
            case "completed" -> Comparator.comparing((Row r) -> r.completedAt(), Comparator.nullsLast(Comparator.naturalOrder()));
            default -> Comparator.comparing((Row r) -> r.dueOn(), Comparator.nullsLast(Comparator.naturalOrder()));
        };
        if (desc) {
            if ("due".equals(sort) || "completed".equals(sort)) {
                // keep undated / never-completed rows last when reversing
                Comparator<Row> key = "due".equals(sort) ? Comparator.comparing((Row r) -> r.dueOn(), Comparator.nullsLast(Comparator.<LocalDate>reverseOrder())) : Comparator.comparing((Row r) -> r.completedAt(), Comparator.nullsLast(Comparator.<Instant>reverseOrder()));
                return key.thenComparing(tie);
            }
            main = main.reversed();
        }
        return main.thenComparing(tie);
    }

    private static final List<String> STATUS_ORDER = List.of(NOT_STARTED, IN_PROGRESS, PENDING, DONE);

    private static int prio(String p) {
        int i = PRIORITY_ORDER.indexOf(p);
        return i < 0 ? PRIORITY_ORDER.size() : i;
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------

    /**
     * Total: all of the consultant's tasks; Due Today / Upcoming (due in the next six days) / Overdue: open tasks by due date. Each delta compares the
     * value now with how many of those same tasks already existed a week ago (created_at); no delta when that earlier count is 0.
     * Completed This Week: tasks completed in the last 7 days, against the 7 days before (completed_at); no delta when that is 0.
     */
    static Tiles tiles(List<CwsTask> all, LocalDate today, Instant now) {
        List<CwsTask> open = all.stream().filter(t -> !DONE.equals(t.getStatus())).toList();
        List<CwsTask> dueToday = open.stream().filter(t -> today.equals(t.getDueOn())).toList();
        List<CwsTask> upcoming = open.stream().filter(t -> t.getDueOn() != null && t.getDueOn().isAfter(today) && !t.getDueOn().isAfter(today.plusDays(6))).toList();
        List<CwsTask> overdue = open.stream().filter(t -> t.getDueOn() != null && t.getDueOn().isBefore(today)).toList();
        return new Tiles(
            createdTile(all, now),
            createdTile(dueToday, now),
            createdTile(upcoming, now),
            createdTile(overdue, now),
            completedTile(all, now)
        );
    }

    private static Tile createdTile(List<CwsTask> set, Instant now) {
        List<Instant> stamps = set.stream().map(CwsTask::getCreatedAt).toList();
        Instant weekAgo = now.minus(Duration.ofDays(7));
        long previous = stamps.stream().filter(t -> t != null && t.isBefore(weekAgo)).count();
        Double delta = previous == 0 ? null : Math.round(((set.size() - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) {
            Instant at = now.minus(Duration.ofDays(7L * w));
            spark.add(stamps.stream().filter(t -> t != null && !t.isAfter(at)).count());
        }
        return new Tile(set.size(), previous, delta, spark);
    }

    static long completedBetween(List<CwsTask> all, Instant from, Instant to) {
        return all.stream().filter(t -> DONE.equals(t.getStatus()) && t.getCompletedAt() != null && t.getCompletedAt().isAfter(from) && !t.getCompletedAt().isAfter(to)).count();
    }

    private static Tile completedTile(List<CwsTask> all, Instant now) {
        long value = completedBetween(all, now.minus(Duration.ofDays(7)), now);
        long previous = completedBetween(all, now.minus(Duration.ofDays(14)), now.minus(Duration.ofDays(7)));
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) spark.add(completedBetween(all, now.minus(Duration.ofDays(7L * (w + 1))), now.minus(Duration.ofDays(7L * w))));
        return new Tile(value, previous, delta, spark);
    }

    // ---- the bottom row -------------------------------------------------------------------------------------------

    /** Tasks due today (done or not) plus open tasks already overdue, soonest first, at most six; checking one marks it done. */
    static List<FocusItem> focus(List<Row> rows, LocalDate today) {
        return rows.stream()
            .filter(r -> today.equals(r.dueOn()) || (isOpen(r) && r.dueOn() != null && r.dueOn().isBefore(today)))
            .sorted(Comparator.comparing((Row r) -> DONE.equals(r.status()) ? 0 : 1).thenComparing(Row::dueOn).thenComparingInt(r -> prio(r.priority())).thenComparingLong(Row::id))
            .limit(6)
            .map(r -> new FocusItem(r.id(), r.title(), r.status(), DONE.equals(r.status())))
            .toList();
    }

    static List<Deadline> deadlines(List<Row> open, LocalDate today) {
        return open.stream()
            .filter(r -> r.dueOn() != null && !r.dueOn().isBefore(today))
            .sorted(Comparator.comparing(Row::dueOn).thenComparingInt(r -> prio(r.priority())).thenComparingLong(Row::id))
            .limit(4)
            .map(r -> new Deadline(r.id(), r.title(), r.jobTitle(), r.company(), r.dueOn(), r.priority()))
            .toList();
    }

    /** Every task is in exactly one bucket (done, overdue, in progress or pending, not started), so the four counts add up to the total. */
    static Insights insights(List<CwsTask> all, LocalDate today, Instant now) {
        long completed = all.stream().filter(t -> DONE.equals(t.getStatus())).count();
        long overdue = all.stream().filter(t -> !DONE.equals(t.getStatus()) && t.getDueOn() != null && t.getDueOn().isBefore(today)).count();
        long inProgress = all.stream().filter(t -> (IN_PROGRESS.equals(t.getStatus()) || PENDING.equals(t.getStatus())) && !(t.getDueOn() != null && t.getDueOn().isBefore(today))).count();
        long notStarted = all.stream().filter(t -> NOT_STARTED.equals(t.getStatus()) && !(t.getDueOn() != null && t.getDueOn().isBefore(today))).count();
        int pct = all.isEmpty() ? 0 : (int) Math.round(completed * 100.0 / all.size());
        long thisWeek = completedBetween(all, now.minus(Duration.ofDays(7)), now);
        long lastWeek = completedBetween(all, now.minus(Duration.ofDays(14)), now.minus(Duration.ofDays(7)));
        String note = null;
        if (thisWeek > 0 && lastWeek == 0) note = "You've completed " + thisWeek + " task" + (thisWeek == 1 ? "" : "s") + " this week.";
        else if (thisWeek > lastWeek) note = "You've completed " + Math.round((thisWeek - lastWeek) * 100.0 / lastWeek) + "% more tasks than last week.";
        return new Insights(all.size(), completed, inProgress, notStarted, overdue, pct, thisWeek, lastWeek, note);
    }

    private static List<String> assigners(List<Row> rows) {
        return rows.stream().filter(r -> "MARKETER".equals(r.assignedBy().kind()) && r.assignedBy().name() != null).map(r -> r.assignedBy().name()).distinct().sorted().toList();
    }

    /** Derived from the consultant's own rows: scheduled interviews in the next week, submissions waiting for approval, applications whose next action is due. */
    private List<Reminder> reminders(ConsultantProfile c, LocalDate today, Instant now) {
        Long org = c.getOrgId();
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        List<Reminder> out = new ArrayList<>();
        for (TalentInterview i : interviews.findByOrgIdAndConsultantIdAndStatusAndScheduledAtAfterOrderByScheduledAtAsc(org, c.getId(), "SCHEDULED", now)) {
            if (out.size() >= 2 || i.getScheduledAt().isAfter(now.plus(Duration.ofDays(7)))) break;
            ClientAccount cl = i.getClientId() == null ? null : clientById.get(i.getClientId());
            out.add(new Reminder("INTERVIEW", cl == null ? "Upcoming interview" : "Interview with " + cl.getName(), i.getRoundLabel(), i.getScheduledAt(), "/w/consultant/interviews"));
        }
        List<CwsSubmission> pending = submissions.findByOrgIdAndConsultantIdAndStatusOrderByDueAtAscIdAsc(org, c.getId(), CwsSubmission.PENDING);
        if (!pending.isEmpty()) {
            Map<Long, ClientRequirement> reqs = requirementsById(org, pending.stream().map(CwsSubmission::getRequirementId).toList());
            for (CwsSubmission s : pending.stream().limit(2).toList()) {
                ClientRequirement r = reqs.get(s.getRequirementId());
                ClientAccount cl = r == null || r.getClientId() == null ? null : clientById.get(r.getClientId());
                String sub = r == null ? null : (cl == null ? r.getTitle() : cl.getName() + " - " + r.getTitle());
                out.add(new Reminder("SUBMISSION", "Submission approval pending", sub, s.getDueAt(), "/w/consultant/submissions"));
            }
        }
        List<TalentApplication> followUps = applications.findByOrgIdAndConsultantId(org, c.getId()).stream()
            .filter(a -> !"CLOSED".equals(a.getStage()) && a.getNextActionDue() != null && !a.getNextActionDue().isAfter(today))
            .sorted(Comparator.comparing(TalentApplication::getNextActionDue))
            .limit(2)
            .toList();
        if (!followUps.isEmpty()) {
            Map<Long, ClientRequirement> reqs = requirementsById(org, followUps.stream().map(TalentApplication::getRequirementId).toList());
            for (TalentApplication a : followUps) {
                ClientRequirement r = reqs.get(a.getRequirementId());
                ClientAccount cl = a.getClientId() == null ? null : clientById.get(a.getClientId());
                String sub = r == null ? null : (cl == null ? r.getTitle() : cl.getName() + " - " + r.getTitle());
                out.add(new Reminder("FOLLOW_UP", "Follow up on your application", sub, a.getNextActionDue().atStartOfDay().toInstant(ZoneOffset.UTC), "/w/consultant/applications"));
            }
        }
        return out.stream().limit(5).toList();
    }

    private Map<Long, ClientRequirement> requirementsById(Long org, List<Long> ids) {
        List<Long> distinct = ids.stream().filter(Objects::nonNull).distinct().toList();
        if (distinct.isEmpty()) return Map.of();
        return requirements.findAllById(distinct).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
    }

    // ---- writes ---------------------------------------------------------------------------------------------------

    /** Creates a task for the signed-in consultant (own row only, no extra permission). */
    @Transactional
    public Row create(OrgMembership me, TaskRequest req) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        Valid v = validate(req, org, c, today(now));
        if (tasks.findByOrgIdAndConsultantId(org, c.getId()).size() >= MAX_TASKS) throw TrackerException.invalid("tasks", "You can keep up to " + MAX_TASKS + " tasks. Delete a few first.");
        CwsTask t = new CwsTask();
        t.setOrgId(org);
        t.setConsultantId(c.getId());
        t.setStatus(NOT_STARTED);
        t.setCreatedAt(now);
        apply(t, v, now);
        t = tasks.saveAndFlush(t);
        CwsTaskDetail d = new CwsTaskDetail();
        d.setOrgId(org);
        d.setConsultantId(c.getId());
        d.setTaskId(t.getId());
        d.setCreatedAt(now);
        applyDetail(d, v, now);
        details.saveAndFlush(d);
        return oneRow(c, t, today(now));
    }

    /** Replaces the editable fields (title, due date, priority, type, linked job) of one of the caller's own tasks. */
    @Transactional
    public Row update(OrgMembership me, long id, TaskRequest req) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        CwsTask t = own(org, c.getId(), id);
        Valid v = validate(req, org, c, today(now));
        apply(t, v, now);
        tasks.saveAndFlush(t);
        CwsTaskDetail d = details.findByOrgIdAndTaskId(org, t.getId()).orElseGet(() -> {
            CwsTaskDetail n = new CwsTaskDetail();
            n.setOrgId(org);
            n.setConsultantId(c.getId());
            n.setTaskId(t.getId());
            n.setCreatedAt(now);
            return n;
        });
        applyDetail(d, v, now);
        details.saveAndFlush(d);
        return oneRow(c, t, today(now));
    }

    /** Moves a task to NOT_STARTED, IN_PROGRESS, PENDING or DONE. DONE stamps completed_at (kept if already done); any other status clears it. Idempotent. */
    @Transactional
    public Row setStatus(OrgMembership me, long id, String status) {
        ConsultantProfile c = gate.requireSelf(me);
        Instant now = Instant.now(clock);
        String st = status == null ? "" : status.strip().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(st)) throw TrackerException.invalid("status", "must be NOT_STARTED, IN_PROGRESS, PENDING or DONE");
        CwsTask t = own(c.getOrgId(), c.getId(), id);
        if (!st.equals(t.getStatus())) {
            t.setStatus(st);
            t.setUpdatedAt(now);
        }
        if (DONE.equals(st)) {
            if (t.getCompletedAt() == null) t.setCompletedAt(now);
        } else {
            t.setCompletedAt(null);
        }
        tasks.saveAndFlush(t);
        return oneRow(c, t, today(now));
    }

    /** Deletes one of the caller's own tasks (its detail row goes with it). The page's undo window is client-side: it sends this call only when the window ends. */
    @Transactional
    public void delete(OrgMembership me, long id) {
        ConsultantProfile c = gate.requireSelf(me);
        CwsTask t = own(c.getOrgId(), c.getId(), id);
        details.findByOrgIdAndTaskId(c.getOrgId(), t.getId()).ifPresent(details::delete);
        details.flush();
        tasks.delete(t);
        tasks.flush();
    }

    private record Valid(String title, LocalDate dueOn, String priority, String type, Long requirementId) {}

    private Valid validate(TaskRequest req, Long org, ConsultantProfile c, LocalDate today) {
        if (req == null) throw TrackerException.invalid("title", "is required");
        String title = req.title() == null ? "" : req.title().strip();
        if (title.length() < MIN_TITLE || title.length() > MAX_TITLE) throw TrackerException.invalid("title", "must be " + MIN_TITLE + " to " + MAX_TITLE + " characters");
        SensitiveContent.check("title", "title", title);
        LocalDate due = null;
        if (req.dueOn() != null && !req.dueOn().isBlank()) {
            try {
                due = LocalDate.parse(req.dueOn().strip());
            } catch (DateTimeException e) {
                throw TrackerException.invalid("dueOn", "must be a date like 2026-11-30");
            }
            if (due.isBefore(today.minusDays(365)) || due.isAfter(today.plusYears(10))) throw TrackerException.invalid("dueOn", "is out of range");
        }
        String priority = req.priority() == null || req.priority().isBlank() ? "MEDIUM" : req.priority().strip().toUpperCase(Locale.ROOT);
        if (!PRIORITY_ORDER.contains(priority)) throw TrackerException.invalid("priority", "must be HIGH, MEDIUM or LOW");
        String type = req.type() == null || req.type().isBlank() ? "OTHER" : req.type().strip().toUpperCase(Locale.ROOT);
        if (!TYPES.contains(type)) throw TrackerException.invalid("type", "is not a task type");
        Long reqId = req.requirementId();
        if (reqId != null && !linkableIds(org, c).contains(reqId)) throw new OrgNotFoundException(); // unknown, another tenant's, or not one of the caller's jobs
        return new Valid(title, due, priority, type, reqId);
    }

    private static void apply(CwsTask t, Valid v, Instant now) {
        t.setTitle(v.title());
        t.setDueOn(v.dueOn());
        t.setPriority(v.priority());
        t.setUpdatedAt(now);
    }

    private static void applyDetail(CwsTaskDetail d, Valid v, Instant now) {
        d.setTaskType(v.type());
        d.setRequirementId(v.requirementId());
        d.setUpdatedAt(now);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    private CwsTask own(Long org, Long consultantId, long id) {
        return tasks.findByOrgIdAndConsultantIdAndId(org, consultantId, id).orElseThrow(OrgNotFoundException::new);
    }

    /** The jobs a task may link to: the caller's own matches and applications, in this organization only. */
    private Set<Long> linkableIds(Long org, ConsultantProfile c) {
        Set<Long> ids = new LinkedHashSet<>();
        for (RequirementMatch m : matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId())) ids.add(m.getRequirementId());
        for (TalentApplication a : applications.findByOrgIdAndConsultantId(org, c.getId())) ids.add(a.getRequirementId());
        ids.remove(null);
        return ids;
    }

    private Row oneRow(ConsultantProfile c, CwsTask t, LocalDate today) {
        return row(t, lookups(c.getOrgId(), c, List.of(t)), today);
    }

    private record Lookups(
        Map<Long, CwsTaskDetail> detailByTask,
        Map<Long, ClientRequirement> reqs,
        Map<Long, ClientAccount> clients,
        Map<Long, String> marketers,
        String selfName,
        List<JobOption> jobOptions
    ) {}

    private Lookups lookups(Long org, ConsultantProfile c, List<CwsTask> rows) {
        Map<Long, CwsTaskDetail> detailByTask = new HashMap<>();
        for (CwsTaskDetail d : details.findByOrgIdAndConsultantId(org, c.getId())) detailByTask.put(d.getTaskId(), d);
        Set<Long> reqIds = new LinkedHashSet<>();
        for (CwsTask t : rows) {
            CwsTaskDetail d = detailByTask.get(t.getId());
            if (d != null && d.getRequirementId() != null) reqIds.add(d.getRequirementId());
        }
        List<Long> linkable = new ArrayList<>(linkableIds(org, c));
        if (linkable.size() > MAX_JOB_OPTIONS) linkable = linkable.subList(0, MAX_JOB_OPTIONS);
        Set<Long> want = new LinkedHashSet<>(reqIds);
        want.addAll(linkable);
        Map<Long, ClientRequirement> reqs = requirementsById(org, new ArrayList<>(want));
        Map<Long, ClientAccount> clientById = clients.findByOrgId(org).stream().collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        Map<Long, String> marketers = new LinkedHashMap<>();
        List<Long> marketerIds = detailByTask.values().stream().map(CwsTaskDetail::getAssignedByMemberId).filter(Objects::nonNull).distinct().toList();
        if (!marketerIds.isEmpty()) {
            for (OrgMember seat : memberDirectory.findByOrgIdAndIdIn(org, marketerIds)) {
                User u = seat.getUserId() == null ? null : users.findById(seat.getUserId()).orElse(null);
                marketers.put(seat.getId(), ConsultantMarketerService.personName(u, seat));
            }
        }
        List<JobOption> options = linkable.stream()
            .map(reqs::get)
            .filter(Objects::nonNull)
            .map(r -> new JobOption(r.getId(), r.getTitle(), r.getClientId() == null || clientById.get(r.getClientId()) == null ? null : clientById.get(r.getClientId()).getName()))
            .toList();
        return new Lookups(detailByTask, reqs, clientById, marketers, c.getDisplayName(), options);
    }

    private Row row(CwsTask t, Lookups look, LocalDate today) {
        CwsTaskDetail d = look.detailByTask.get(t.getId());
        ClientRequirement r = d == null || d.getRequirementId() == null ? null : look.reqs.get(d.getRequirementId());
        ClientAccount cl = r == null || r.getClientId() == null ? null : look.clients.get(r.getClientId());
        boolean open = !DONE.equals(t.getStatus());
        boolean overdue = open && t.getDueOn() != null && t.getDueOn().isBefore(today);
        boolean dueToday = open && today.equals(t.getDueOn());
        AssignedBy by;
        if (d != null && d.getAssignedByMemberId() != null && look.marketers.containsKey(d.getAssignedByMemberId())) by = new AssignedBy("MARKETER", look.marketers.get(d.getAssignedByMemberId()), d.isSampleData());
        else if (d != null && d.getAssignedByLabel() != null && !d.getAssignedByLabel().isBlank()) by = new AssignedBy("MARKETER", d.getAssignedByLabel(), d.isSampleData());
        else by = new AssignedBy("SELF", look.selfName, false);
        return new Row(
            t.getId(), t.getTitle(), d == null ? "OTHER" : d.getTaskType(), r == null ? null : r.getId(), r == null ? null : r.getTitle(), cl == null ? null : cl.getName(),
            t.getPriority(), t.getStatus(), t.getDueOn(), overdue, dueToday, by, t.getCompletedAt(), t.getCreatedAt()
        );
    }
}
