package com.dossier.api.service.ent.interviews;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.domain.ent.talent.TalentInterviewEvent;
import com.dossier.api.domain.ent.talent.TalentInterviewFeedback;
import com.dossier.api.domain.ent.talent.TalentInterviewInterviewer;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewEventRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewFeedbackRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewInterviewerRepository;
import com.dossier.api.repository.ent.talent.TalentInterviewRepository;
import com.dossier.api.service.dto.ent.InterviewDTO;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.applications.EntChangeActors;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.time.format.TextStyle;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Interviews board (docs/enterprise-v2/page-interviews.md): the server-driven table, the KPI tiles with honest deltas
 * rebuilt from the interview history, the filters, the pipeline columns, the analytics and the detail drawer. Reading needs
 * {@code pipeline.view}; the scope it is held at decides the rows. Whatever is out of reach is the same generic 404 as another tenant's row.
 */
@Service("entInterviewQueryService")
@Transactional(readOnly = true)
public class InterviewQueryService {

    static final int SEARCH_MIN = 2;
    static final int SEARCH_MAX = 80;
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    static final int SERIES_POINTS = 8;
    static final int PIPELINE_CARDS = 20;
    static final int MONTH_DAYS = 30;
    static final int ANALYTICS_MONTHS = 6;
    static final int PICKER_MAX = 20;
    private static final Pattern JOB_CODE = Pattern.compile("^job-(\\d{4,12})$");
    private static final Pattern INT_CODE = Pattern.compile("^int-(\\d{4,12})$");

    static final String FROM =
        " from TalentInterview i join ConsultantProfile c on c.orgId = i.orgId and c.id = i.consultantId" +
        " join ClientAccount cl on cl.orgId = i.orgId and cl.id = i.clientId" +
        " left join TalentApplication a on a.orgId = i.orgId and a.id = i.applicationId" +
        " left join ClientRequirement r on r.orgId = a.orgId and r.id = a.requirementId where i.orgId = :orgId";

    private static final String SCOPE_CLAUSE =
        "(i.applicationId in (select ap.id from TalentApplication ap where ap.orgId = :orgId and ap.marketerMemberId in :scope)" +
        " or i.consultantId in (select ma.consultantId from MarketerAssignment ma where ma.orgId = :orgId and ma.marketerMemberId in :scope))";

    public record ListQuery(
        String q, List<String> status, Long clientId, Long consultantId, String round, String mode, LocalDate from, LocalDate to, List<String> sort, Integer page, Integer size
    ) {}

    private final EntityManager em;
    private final InterviewAccess access;
    private final ApplicationNames names;
    private final InterviewSettings settings;
    private final TalentInterviewRepository interviews;
    private final TalentInterviewInterviewerRepository interviewers;
    private final TalentInterviewEventRepository events;
    private final TalentInterviewFeedbackRepository feedback;
    private final TalentApplicationRepository applications;
    private final ClientRequirementRepository requirements;
    private final ConsultantProfileRepository consultants;
    private final ClientAccountRepository clients;
    private final MarketerAssignmentRepository assignments;
    private final OrgResumeRepository resumes;
    private final EntChangeActors changeActors;
    private final Clock clock;

    @Autowired
    public InterviewQueryService(
        EntityManager em,
        InterviewAccess access,
        ApplicationNames names,
        InterviewSettings settings,
        TalentInterviewRepository interviews,
        TalentInterviewInterviewerRepository interviewers,
        TalentInterviewEventRepository events,
        TalentInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerAssignmentRepository assignments,
        OrgResumeRepository resumes,
        EntChangeActors changeActors
    ) {
        this(em, access, names, settings, interviews, interviewers, events, feedback, applications, requirements, consultants, clients, assignments, resumes, changeActors, Clock.systemUTC());
    }

    InterviewQueryService(
        EntityManager em,
        InterviewAccess access,
        ApplicationNames names,
        InterviewSettings settings,
        TalentInterviewRepository interviews,
        TalentInterviewInterviewerRepository interviewers,
        TalentInterviewEventRepository events,
        TalentInterviewFeedbackRepository feedback,
        TalentApplicationRepository applications,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerAssignmentRepository assignments,
        OrgResumeRepository resumes,
        EntChangeActors changeActors,
        Clock clock
    ) {
        this.changeActors = changeActors;
        this.em = em;
        this.access = access;
        this.names = names;
        this.settings = settings;
        this.interviews = interviews;
        this.interviewers = interviewers;
        this.events = events;
        this.feedback = feedback;
        this.applications = applications;
        this.requirements = requirements;
        this.consultants = consultants;
        this.clients = clients;
        this.assignments = assignments;
        this.resumes = resumes;
        this.clock = clock;
    }

    // ---- query building --------------------------------------------------------------------------------------------------------

    private static final class Where {
        final StringBuilder sql = new StringBuilder();
        final Map<String, Object> params = new LinkedHashMap<>();

        Where copy() {
            Where c = new Where();
            c.sql.append(sql);
            c.params.putAll(params);
            return c;
        }

        Where and(String clause) {
            sql.append(" and ").append(clause);
            return this;
        }

        Where param(String name, Object value) {
            params.put(name, value);
            return this;
        }
    }

    /** The caller's scope as a clause; {@code null} when the scope reaches nothing at all. */
    private Where scoped(OrgMembership me, ListQuery f) {
        PermissionScope scope = access.requireView(me);
        Where w = new Where().param("orgId", me.orgId());
        Set<Long> visible = access.marketersVisible(me, scope);
        if (visible != null) {
            if (visible.isEmpty()) return null;
            w.and(SCOPE_CLAUSE).param("scope", visible);
        }
        if (f == null) return w;
        if (f.q() != null && !f.q().isBlank()) {
            String q = f.q().strip().toLowerCase(Locale.ROOT);
            if (q.length() < SEARCH_MIN || q.length() > SEARCH_MAX) throw OrgException.invalid("q", "must be " + SEARCH_MIN + " to " + SEARCH_MAX + " characters");
            Matcher job = JOB_CODE.matcher(q);
            Matcher itv = INT_CODE.matcher(q);
            if (job.matches()) {
                w.and("r.id = :jobId").param("jobId", Long.parseLong(job.group(1)) - ApplicationCodes.JOB_OFFSET);
            } else if (itv.matches()) {
                w.and("i.id = :intId").param("intId", Long.parseLong(itv.group(1)) - ApplicationCodes.INTERVIEW_OFFSET);
            } else {
                w.and(
                    "(lower(coalesce(r.title, '')) like :q escape '!' or lower(c.displayName) like :q escape '!' or lower(cl.name) like :q escape '!' or lower(coalesce(i.roundLabel, '')) like :q escape '!'" +
                    " or lower(coalesce(i.interviewerName, '')) like :q escape '!' or exists (select 1 from TalentInterviewInterviewer v where v.orgId = :orgId and v.interviewId = i.id and lower(v.name) like :q escape '!'))"
                ).param("q", "%" + escapeLike(q) + "%");
            }
        }
        List<String> statuses = parseStatuses(f.status());
        if (!statuses.isEmpty()) w.and("i.status in :statuses").param("statuses", statuses);
        if (f.clientId() != null) w.and("i.clientId = :clientId").param("clientId", f.clientId());
        if (f.consultantId() != null) w.and("i.consultantId = :consultantId").param("consultantId", f.consultantId());
        if (f.round() != null && !f.round().isBlank()) w.and("i.roundLabel = :round").param("round", f.round().strip());
        if (f.mode() != null && !f.mode().isBlank()) {
            String m = f.mode().strip().toUpperCase(Locale.ROOT);
            if (!InterviewStatuses.MODES.contains(m)) throw OrgException.invalid("mode", "must be one of " + InterviewStatuses.MODES);
            w.and("i.mode = :mode").param("mode", m);
        }
        if (f.from() != null) w.and("i.scheduledAt >= :fromAt").param("fromAt", f.from().atStartOfDay().toInstant(ZoneOffset.UTC));
        if (f.to() != null) w.and("i.scheduledAt < :toAt").param("toAt", f.to().plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC));
        return w;
    }

    static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    static List<String> parseStatuses(List<String> raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        for (String part : raw) {
            if (part == null) continue;
            for (String s : part.split(",")) {
                String t = s.strip().toUpperCase(Locale.ROOT).replace(' ', '_');
                if (t.isEmpty()) continue;
                if (!InterviewStatuses.valid(t)) throw OrgException.invalid("status", "unknown status " + s.strip());
                if (!out.contains(t)) out.add(t);
            }
        }
        return out;
    }

    private static final String STATUS_RANK = "case i.status when 'SCHEDULED' then 0 when 'IN_PROGRESS' then 1 when 'COMPLETED' then 2 else 3 end";

    private static String orderBy(List<String> sorts) {
        StringBuilder out = new StringBuilder();
        if (sorts != null) {
            for (String raw : sorts) {
                if (raw == null || raw.isBlank()) continue;
                String[] p = raw.split(",", 2);
                String key = p[0].strip();
                String dir = p.length > 1 ? p[1].strip().toLowerCase(Locale.ROOT) : "asc";
                if (!dir.equals("asc") && !dir.equals("desc")) throw sortInvalid(raw);
                String expr = switch (key) {
                    case "scheduled" -> "i.scheduledAt";
                    case "role" -> "lower(coalesce(r.title, ''))";
                    case "consultant" -> "lower(c.displayName)";
                    case "client" -> "lower(cl.name)";
                    case "round" -> "lower(coalesce(i.roundLabel, ''))";
                    case "status" -> STATUS_RANK;
                    case "mode" -> "i.mode";
                    default -> throw sortInvalid(raw);
                };
                if (out.length() > 0) out.append(", ");
                out.append(expr).append(' ').append(dir);
            }
        }
        if (out.length() == 0) out.append("i.scheduledAt desc");
        return " order by " + out + ", i.id desc";
    }

    private static OrgException sortInvalid(String raw) {
        return OrgException.coded(400, "SORT_INVALID", "Sort by scheduled, role, consultant, client, round, status or mode (asc or desc): " + raw, Map.of());
    }

    private Query query(String jpql, Where w) {
        Query q = em.createQuery(jpql);
        w.params.forEach(q::setParameter);
        return q;
    }

    // ---- list ------------------------------------------------------------------------------------------------------------------

    public InterviewDTO.Page list(OrgMembership me, ListQuery f) {
        int size = f.size() == null ? DEFAULT_SIZE : f.size();
        int page = f.page() == null ? 0 : f.page();
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be 1 to " + MAX_SIZE);
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        Where w = scoped(me, f);
        if (w == null) return new InterviewDTO.Page(List.of(), page, size, 0, false);
        return pageOf(me, w, orderBy(f.sort()), page, size);
    }

    @SuppressWarnings("unchecked")
    private InterviewDTO.Page pageOf(OrgMembership me, Where w, String order, int page, int size) {
        long total = ((Number) query("select count(i)" + FROM + w.sql, w).getSingleResult()).longValue();
        Query q = query("select i, c, cl, a, r" + FROM + w.sql + order, w);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        List<Object[]> rows = q.getResultList();
        return new InterviewDTO.Page(rowsOf(me.orgId(), rows), page, size, total, (long) (page + 1) * size < total);
    }

    private List<InterviewDTO.Row> rowsOf(Long orgId, List<Object[]> rows) {
        List<Long> ids = rows.stream().map(r -> ((TalentInterview) r[0]).getId()).toList();
        Map<Long, List<InterviewDTO.Interviewer>> people = interviewersOf(orgId, ids);
        Set<Long> withFeedback = feedbackIds(orgId, ids);
        List<InterviewDTO.Row> out = new ArrayList<>();
        for (Object[] r : rows) {
            TalentInterview i = (TalentInterview) r[0];
            out.add(row(i, (ConsultantProfile) r[1], (ClientAccount) r[2], (TalentApplication) r[3], (ClientRequirement) r[4], people.getOrDefault(i.getId(), List.of()), withFeedback.contains(i.getId())));
        }
        return out;
    }

    private InterviewDTO.Row row(TalentInterview i, ConsultantProfile c, ClientAccount cl, TalentApplication a, ClientRequirement r, List<InterviewDTO.Interviewer> people, boolean hasFeedback) {
        return new InterviewDTO.Row(
            i.getId(), ApplicationCodes.interviewCode(i.getId()), a == null ? null : a.getId(), r == null ? null : r.getTitle(), r == null ? null : ApplicationCodes.jobCode(r.getId()),
            consultantRef(c), clientRef(cl), i.getRoundLabel(), i.getRoundNo(), i.getScheduledAt(), i.getDurationMinutes() == null ? 0 : i.getDurationMinutes(), i.getMode(), i.getLocation(),
            i.getStatus(), effectiveNextStep(i, hasFeedback), people
        );
    }

    static String effectiveNextStep(TalentInterview i, boolean hasFeedback) {
        String custom = i.getNextStep();
        return custom != null && !custom.isBlank() ? custom : InterviewStatuses.defaultNextStep(i.getStatus(), hasFeedback);
    }

    static InterviewDTO.PersonRef consultantRef(ConsultantProfile c) {
        return new InterviewDTO.PersonRef(c.getId(), c.getDisplayName(), ApplicationNames.initials(c.getDisplayName()), c.getJobTitle(), c.getStatus());
    }

    static InterviewDTO.ClientRef clientRef(ClientAccount cl) {
        return new InterviewDTO.ClientRef(cl.getId(), cl.getName(), clientInitials(cl.getName()), cl.getIndustry());
    }

    /** Up to two letters from the first words of the company name: "Global Media" is GM, "TechCorp" is TE. */
    static String clientInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.strip().split("[\\s&/-]+");
        if (parts.length >= 2) return ("" + parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase(Locale.ROOT);
        return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase(Locale.ROOT);
    }

    private Map<Long, List<InterviewDTO.Interviewer>> interviewersOf(Long orgId, Collection<Long> ids) {
        Map<Long, List<InterviewDTO.Interviewer>> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (TalentInterviewInterviewer v : interviewers.findByOrgIdAndInterviewIdInOrderBySortOrderAsc(orgId, ids)) {
            out.computeIfAbsent(v.getInterviewId(), k -> new ArrayList<>()).add(new InterviewDTO.Interviewer(v.getId(), v.getName(), v.getTitle(), ApplicationNames.initials(v.getName()), v.isPrimary()));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Set<Long> feedbackIds(Long orgId, Collection<Long> ids) {
        if (ids.isEmpty()) return Set.of();
        List<Long> found = em.createQuery("select distinct f.interviewId from TalentInterviewFeedback f where f.orgId = :o and f.interviewId in :ids").setParameter("o", orgId).setParameter("ids", ids).getResultList();
        return new HashSet<>(found);
    }

    // ---- KPI tiles -------------------------------------------------------------------------------------------------------------

    /** One interview's status over time: from SCHEDULED at creation through every recorded change. */
    record Timeline(Instant createdAt, List<Instant> at, List<String> status) {
        String at(Instant when) {
            if (when.isBefore(createdAt)) return null;
            String s = InterviewStatuses.SCHEDULED;
            for (int k = 0; k < at.size(); k++) {
                if (at.get(k).isAfter(when)) break;
                s = status.get(k);
            }
            return s;
        }
    }

    /** Rebuilds every interview's status history in scope from its creation time, the recorded status events and, when the row says more than the events do, its current status at its last update. */
    @SuppressWarnings("unchecked")
    private List<Timeline> timelines(OrgMembership me) {
        Where w = scoped(me, null);
        if (w == null) return List.of();
        List<Object[]> rows = query("select i.id, i.createdAt, i.status, i.updatedAt" + FROM + w.sql, w).getResultList();
        Map<Long, List<Object[]>> evs = new HashMap<>();
        List<Object[]> evRows = rerun(w);
        for (Object[] e : evRows) evs.computeIfAbsent((Long) e[0], k -> new ArrayList<>()).add(e);
        List<Timeline> out = new ArrayList<>();
        for (Object[] r : rows) {
            Long id = (Long) r[0];
            Instant created = (Instant) r[1];
            String current = (String) r[2];
            Instant updated = (Instant) r[3];
            List<Instant> at = new ArrayList<>();
            List<String> st = new ArrayList<>();
            for (Object[] e : evs.getOrDefault(id, List.of())) {
                at.add((Instant) e[1]);
                st.add((String) e[2]);
            }
            String last = st.isEmpty() ? InterviewStatuses.SCHEDULED : st.get(st.size() - 1);
            if (!last.equals(current)) {
                at.add(updated.isBefore(created) ? created : updated);
                st.add(current);
            }
            out.add(new Timeline(created, at, st));
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<Object[]> rerun(Where w) {
        Query q = em.createQuery(
            "select e.interviewId, e.occurredAt, e.toStatus, e.id from TalentInterviewEvent e where e.orgId = :orgId and e.toStatus is not null and e.interviewId in (select i.id" + FROM + w.sql + ") order by e.interviewId, e.occurredAt, e.id"
        );
        w.params.forEach(q::setParameter);
        return q.getResultList();
    }

    private static long countAt(List<Timeline> all, Instant when, String... statuses) {
        long n = 0;
        for (Timeline t : all) {
            String s = t.at(when);
            if (s == null) continue;
            if (statuses.length == 0) {
                n++;
                continue;
            }
            for (String x : statuses) if (x.equals(s)) {
                n++;
                break;
            }
        }
        return n;
    }

    public InterviewDTO.Counts counts(OrgMembership me) {
        PermissionScope scope = access.requireView(me);
        Instant now = Instant.now(clock);
        Instant monthAgo = now.minus(Duration.ofDays(MONTH_DAYS));
        List<Instant> instants = new ArrayList<>();
        for (int k = SERIES_POINTS - 1; k >= 0; k--) instants.add(now.minus(Duration.ofDays(7L * k)));
        List<Timeline> all = timelines(me);
        boolean hasHistory = all.stream().anyMatch(t -> !t.createdAt().isAfter(monthAgo));

        Map<String, Long> current = liveStatusCounts(me);
        long total = current.values().stream().mapToLong(Long::longValue).sum();

        // "Scheduled This Week": interviews happening this calendar week that are not cancelled, against last week
        LocalDate today = LocalDate.now(clock.withZone(ZoneOffset.UTC));
        LocalDate monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        List<Long> weekSeries = new ArrayList<>();
        for (int k = SERIES_POINTS - 1; k >= 0; k--) weekSeries.add(scheduledBetween(me, monday.minusWeeks(k), monday.minusWeeks(k).plusWeeks(1)));
        long thisWeek = weekSeries.get(SERIES_POINTS - 1);
        long lastWeek = weekSeries.get(SERIES_POINTS - 2);

        List<Long> totalSeries = new ArrayList<>();
        List<Long> progressSeries = new ArrayList<>();
        List<Long> doneSeries = new ArrayList<>();
        for (Instant at : instants) {
            totalSeries.add(countAt(all, at));
            progressSeries.add(countAt(all, at, InterviewStatuses.IN_PROGRESS));
            doneSeries.add(countAt(all, at, InterviewStatuses.COMPLETED));
        }
        return new InterviewDTO.Counts(
            now, instants.get(0), scope.name(),
            InterviewDTO.Tile.of(total, hasHistory ? countAt(all, monthAgo) : null, totalSeries),
            InterviewDTO.Tile.of(thisWeek, lastWeek > 0 || weekSeries.stream().anyMatch(v -> v > 0) ? lastWeek : null, weekSeries),
            InterviewDTO.Tile.of(current.getOrDefault(InterviewStatuses.IN_PROGRESS, 0L), hasHistory ? countAt(all, monthAgo, InterviewStatuses.IN_PROGRESS) : null, progressSeries),
            InterviewDTO.Tile.of(current.getOrDefault(InterviewStatuses.COMPLETED, 0L), hasHistory ? countAt(all, monthAgo, InterviewStatuses.COMPLETED) : null, doneSeries),
            current
        );
    }

    private long scheduledBetween(OrgMembership me, LocalDate from, LocalDate to) {
        Where w = scoped(me, null);
        if (w == null) return 0;
        w.and("i.scheduledAt >= :wf and i.scheduledAt < :wt and i.status <> 'CANCELLED'")
            .param("wf", from.atStartOfDay().toInstant(ZoneOffset.UTC)).param("wt", to.atStartOfDay().toInstant(ZoneOffset.UTC));
        return ((Number) query("select count(i)" + FROM + w.sql, w).getSingleResult()).longValue();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Long> liveStatusCounts(OrgMembership me) {
        Where w = scoped(me, null);
        Map<String, Long> out = new LinkedHashMap<>();
        for (String s : InterviewStatuses.ORDER) out.put(s, 0L);
        if (w == null) return out;
        List<Object[]> rows = query("select i.status, count(i)" + FROM + w.sql + " group by i.status", w).getResultList();
        for (Object[] r : rows) out.put((String) r[0], ((Number) r[1]).longValue());
        return out;
    }

    // ---- filters and pickers ---------------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public InterviewDTO.Filters filters(OrgMembership me) {
        Where w = scoped(me, null);
        List<InterviewDTO.Option> statuses = InterviewStatuses.ORDER.stream().map(s -> new InterviewDTO.Option(s, InterviewStatuses.label(s))).toList();
        List<InterviewDTO.Option> modes = InterviewStatuses.MODES.stream().map(s -> new InterviewDTO.Option(s, InterviewStatuses.MODE_LABELS.get(s))).toList();
        InterviewDTO.Limits limits = new InterviewDTO.Limits(settings.maxInterviewers(me.orgId()), settings.maxDurationMinutes(me.orgId()), settings.undoMinutes(me.orgId()));
        if (w == null) return new InterviewDTO.Filters(List.of(), List.of(), List.of(), statuses, modes, limits);
        List<Object[]> cls = query("select distinct cl.id, cl.name" + FROM + w.sql + " order by cl.name", w).getResultList();
        List<Object[]> cons = query("select distinct c.id, c.displayName" + FROM + w.sql + " order by c.displayName", w).getResultList();
        List<String> rounds = query("select distinct i.roundLabel" + FROM + w.sql + " and i.roundLabel is not null order by i.roundLabel", w).getResultList();
        return new InterviewDTO.Filters(
            cls.stream().map(c -> new InterviewDTO.Option(String.valueOf(c[0]), (String) c[1])).toList(),
            cons.stream().map(c -> new InterviewDTO.Option(String.valueOf(c[0]), (String) c[1])).toList(),
            rounds.stream().map(x -> new InterviewDTO.Option(x, x)).toList(),
            statuses,
            modes,
            limits
        );
    }

    /** Candidates for the Schedule dialog: consultants the caller may schedule for, a consultant's open applications, and clients. */
    @SuppressWarnings("unchecked")
    public InterviewDTO.Pickers pickers(OrgMembership me, String kind, Long consultantId, String q) {
        PermissionScope scope = access.requireWriteScope(me);
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (needle.length() > SEARCH_MAX) throw OrgException.invalid("q", "at most " + SEARCH_MAX + " characters");
        String like = "%" + escapeLike(needle) + "%";
        Long orgId = me.orgId();
        if ("consultant".equals(kind)) {
            Set<Long> visible = access.marketersVisible(me, scope);
            if (visible != null && visible.isEmpty()) return new InterviewDTO.Pickers(kind, List.of());
            StringBuilder jpql = new StringBuilder("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and lower(c.displayName) like :q escape '!'");
            if (visible != null) jpql.append(" and c.id in (select ma.consultantId from MarketerAssignment ma where ma.orgId = :orgId and ma.marketerMemberId in :scope)");
            jpql.append(" order by c.displayName");
            Query query = em.createQuery(jpql.toString()).setParameter("orgId", orgId).setParameter("q", like).setMaxResults(PICKER_MAX);
            if (visible != null) query.setParameter("scope", visible);
            List<ConsultantProfile> rows = query.getResultList();
            return new InterviewDTO.Pickers(kind, rows.stream().map(c -> new InterviewDTO.PickerItem(c.getId(), c.getDisplayName(), c.getJobTitle(), null)).toList());
        }
        if ("application".equals(kind)) {
            if (consultantId == null) throw OrgException.invalid("consultantId", "is required");
            ConsultantProfile c = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
            requireConsultantInReach(me, scope, c.getId());
            List<Object[]> rows = em.createQuery(
                "select a, r, cl from TalentApplication a, ClientRequirement r, ClientAccount cl where a.orgId = :orgId and a.consultantId = :cid and r.orgId = :orgId and r.id = a.requirementId and cl.orgId = :orgId and cl.id = a.clientId" +
                " and a.stage <> 'CLOSED' and (lower(r.title) like :q escape '!' or lower(cl.name) like :q escape '!') order by a.appliedOn desc"
            ).setParameter("orgId", orgId).setParameter("cid", c.getId()).setParameter("q", like).setMaxResults(PICKER_MAX).getResultList();
            return new InterviewDTO.Pickers(kind, rows.stream().map(x -> new InterviewDTO.PickerItem(((TalentApplication) x[0]).getId(), ((ClientRequirement) x[1]).getTitle(), ((ClientAccount) x[2]).getName(), ((TalentApplication) x[0]).getClientId())).toList());
        }
        if ("client".equals(kind)) {
            List<ClientAccount> rows = em.createQuery("select cl from ClientAccount cl where cl.orgId = :orgId and lower(cl.name) like :q escape '!' order by cl.name").setParameter("orgId", orgId).setParameter("q", like).setMaxResults(PICKER_MAX).getResultList();
            return new InterviewDTO.Pickers(kind, rows.stream().map(c -> new InterviewDTO.PickerItem(c.getId(), c.getName(), c.getIndustry(), c.getId())).toList());
        }
        throw OrgException.invalid("kind", "must be consultant, application or client");
    }

    /** The consultant's marketer must be inside the write scope (ORG: always). */
    void requireConsultantInReach(OrgMembership me, PermissionScope scope, Long consultantId) {
        Set<Long> visible = access.marketersVisible(me, scope);
        if (visible == null) return;
        Set<Long> marketers = new HashSet<>();
        assignments.findByOrgIdAndConsultantId(me.orgId(), consultantId).ifPresent(a -> marketers.add(a.getMarketerMemberId()));
        if (!access.covers(me, scope, marketers)) throw new OrgNotFoundException();
    }

    // ---- pipeline --------------------------------------------------------------------------------------------------------------

    public InterviewDTO.Pipeline pipeline(OrgMembership me, ListQuery f) {
        List<InterviewDTO.Column> columns = new ArrayList<>();
        for (String status : InterviewStatuses.ORDER) {
            ListQuery one = new ListQuery(f.q(), List.of(status), f.clientId(), f.consultantId(), f.round(), f.mode(), f.from(), f.to(), List.of("scheduled," + (InterviewStatuses.COMPLETED.equals(status) || InterviewStatuses.CANCELLED.equals(status) ? "desc" : "asc")), 0, PIPELINE_CARDS);
            Where w = scoped(me, one);
            if (w == null) {
                columns.add(new InterviewDTO.Column(status, InterviewStatuses.label(status), 0, List.of()));
                continue;
            }
            InterviewDTO.Page p = pageOf(me, w, orderBy(one.sort()), 0, PIPELINE_CARDS);
            columns.add(new InterviewDTO.Column(status, InterviewStatuses.label(status), p.total(), p.items()));
        }
        return new InterviewDTO.Pipeline(columns);
    }

    // ---- analytics -------------------------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public InterviewDTO.Analytics analytics(OrgMembership me) {
        Where w = scoped(me, null);
        if (w == null) return new InterviewDTO.Analytics(0, 0, null, null, List.of(), List.of(), List.of(), List.of(), List.of());
        Instant now = Instant.now(clock);
        Map<String, Long> live = liveStatusCounts(me);
        long total = live.values().stream().mapToLong(Long::longValue).sum();
        List<InterviewDTO.Bucket> byStatus = InterviewStatuses.ORDER.stream().map(s -> new InterviewDTO.Bucket(s, InterviewStatuses.label(s), live.getOrDefault(s, 0L))).toList();
        long done = live.getOrDefault(InterviewStatuses.COMPLETED, 0L);
        long cancelled = live.getOrDefault(InterviewStatuses.CANCELLED, 0L);
        Double completion = done + cancelled == 0 ? null : Math.round(1000.0 * done / (done + cancelled)) / 10.0;

        long upcoming7 = ((Number) query("select count(i)" + FROM + w.sql + " and i.status = 'SCHEDULED' and i.scheduledAt >= :n0 and i.scheduledAt < :n7", w.copy().param("n0", now).param("n7", now.plus(Duration.ofDays(7)))).getSingleResult()).longValue();

        Instant eightWeeksAgo = now.minus(Duration.ofDays(7L * SERIES_POINTS));
        long recent = ((Number) query("select count(i)" + FROM + w.sql + " and i.status <> 'CANCELLED' and i.scheduledAt >= :s0 and i.scheduledAt < :s1", w.copy().param("s0", eightWeeksAgo).param("s1", now)).getSingleResult()).longValue();
        Double avg = recent == 0 ? null : Math.round(10.0 * recent / SERIES_POINTS) / 10.0;

        YearMonth current = YearMonth.from(now.atZone(ZoneOffset.UTC));
        Instant first = current.minusMonths(ANALYTICS_MONTHS - 1L).atDay(1).atStartOfDay().toInstant(ZoneOffset.UTC);
        List<Instant> stamps = new ArrayList<>(query("select i.scheduledAt" + FROM + w.sql + " and i.scheduledAt >= :first and i.status <> 'CANCELLED'", w.copy().param("first", first)).getResultList());
        Map<YearMonth, Long> byMonth = new HashMap<>();
        for (Instant t : stamps) byMonth.merge(YearMonth.from(t.atZone(ZoneOffset.UTC)), 1L, Long::sum);
        List<InterviewDTO.Bucket> perMonth = new ArrayList<>();
        for (int k = ANALYTICS_MONTHS - 1; k >= 0; k--) {
            YearMonth ym = current.minusMonths(k);
            perMonth.add(new InterviewDTO.Bucket(ym.toString(), ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH), byMonth.getOrDefault(ym, 0L)));
        }
        List<Object[]> modeRows = query("select i.mode, count(i)" + FROM + w.sql + " group by i.mode order by count(i) desc", w).getResultList();
        List<InterviewDTO.Bucket> byMode = modeRows.stream().map(r -> new InterviewDTO.Bucket((String) r[0], InterviewStatuses.MODE_LABELS.getOrDefault((String) r[0], (String) r[0]), ((Number) r[1]).longValue())).toList();
        List<Object[]> roundRows = query("select coalesce(i.roundLabel, 'Not recorded'), count(i)" + FROM + w.sql + " group by coalesce(i.roundLabel, 'Not recorded') order by count(i) desc", w).setMaxResults(6).getResultList();
        List<InterviewDTO.Bucket> byRound = roundRows.stream().map(r -> new InterviewDTO.Bucket((String) r[0], (String) r[0], ((Number) r[1]).longValue())).toList();
        List<Object[]> topRows = query("select cl.name, count(i)" + FROM + w.sql + " group by cl.name order by count(i) desc, cl.name", w).setMaxResults(5).getResultList();
        List<InterviewDTO.Bucket> top = topRows.stream().map(r -> new InterviewDTO.Bucket((String) r[0], (String) r[0], ((Number) r[1]).longValue())).toList();
        return new InterviewDTO.Analytics(total, upcoming7, completion, avg, byStatus, perMonth, byMode, byRound, top);
    }

    // ---- detail ----------------------------------------------------------------------------------------------------------------

    /** The marketer seats an interview belongs to: its application's marketer and its consultant's assigned marketer. */
    Set<Long> marketersOf(Long orgId, TalentInterview i) {
        Set<Long> out = new HashSet<>();
        if (i.getApplicationId() != null) applications.findByOrgIdAndId(orgId, i.getApplicationId()).ifPresent(a -> out.add(a.getMarketerMemberId()));
        assignments.findByOrgIdAndConsultantId(orgId, i.getConsultantId()).ifPresent(a -> out.add(a.getMarketerMemberId()));
        out.remove(null);
        return out;
    }

    /** The interview when the caller may read it (in scope); otherwise the generic 404. */
    public TalentInterview visible(OrgMembership me, Long interviewId) {
        PermissionScope scope = access.requireView(me);
        TalentInterview i = interviewId == null ? null : interviews.findByOrgIdAndId(me.orgId(), interviewId).orElse(null);
        if (i == null || !access.covers(me, scope, marketersOf(me.orgId(), i))) throw new OrgNotFoundException();
        return i;
    }

    public InterviewDTO.Detail detail(OrgMembership me, Long interviewId) {
        return detailOf(me, visible(me, interviewId));
    }

    public InterviewDTO.Detail detailOf(OrgMembership me, TalentInterview i) {
        Long orgId = me.orgId();
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, i.getConsultantId()).orElseThrow(OrgNotFoundException::new);
        ClientAccount cl = clients.findByOrgIdAndId(orgId, i.getClientId()).orElseThrow(OrgNotFoundException::new);
        TalentApplication a = i.getApplicationId() == null ? null : applications.findByOrgIdAndId(orgId, i.getApplicationId()).orElse(null);
        ClientRequirement r = a == null ? null : requirements.findByOrgIdAndId(orgId, a.getRequirementId()).orElse(null);
        List<TalentInterviewEvent> evs = events.findByOrgIdAndInterviewIdOrderByOccurredAtAscIdAsc(orgId, i.getId());
        List<TalentInterviewFeedback> fbs = feedback.findByOrgIdAndInterviewIdOrderByCreatedAtDescIdDesc(orgId, i.getId());
        Set<Long> memberIds = new HashSet<>();
        Long marketerId = a != null && a.getMarketerMemberId() != null ? a.getMarketerMemberId() : assignments.findByOrgIdAndConsultantId(orgId, c.getId()).map(x -> x.getMarketerMemberId()).orElse(null);
        memberIds.add(marketerId);
        evs.forEach(e -> memberIds.add(e.getActorMemberId()));
        fbs.forEach(f -> memberIds.add(f.getAuthorMemberId()));
        Map<Long, String> who = names.memberNames(orgId, memberIds);
        EntChangeActors.Subject subject = new EntChangeActors.Subject(c.getId(), marketerId);
        Set<Long> actorIds = new HashSet<>();
        actorIds.add(i.getUpdatedByMemberId());
        actorIds.add(i.getCreatedByMemberId());
        EntChangeActors.Lookup actors = changeActors.load(orgId, actorIds, List.of(subject));

        List<InterviewDTO.EventItem> timeline = new ArrayList<>(evs.stream().filter(e -> InterviewStatuses.TIMELINE_EVENTS.contains(e.getEventType())).map(e -> eventItem(e, who)).toList());
        java.util.Collections.reverse(timeline);
        List<InterviewDTO.FeedbackItem> fbItems = fbs.stream().map(f -> new InterviewDTO.FeedbackItem(f.getId(), marketer(f.getAuthorMemberId(), who), f.getRating(), f.getRecommendation(), f.getNote(), f.getCreatedAt())).toList();
        List<InterviewDTO.Interviewer> people = interviewersOf(orgId, List.of(i.getId())).getOrDefault(i.getId(), List.of());

        List<InterviewDTO.DocumentItem> docs = new ArrayList<>();
        if (a != null && a.getResumeId() != null) {
            OrgResume res = resumes.findByOrgIdAndId(orgId, a.getResumeId()).orElse(null);
            if (res != null) docs.add(new InterviewDTO.DocumentItem(res.getId(), res.getName(), res.getFileName(), res.getVersionNo(), res.isPrimaryForOrg(), "Resume"));
        }

        Set<Long> owners = marketersOf(orgId, i);
        boolean edit = access.canWrite(me, owners);
        boolean open = InterviewStatuses.open(i.getStatus());
        boolean canReschedule = edit && (open && InterviewStatuses.SCHEDULED.equals(i.getStatus()) || InterviewStatuses.CANCELLED.equals(i.getStatus()));
        boolean canStatus = edit && !InterviewStatuses.next(i.getStatus()).isEmpty();
        boolean canRemind = edit && InterviewStatuses.SCHEDULED.equals(i.getStatus());
        boolean canFeedback = edit && (InterviewStatuses.IN_PROGRESS.equals(i.getStatus()) || InterviewStatuses.COMPLETED.equals(i.getStatus()));
        InterviewDTO.UndoToken undo = edit ? undoToken(me, i, evs) : null;

        return new InterviewDTO.Detail(
            i.getId(), ApplicationCodes.interviewCode(i.getId()), a == null ? null : a.getId(), a == null ? null : a.getCode(), r == null ? null : r.getTitle(), r == null ? null : ApplicationCodes.jobCode(r.getId()),
            r == null ? null : r.getEmploymentLabel(), r == null ? null : r.getLocation(), r == null ? null : r.getWorkMode(), consultantRef(c), clientRef(cl), marketer(marketerId, who),
            i.getRoundLabel(), i.getRoundNo(), i.getScheduledAt(), i.getDurationMinutes() == null ? 0 : i.getDurationMinutes(), i.getMode(), i.getMeetingLink(), i.getLocation(), i.getStatus(),
            effectiveNextStep(i, !fbs.isEmpty()), i.getNextStep(), i.getNotes(), i.getReminderRequestedAt(), people, steps(orgId, i, a), timeline, fbItems, docs,
            edit ? InterviewStatuses.next(i.getStatus()) : List.of(), new InterviewDTO.Actions(edit, canReschedule, canStatus, canRemind, canFeedback), undo, i.getCreatedAt(),
            i.getUpdatedAt(), actors.of(i.getUpdatedByMemberId(), null, subject), actors.of(i.getCreatedByMemberId(), null, subject)
        );
    }

    private static InterviewDTO.Marketer marketer(Long memberId, Map<Long, String> who) {
        if (memberId == null) return null;
        String name = who.getOrDefault(memberId, "Member");
        return new InterviewDTO.Marketer(memberId, name, ApplicationNames.initials(name));
    }

    private static InterviewDTO.EventItem eventItem(TalentInterviewEvent e, Map<Long, String> who) {
        return new InterviewDTO.EventItem(e.getId(), e.getEventType(), e.getFromStatus(), e.getToStatus(), marketer(e.getActorMemberId(), who), e.getDetail(), e.getOccurredAt());
    }

    /** The stepper: this application's interviews in order, a placeholder "Final Round" until one exists, and the offer. */
    List<InterviewDTO.Step> steps(Long orgId, TalentInterview self, TalentApplication a) {
        List<TalentInterview> all = a == null ? List.of(self) : interviews.findByOrgIdAndApplicationIdOrderByScheduledAtAscIdAsc(orgId, a.getId());
        List<InterviewDTO.Step> out = new ArrayList<>();
        boolean finalSeen = false;
        for (TalentInterview x : all) {
            String label = x.getRoundLabel() != null ? x.getRoundLabel() : "Round " + (out.size() + 1);
            if (label.toLowerCase(Locale.ROOT).contains("final")) finalSeen = true;
            String state = x.getId().equals(self.getId()) ? "CURRENT" : switch (x.getStatus()) {
                case InterviewStatuses.COMPLETED -> "DONE";
                case InterviewStatuses.CANCELLED -> "CANCELLED";
                default -> "UPCOMING";
            };
            out.add(new InterviewDTO.Step("iv-" + x.getId(), label, x.getScheduledAt(), state, x.getId()));
        }
        if (!finalSeen) out.add(new InterviewDTO.Step("final", "Final Round", null, "NOT_SCHEDULED", null));
        boolean offer = a != null && (com.dossier.api.service.ent.applications.ApplicationStages.OFFER.equals(a.getStage()) || ("CLOSED".equals(a.getStage()) && "HIRED".equals(a.getClosedReason())));
        out.add(new InterviewDTO.Step("offer", "Offer", offer ? a.getStageChangedAt() : null, offer ? "DONE" : "NOT_SCHEDULED", null));
        return out;
    }

    /** The undo is offered for the caller's own latest status change, for the organization's undo window, while nothing later was recorded. */
    private InterviewDTO.UndoToken undoToken(OrgMembership me, TalentInterview i, List<TalentInterviewEvent> evs) {
        TalentInterviewEvent last = null;
        for (TalentInterviewEvent e : evs) if (InterviewStatuses.STATE_EVENTS.contains(e.getEventType()) || "REMINDER".equals(e.getEventType()) || "FEEDBACK".equals(e.getEventType())) last = e;
        if (last == null || !"STATUS".equals(last.getEventType()) || last.getFromStatus() == null) return null;
        if (!me.memberId().equals(last.getActorMemberId())) return null;
        Instant expires = last.getOccurredAt().plus(Duration.ofMinutes(settings.undoMinutes(me.orgId())));
        if (!expires.isAfter(Instant.now(clock))) return null;
        return new InterviewDTO.UndoToken(last.getId(), expires, last.getFromStatus(), last.getToStatus());
    }

    /** Id and code helpers shared with the command service. */
    static final class ApplicationCodes {
        static final long JOB_OFFSET = 1000;
        static final long INTERVIEW_OFFSET = 1000;

        private ApplicationCodes() {}

        static String jobCode(Long requirementId) {
            return "JOB-" + (JOB_OFFSET + requirementId);
        }

        static String interviewCode(Long id) {
            return "INT-" + (INTERVIEW_OFFSET + id);
        }
    }

    /** Sorted copy, for tests. */
    static <T> List<T> sorted(Collection<T> c, Comparator<T> by) {
        List<T> l = new ArrayList<>(c);
        l.sort(by);
        return l;
    }
}
