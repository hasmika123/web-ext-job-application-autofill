package com.dossier.api.service.ent.applications;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationNoteRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.dto.ent.ApplicationDTO;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.YearMonth;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Applications board: table, KPI tiles with real month-over-month deltas and weekly sparklines, the pipeline board,
 * analytics and the detail drawer. Everything starts from {@code a.orgId = :orgId} and is narrowed to the caller's scope; a row outside the
 * scope is the same generic 404 as a row of another tenant.
 */
@Service
@Transactional(readOnly = true)
public class ApplicationQueryService {

    static final int SEARCH_MIN = 2;
    static final int SEARCH_MAX = 80;
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    /** Sparkline: one point per week for this many weeks, ending now. */
    static final int SERIES_POINTS = 8;
    static final int PIPELINE_CARDS = 20;
    static final Duration UNDO_WINDOW = Duration.ofMinutes(10);
    static final int MONTH_DAYS = 30;

    private static final String FROM =
        " from TalentApplication a, ClientRequirement r, ConsultantProfile c, ClientAccount cl where a.orgId = :orgId and r.orgId = :orgId and r.id = a.requirementId" +
        " and c.orgId = :orgId and c.id = a.consultantId and cl.orgId = :orgId and cl.id = a.clientId";

    public record ListQuery(
        String q, List<String> stage, String jobTitle, Long clientId, Long marketerId, LocalDate from, LocalDate to, List<String> sort, Integer page, Integer size
    ) {}

    private final EntityManager em;
    private final ApplicationAccess access;
    private final ApplicationNames names;
    private final TalentApplicationRepository applications;
    private final TalentApplicationEventRepository events;
    private final TalentApplicationNoteRepository notes;
    private final ClientRequirementRepository requirements;
    private final ConsultantProfileRepository consultants;
    private final ClientAccountRepository clients;
    private final MarketerCapacityRepository capacities;
    private final Clock clock;

    @Autowired
    public ApplicationQueryService(
        EntityManager em,
        ApplicationAccess access,
        ApplicationNames names,
        TalentApplicationRepository applications,
        TalentApplicationEventRepository events,
        TalentApplicationNoteRepository notes,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerCapacityRepository capacities
    ) {
        this(em, access, names, applications, events, notes, requirements, consultants, clients, capacities, Clock.systemUTC());
    }

    ApplicationQueryService(
        EntityManager em,
        ApplicationAccess access,
        ApplicationNames names,
        TalentApplicationRepository applications,
        TalentApplicationEventRepository events,
        TalentApplicationNoteRepository notes,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerCapacityRepository capacities,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.names = names;
        this.applications = applications;
        this.events = events;
        this.notes = notes;
        this.requirements = requirements;
        this.consultants = consultants;
        this.clients = clients;
        this.capacities = capacities;
        this.clock = clock;
    }

    // ---- query building --------------------------------------------------------------------------------------------------------

    /** The WHERE tail and its parameters. */
    private static final class Where {
        final StringBuilder sql = new StringBuilder();
        final Map<String, Object> params = new LinkedHashMap<>();

        Where and(String clause) {
            sql.append(" and ").append(clause);
            return this;
        }

        Where param(String name, Object value) {
            params.put(name, value);
            return this;
        }
    }

    /** The caller's scope as a clause; {@code null} when the scope reaches nothing at all (an empty list of marketers). */
    private Where scoped(OrgMembership me, ListQuery f) {
        PermissionScope scope = access.requireView(me);
        Where w = new Where().param("orgId", me.orgId());
        Set<Long> visible = access.marketersVisible(me, scope);
        if (visible != null) {
            if (visible.isEmpty()) return null;
            w.and("a.marketerMemberId in :scope").param("scope", visible);
        }
        if (f == null) return w;
        if (f.q() != null && !f.q().isBlank()) {
            String q = f.q().strip().toLowerCase(Locale.ROOT);
            if (q.length() < SEARCH_MIN || q.length() > SEARCH_MAX) throw OrgException.invalid("q", "must be " + SEARCH_MIN + " to " + SEARCH_MAX + " characters");
            w.and(
                "(lower(r.title) like :q escape '!' or lower(c.displayName) like :q escape '!' or lower(cl.name) like :q escape '!' or lower(a.code) like :q escape '!'" +
                " or lower(replace(a.stage, '_', ' ')) like :q escape '!' or lower(coalesce(a.nextAction, '')) like :q escape '!')"
            ).param("q", "%" + escapeLike(q) + "%");
        }
        List<String> stages = parseStages(f.stage());
        if (!stages.isEmpty()) w.and("a.stage in :stages").param("stages", stages);
        if (f.jobTitle() != null && !f.jobTitle().isBlank()) w.and("r.title = :jobTitle").param("jobTitle", f.jobTitle().strip());
        if (f.clientId() != null) w.and("a.clientId = :clientId").param("clientId", f.clientId());
        if (f.marketerId() != null) w.and("a.marketerMemberId = :marketerId").param("marketerId", f.marketerId());
        if (f.from() != null) w.and("a.appliedOn >= :from").param("from", f.from());
        if (f.to() != null) w.and("a.appliedOn <= :to").param("to", f.to());
        return w;
    }

    static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    static List<String> parseStages(List<String> raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) return out;
        for (String part : raw) {
            if (part == null) continue;
            for (String s : part.split(",")) {
                String t = s.strip().toUpperCase(Locale.ROOT);
                if (t.isEmpty()) continue;
                if (!ApplicationStages.valid(t)) throw OrgException.invalid("stage", "unknown stage " + s.strip());
                if (!out.contains(t)) out.add(t);
            }
        }
        return out;
    }

    private static final String STAGE_RANK = "case a.stage when 'ASSIGNED' then 0 when 'SUBMITTED' then 1 when 'UNDER_REVIEW' then 2 when 'INTERVIEWING' then 3 when 'OFFER' then 4 else 5 end";

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
                    case "applied" -> "a.appliedOn";
                    case "job" -> "lower(r.title)";
                    case "consultant" -> "lower(c.displayName)";
                    case "client" -> "lower(cl.name)";
                    case "stage" -> STAGE_RANK;
                    case "nextAction" -> "a.nextActionDue";
                    case "moved" -> "a.stageChangedAt";
                    default -> throw sortInvalid(raw);
                };
                if (out.length() > 0) out.append(", ");
                out.append(expr).append(' ').append(dir);
            }
        }
        if (out.length() == 0) out.append("a.appliedOn desc");
        return " order by " + out + ", a.id desc";
    }

    private static OrgException sortInvalid(String raw) {
        return OrgException.coded(400, "SORT_INVALID", "Sort by applied, job, consultant, client, stage, nextAction or moved (asc or desc): " + raw, Map.of());
    }

    private Query query(String jpql, Where w) {
        Query q = em.createQuery(jpql);
        w.params.forEach(q::setParameter);
        return q;
    }

    // ---- list ------------------------------------------------------------------------------------------------------------------

    public ApplicationDTO.Page list(OrgMembership me, ListQuery f) {
        int size = f.size() == null ? DEFAULT_SIZE : f.size();
        int page = f.page() == null ? 0 : f.page();
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be 1 to " + MAX_SIZE);
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        Where w = scoped(me, f);
        if (w == null) return new ApplicationDTO.Page(List.of(), page, size, 0, false);
        return pageOf(me, w, orderBy(f.sort()), page, size);
    }

    @SuppressWarnings("unchecked")
    private ApplicationDTO.Page pageOf(OrgMembership me, Where w, String order, int page, int size) {
        long total = ((Number) query("select count(a)" + FROM + w.sql, w).getSingleResult()).longValue();
        Query q = query("select a, r, c, cl" + FROM + w.sql + order, w);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        List<Object[]> rows = q.getResultList();
        return new ApplicationDTO.Page(rowsOf(me.orgId(), rows), page, size, total, (long) (page + 1) * size < total);
    }

    private List<ApplicationDTO.Row> rowsOf(Long orgId, List<Object[]> rows) {
        Set<Long> marketerIds = new HashSet<>();
        for (Object[] r : rows) marketerIds.add(((TalentApplication) r[0]).getMarketerMemberId());
        Map<Long, String> who = names.memberNames(orgId, marketerIds);
        LocalDate today = LocalDate.now(clock);
        List<ApplicationDTO.Row> out = new ArrayList<>();
        for (Object[] r : rows) {
            TalentApplication a = (TalentApplication) r[0];
            out.add(row(a, (ClientRequirement) r[1], (ConsultantProfile) r[2], (ClientAccount) r[3], who, today));
        }
        return out;
    }

    private ApplicationDTO.Row row(TalentApplication a, ClientRequirement r, ConsultantProfile c, ClientAccount cl, Map<Long, String> who, LocalDate today) {
        return new ApplicationDTO.Row(
            a.getId(), a.getCode(), r.getId(), r.getTitle(), r.getEmploymentLabel(), consultantRef(c), clientRef(cl), a.getAppliedOn(), a.getStage(), a.getClosedReason(),
            names.marketer(a.getMarketerMemberId(), who), a.getNextAction(), a.getNextActionDue(), overdue(a, today), a.getStageChangedAt()
        );
    }

    static boolean overdue(TalentApplication a, LocalDate today) {
        return a.getNextActionDue() != null && a.getNextActionDue().isBefore(today) && !ApplicationStages.CLOSED.equals(a.getStage());
    }

    static ApplicationDTO.PersonRef consultantRef(ConsultantProfile c) {
        return new ApplicationDTO.PersonRef(c.getId(), c.getDisplayName(), ApplicationNames.initials(c.getDisplayName()), c.getJobTitle());
    }

    static ApplicationDTO.ClientRef clientRef(ClientAccount cl) {
        return new ApplicationDTO.ClientRef(cl.getId(), cl.getName(), clientInitials(cl.getName()), cl.getIndustry());
    }

    /** Up to two letters from the first words of the company name: "Global Media" is GM, "TechCorp" is TE. */
    static String clientInitials(String name) {
        if (name == null || name.isBlank()) return "?";
        String[] parts = name.strip().split("[\\s&/-]+");
        if (parts.length >= 2) return ("" + parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase(Locale.ROOT);
        return parts[0].substring(0, Math.min(2, parts[0].length())).toUpperCase(Locale.ROOT);
    }

    // ---- KPI tiles -------------------------------------------------------------------------------------------------------------

    /** Every state-carrying event of the caller's applications, oldest first per application: {@code [applicationId, type, fromStage, toStage, occurredAt, id]}. */
    @SuppressWarnings("unchecked")
    private List<Object[]> stateEvents(OrgMembership me) {
        PermissionScope scope = access.requireView(me);
        Set<Long> visible = access.marketersVisible(me, scope);
        if (visible != null && visible.isEmpty()) return List.of();
        String jpql = "select e.applicationId, e.eventType, e.fromStage, e.toStage, e.occurredAt, e.id from TalentApplicationEvent e, TalentApplication a" +
            " where e.orgId = :orgId and a.orgId = :orgId and a.id = e.applicationId and e.eventType in :types" +
            (visible == null ? "" : " and a.marketerMemberId in :scope") + " order by e.applicationId, e.occurredAt, e.id";
        Query q = em.createQuery(jpql).setParameter("orgId", me.orgId()).setParameter("types", ApplicationStages.STATE_EVENTS);
        if (visible != null) q.setParameter("scope", visible);
        return q.getResultList();
    }

    /** The stage of every application at each of {@code instants} (an application that did not exist yet is absent). One map per instant. */
    static List<Map<String, Long>> stageCountsAt(List<Object[]> stateEvents, List<Instant> instants) {
        List<Map<String, Long>> out = new ArrayList<>();
        for (int i = 0; i < instants.size(); i++) out.add(new HashMap<>());
        int i = 0;
        while (i < stateEvents.size()) {
            Long app = (Long) stateEvents.get(i)[0];
            int j = i;
            while (j < stateEvents.size() && app.equals(stateEvents.get(j)[0])) j++;
            for (int s = 0; s < instants.size(); s++) {
                String stage = null;
                for (int k = i; k < j; k++) {
                    Instant at = (Instant) stateEvents.get(k)[4];
                    if (at.isAfter(instants.get(s))) break;
                    stage = (String) stateEvents.get(k)[3];
                }
                if (stage != null) out.get(s).merge(stage, 1L, Long::sum);
            }
            i = j;
        }
        return out;
    }

    private static long sum(Map<String, Long> m, String... stages) {
        long n = 0;
        for (String s : stages) n += m.getOrDefault(s, 0L);
        return n;
    }

    private static long all(Map<String, Long> m) {
        return m.values().stream().mapToLong(Long::longValue).sum();
    }

    public ApplicationDTO.Counts counts(OrgMembership me) {
        PermissionScope scope = access.requireView(me);
        Instant now = Instant.now(clock);
        Instant monthAgo = now.minus(Duration.ofDays(MONTH_DAYS));
        List<Instant> instants = new ArrayList<>();
        for (int k = SERIES_POINTS - 1; k >= 0; k--) instants.add(now.minus(Duration.ofDays(7L * k)));
        instants.add(monthAgo);
        List<Map<String, Long>> snaps = stageCountsAt(stateEvents(me), instants);
        Map<String, Long> current = liveStageCounts(me);
        Map<String, Long> then = snaps.get(snaps.size() - 1);
        boolean hasHistory = all(then) > 0;
        List<Map<String, Long>> series = snaps.subList(0, SERIES_POINTS);
        return new ApplicationDTO.Counts(
            now, instants.get(0), scope.name(),
            tile(all(current), hasHistory ? all(then) : null, series.stream().map(ApplicationQueryService::all).toList()),
            tile(sum(current, "SUBMITTED", "UNDER_REVIEW"), hasHistory ? sum(then, "SUBMITTED", "UNDER_REVIEW") : null, series.stream().map(m -> sum(m, "SUBMITTED", "UNDER_REVIEW")).toList()),
            tile(sum(current, "INTERVIEWING"), hasHistory ? sum(then, "INTERVIEWING") : null, series.stream().map(m -> sum(m, "INTERVIEWING")).toList()),
            tile(sum(current, "OFFER"), hasHistory ? sum(then, "OFFER") : null, series.stream().map(m -> sum(m, "OFFER")).toList()),
            current
        );
    }

    private static ApplicationDTO.Tile tile(long value, Long previous, List<Long> series) {
        return ApplicationDTO.Tile.of(value, previous, series);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Long> liveStageCounts(OrgMembership me) {
        Where w = scoped(me, null);
        Map<String, Long> out = new LinkedHashMap<>();
        for (String s : ApplicationStages.ORDER) out.put(s, 0L);
        if (w == null) return out;
        List<Object[]> rows = query("select a.stage, count(a)" + FROM + w.sql + " group by a.stage", w).getResultList();
        for (Object[] r : rows) out.put((String) r[0], ((Number) r[1]).longValue());
        return out;
    }

    // ---- filters and pickers ---------------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public ApplicationDTO.Filters filters(OrgMembership me) {
        Where w = scoped(me, null);
        List<ApplicationDTO.Option> stages = ApplicationStages.ORDER.stream().map(s -> new ApplicationDTO.Option(s, ApplicationStages.label(s))).toList();
        if (w == null) return new ApplicationDTO.Filters(List.of(), List.of(), List.of(), stages);
        List<String> titles = query("select distinct r.title" + FROM + w.sql + " order by r.title", w).getResultList();
        List<Object[]> cls = query("select distinct cl.id, cl.name" + FROM + w.sql + " order by cl.name", w).getResultList();
        List<Long> mids = query("select distinct a.marketerMemberId" + FROM + w.sql + " and a.marketerMemberId is not null", w).getResultList();
        Map<Long, String> who = names.memberNames(me.orgId(), mids);
        List<ApplicationDTO.Option> marketers = mids.stream().map(id -> new ApplicationDTO.Option(String.valueOf(id), who.getOrDefault(id, "Member"))).sorted(java.util.Comparator.comparing(ApplicationDTO.Option::label)).toList();
        return new ApplicationDTO.Filters(
            titles.stream().map(t -> new ApplicationDTO.Option(t, t)).toList(),
            cls.stream().map(c -> new ApplicationDTO.Option(String.valueOf(c[0]), (String) c[1])).toList(),
            marketers,
            stages
        );
    }

    /** Candidates for the Add Application dialog: consultants and jobs the caller may attach, and the marketers it may name. */
    @SuppressWarnings("unchecked")
    public ApplicationDTO.Pickers pickers(OrgMembership me, String kind, String q) {
        PermissionScope scope = access.widest(me, ApplicationAccess.CREATE_KEYS).orElseThrow(OrgNotFoundException::new);
        access.requireWritable(me, ApplicationAccess.CREATE_KEYS);
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (needle.length() > SEARCH_MAX) throw OrgException.invalid("q", "at most " + SEARCH_MAX + " characters");
        String like = "%" + escapeLike(needle) + "%";
        Long orgId = me.orgId();
        if ("consultant".equals(kind)) {
            Set<Long> visible = access.marketersVisible(me, scope);
            StringBuilder jpql = new StringBuilder("select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and lower(c.displayName) like :q escape '!'");
            if (visible != null) jpql.append(" and c.id in (select ma.consultantId from MarketerAssignment ma where ma.orgId = :orgId and ma.marketerMemberId in :scope)");
            jpql.append(" order by c.displayName");
            if (visible != null && visible.isEmpty()) return new ApplicationDTO.Pickers(kind, List.of());
            Query query = em.createQuery(jpql.toString()).setParameter("orgId", orgId).setParameter("q", like).setMaxResults(20);
            if (visible != null) query.setParameter("scope", visible);
            List<ConsultantProfile> rows = query.getResultList();
            return new ApplicationDTO.Pickers(kind, rows.stream().map(c -> new ApplicationDTO.PickerItem(c.getId(), c.getDisplayName(), c.getJobTitle())).toList());
        }
        if ("job".equals(kind)) {
            List<Object[]> rows = em.createQuery(
                "select r, cl.name from ClientRequirement r, ClientAccount cl where r.orgId = :orgId and cl.orgId = :orgId and cl.id = r.clientId and r.status in ('OPEN', 'IN_REVIEW')" +
                " and (lower(r.title) like :q escape '!' or lower(cl.name) like :q escape '!') order by r.title"
            ).setParameter("orgId", orgId).setParameter("q", like).setMaxResults(20).getResultList();
            return new ApplicationDTO.Pickers(kind, rows.stream().map(x -> new ApplicationDTO.PickerItem(((ClientRequirement) x[0]).getId(), ((ClientRequirement) x[0]).getTitle(), (String) x[1])).toList());
        }
        if ("marketer".equals(kind)) {
            var caps = capacities.findByOrgIdAndStatus(orgId, "ACTIVE");
            Map<Long, String> who = names.memberNames(orgId, caps.stream().map(cap -> cap.getMemberId()).toList());
            return new ApplicationDTO.Pickers(
                kind,
                caps.stream().filter(cap -> who.containsKey(cap.getMemberId())).map(cap -> new ApplicationDTO.PickerItem(cap.getMemberId(), who.get(cap.getMemberId()), cap.getTitleLabel()))
                    .filter(p -> p.label().toLowerCase(Locale.ROOT).contains(needle)).sorted(java.util.Comparator.comparing(ApplicationDTO.PickerItem::label)).toList()
            );
        }
        throw OrgException.invalid("kind", "must be consultant, job or marketer");
    }

    // ---- pipeline --------------------------------------------------------------------------------------------------------------

    public ApplicationDTO.Pipeline pipeline(OrgMembership me, ListQuery f) {
        List<ApplicationDTO.Column> columns = new ArrayList<>();
        for (String stage : ApplicationStages.ORDER) {
            ListQuery one = new ListQuery(f.q(), List.of(stage), f.jobTitle(), f.clientId(), f.marketerId(), f.from(), f.to(), List.of("moved,desc"), 0, PIPELINE_CARDS);
            Where w = scoped(me, one);
            if (w == null) {
                columns.add(new ApplicationDTO.Column(stage, ApplicationStages.label(stage), 0, List.of()));
                continue;
            }
            ApplicationDTO.Page p = pageOf(me, w, orderBy(one.sort()), 0, PIPELINE_CARDS);
            columns.add(new ApplicationDTO.Column(stage, ApplicationStages.label(stage), p.total(), p.items()));
        }
        return new ApplicationDTO.Pipeline(columns);
    }

    // ---- analytics -------------------------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public ApplicationDTO.Analytics analytics(OrgMembership me) {
        Where w = scoped(me, null);
        if (w == null) return new ApplicationDTO.Analytics(0, 0, null, List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        Instant now = Instant.now(clock);
        Map<String, Long> live = liveStageCounts(me);
        long total = all(live);
        long open = total - live.getOrDefault("CLOSED", 0L);
        List<ApplicationDTO.Bucket> byStage = ApplicationStages.ORDER.stream().map(s -> new ApplicationDTO.Bucket(s, ApplicationStages.label(s), live.getOrDefault(s, 0L))).toList();

        List<Instant> opened = query("select a.createdAt" + FROM + w.sql + " and a.stage <> 'CLOSED'", w).getResultList();
        Double avg = opened.isEmpty() ? null : Math.round(10.0 * opened.stream().mapToDouble(t -> Duration.between(t, now).toMinutes() / 1440.0).average().orElse(0)) / 10.0;

        List<ApplicationDTO.Bucket> reached = reached(me);

        YearMonth current = YearMonth.from(now.atZone(ZoneOffset.UTC));
        LocalDate first = current.minusMonths(5).atDay(1);
        List<Object[]> monthRows = query("select year(a.appliedOn), month(a.appliedOn), count(a)" + FROM + w.sql + " and a.appliedOn >= :first group by year(a.appliedOn), month(a.appliedOn)", w.param("first", first)).getResultList();
        Map<YearMonth, Long> byMonth = new HashMap<>();
        for (Object[] r : monthRows) byMonth.put(YearMonth.of(((Number) r[0]).intValue(), ((Number) r[1]).intValue()), ((Number) r[2]).longValue());
        List<ApplicationDTO.Bucket> perMonth = new ArrayList<>();
        for (int k = 5; k >= 0; k--) {
            YearMonth ym = current.minusMonths(k);
            perMonth.add(new ApplicationDTO.Bucket(ym.toString(), ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH), byMonth.getOrDefault(ym, 0L)));
        }
        w.params.remove("first");

        List<Object[]> reasonRows = query("select a.closedReason, count(a)" + FROM + w.sql + " and a.stage = 'CLOSED' group by a.closedReason order by count(a) desc", w).getResultList();
        List<ApplicationDTO.Bucket> reasons = reasonRows.stream().map(r -> new ApplicationDTO.Bucket(String.valueOf(r[0]), reasonLabel((String) r[0]), ((Number) r[1]).longValue())).toList();

        Query topQ = query("select cl.name, count(a)" + FROM + w.sql + " group by cl.name order by count(a) desc, cl.name", w).setMaxResults(5);
        List<Object[]> topRows = topQ.getResultList();
        List<ApplicationDTO.Bucket> topClients = topRows.stream().map(r -> new ApplicationDTO.Bucket((String) r[0], (String) r[0], ((Number) r[1]).longValue())).toList();

        List<Object[]> srcRows = query("select coalesce(a.sourceLabel, 'Not recorded'), count(a)" + FROM + w.sql + " group by coalesce(a.sourceLabel, 'Not recorded') order by count(a) desc", w).getResultList();
        List<ApplicationDTO.Bucket> bySource = srcRows.stream().map(r -> new ApplicationDTO.Bucket((String) r[0], (String) r[0], ((Number) r[1]).longValue())).toList();

        List<Object[]> mkRows = query("select a.marketerMemberId, count(a)" + FROM + w.sql + " and a.marketerMemberId is not null group by a.marketerMemberId order by count(a) desc", w).setMaxResults(8).getResultList();
        Map<Long, String> who = names.memberNames(me.orgId(), mkRows.stream().map(r -> (Long) r[0]).toList());
        List<ApplicationDTO.Bucket> byMarketer = mkRows.stream().map(r -> new ApplicationDTO.Bucket(String.valueOf(r[0]), who.getOrDefault((Long) r[0], "Member"), ((Number) r[1]).longValue())).toList();

        return new ApplicationDTO.Analytics(total, open, avg, byStage, reached, perMonth, reasons, topClients, bySource, byMarketer);
    }

    static String reasonLabel(String reason) {
        if (reason == null) return "Not recorded";
        return switch (reason) {
            case "HIRED" -> "Hired";
            case "REJECTED" -> "Rejected";
            case "WITHDRAWN" -> "Withdrawn";
            case "NO_RESPONSE" -> "No response";
            default -> reason;
        };
    }

    /** How many applications ever reached each open stage (a reverted move does not count), plus how many ended Hired. */
    private List<ApplicationDTO.Bucket> reached(OrgMembership me) {
        List<Object[]> evs = stateEvents(me);
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String s : ApplicationStages.ORDER.subList(0, 5)) counts.put(s, 0L);
        int i = 0;
        while (i < evs.size()) {
            Long app = (Long) evs.get(i)[0];
            Set<String> seen = new HashSet<>();
            int j = i;
            while (j < evs.size() && app.equals(evs.get(j)[0])) {
                Object[] e = evs.get(j);
                String type = (String) e[1];
                String to = (String) e[3];
                if (type.equals("STAGE_REVERT") && to != null) seen.removeIf(s -> ApplicationStages.index(s) > ApplicationStages.index(to));
                else if (to != null && !to.equals(ApplicationStages.CLOSED)) seen.add(to);
                j++;
            }
            for (String s : seen) counts.merge(s, 1L, Long::sum);
            i = j;
        }
        List<ApplicationDTO.Bucket> out = new ArrayList<>();
        counts.forEach((k, v) -> out.add(new ApplicationDTO.Bucket(k, ApplicationStages.label(k), v)));
        Where w = scoped(me, null);
        long hired = w == null ? 0 : ((Number) query("select count(a)" + FROM + w.sql + " and a.stage = 'CLOSED' and a.closedReason = 'HIRED'", w).getSingleResult()).longValue();
        out.add(new ApplicationDTO.Bucket("HIRED", "Hired", hired));
        return out;
    }

    // ---- detail ----------------------------------------------------------------------------------------------------------------

    /** The application when the caller may read it (in scope); otherwise the generic 404. */
    public TalentApplication visible(OrgMembership me, Long applicationId) {
        PermissionScope scope = access.requireView(me);
        TalentApplication a = applicationId == null ? null : applications.findByOrgIdAndId(me.orgId(), applicationId).orElse(null);
        if (a == null || !access.covers(me, scope, a.getMarketerMemberId())) throw new OrgNotFoundException();
        return a;
    }

    public ApplicationDTO.Detail detail(OrgMembership me, Long applicationId) {
        TalentApplication a = visible(me, applicationId);
        return detailOf(me, a);
    }

    public ApplicationDTO.Detail detailOf(OrgMembership me, TalentApplication a) {
        Long orgId = me.orgId();
        ClientRequirement r = requirements.findByOrgIdAndId(orgId, a.getRequirementId()).orElseThrow(OrgNotFoundException::new);
        ConsultantProfile c = consultants.findByOrgIdAndId(orgId, a.getConsultantId()).orElseThrow(OrgNotFoundException::new);
        ClientAccount cl = clients.findByOrgIdAndId(orgId, a.getClientId()).orElseThrow(OrgNotFoundException::new);
        List<TalentApplicationEvent> evs = events.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(orgId, a.getId());
        List<TalentApplicationNote> ns = notes.findByOrgIdAndApplicationIdOrderByCreatedAtDesc(orgId, a.getId());
        Set<Long> ids = new HashSet<>();
        ids.add(a.getMarketerMemberId());
        evs.forEach(e -> ids.add(e.getActorMemberId()));
        ns.forEach(n -> ids.add(n.getAuthorMemberId()));
        Map<Long, String> who = names.memberNames(orgId, ids);
        LocalDate today = LocalDate.now(clock);

        List<ApplicationDTO.EventItem> all = evs.stream().map(e -> eventItem(e, who)).toList();
        List<ApplicationDTO.EventItem> timeline = all.stream().filter(e -> ApplicationStages.STATE_EVENTS.contains(e.type())).toList();
        List<ApplicationDTO.EventItem> activity = new ArrayList<>(all);
        java.util.Collections.reverse(activity);
        List<ApplicationDTO.NoteItem> noteItems = ns.stream().map(n -> new ApplicationDTO.NoteItem(n.getId(), names.marketer(n.getAuthorMemberId(), who), n.getBody(), n.getCreatedAt())).toList();

        boolean edit = access.canWrite(me, ApplicationAccess.WRITE_KEYS, a);
        boolean move = edit && !ApplicationStages.CLOSED.equals(a.getStage()) && access.canWrite(me, List.of(ApplicationAccess.KEY_RECORD, ApplicationAccess.KEY_FOLLOWUP, ApplicationAccess.KEY_OFFERS), a);
        boolean reassign = access.canWrite(me, List.of(ApplicationAccess.KEY_REASSIGN), a);
        ApplicationDTO.UndoToken undo = move ? undoToken(me, a, evs) : null;
        boolean mayMove = move;
        return new ApplicationDTO.Detail(
            a.getId(), a.getCode(), r.getId(), r.getTitle(), r.getEmploymentLabel(), consultantRef(c), clientRef(cl), a.getAppliedOn(), a.getStage(), a.getClosedReason(), a.getSourceLabel(),
            names.marketer(a.getMarketerMemberId(), who), a.getNextAction(), a.getNextActionDue(), overdue(a, today), a.getStageChangedAt(),
            steps(a, evs), mayMove ? ApplicationStages.next(a.getStage()) : List.of(), timeline, activity, noteItems, ns.size(),
            new ApplicationDTO.Actions(edit, mayMove, edit, reassign), undo
        );
    }

    private ApplicationDTO.EventItem eventItem(TalentApplicationEvent e, Map<Long, String> who) {
        return new ApplicationDTO.EventItem(e.getId(), e.getEventType(), e.getFromStage(), e.getToStage(), names.marketer(e.getActorMemberId(), who), e.getDetail(), e.getOccurredAt());
    }

    /** The stepper: the first time each stage was recorded (a reverted stage forgets its date), the current stage marked. */
    static List<ApplicationDTO.Step> steps(TalentApplication a, List<TalentApplicationEvent> evs) {
        Map<String, Instant> at = new HashMap<>();
        for (TalentApplicationEvent e : evs) {
            if (e.getToStage() == null) continue;
            String type = e.getEventType();
            if (type.equals("STAGE_REVERT")) {
                int keep = ApplicationStages.index(e.getToStage());
                at.keySet().removeIf(s -> ApplicationStages.index(s) > keep);
            } else if (type.equals("CREATED") || type.equals("STAGE_CHANGE")) {
                at.putIfAbsent(e.getToStage(), e.getOccurredAt());
            }
        }
        int current = ApplicationStages.index(a.getStage());
        List<ApplicationDTO.Step> out = new ArrayList<>();
        for (int i = 0; i < ApplicationStages.ORDER.size(); i++) {
            String s = ApplicationStages.ORDER.get(i);
            String state = i < current ? "DONE" : i == current ? "CURRENT" : "FUTURE";
            if (ApplicationStages.CLOSED.equals(a.getStage()) && i == current) state = "DONE";
            out.add(new ApplicationDTO.Step(s, ApplicationStages.label(s), at.get(s), state));
        }
        return out;
    }

    /** The undo is offered for the caller's own latest stage move, for ten minutes, while no later move has been recorded. */
    private ApplicationDTO.UndoToken undoToken(OrgMembership me, TalentApplication a, List<TalentApplicationEvent> evs) {
        TalentApplicationEvent last = null;
        for (TalentApplicationEvent e : evs) if (ApplicationStages.STATE_EVENTS.contains(e.getEventType())) last = e;
        if (last == null || !last.getEventType().equals("STAGE_CHANGE") || last.getFromStage() == null) return null;
        if (!me.memberId().equals(last.getActorMemberId())) return null;
        Instant expires = last.getOccurredAt().plus(UNDO_WINDOW);
        if (!expires.isAfter(Instant.now(clock))) return null;
        return new ApplicationDTO.UndoToken(last.getId(), expires, last.getFromStage(), last.getToStage());
    }

    /** For tests and the command service. */
    Optional<TalentApplication> find(Long orgId, Long id) {
        return applications.findByOrgIdAndId(orgId, id);
    }
}
