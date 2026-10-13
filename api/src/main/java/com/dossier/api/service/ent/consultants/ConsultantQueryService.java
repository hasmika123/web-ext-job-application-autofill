package com.dossier.api.service.ent.consultants;

import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.org.OrgAuditEvent;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.service.dto.ent.ConsultantDTO;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
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
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Consultants board: the directory (server-side search, filters, sort, paging), the four KPI tiles with honest "vs last month"
 * deltas and weekly sparkline series, the drawer and its three tabs. Every query names the organization first and is narrowed by {@link ConsultantAccess}.
 */
@Service
public class ConsultantQueryService {

    public static final String CODE_FILTER_INVALID = "FILTER_INVALID";
    public static final String CODE_SORT_INVALID = "SORT_INVALID";
    public static final List<String> SORT_FIELDS = List.of("name", "experience", "availability", "license", "profile", "joined");
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    static final int SPARK_WEEKS = 8;
    static final int ACTIVITY_MAX = 50;
    public static final Set<String> AVAILABILITY = Set.of("AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE");
    public static final Set<String> LICENSE = Set.of("ACTIVE", "EXPIRING", "PENDING", "NEEDS_REVIEW");
    public static final Set<String> WORK_MODE = Set.of("REMOTE", "HYBRID", "ONSITE");
    public static final Set<String> STATUS = Set.of("ACTIVE", "INACTIVE");

    /** The list parameters after the controller read them raw. */
    public record ListQuery(
        String q, String availability, String skill, String license, String marketerId, String workMode, String status, Long departmentId,
        List<String> sort, Integer page, Integer size
    ) {}

    private final ConsultantProfileRepository profiles;
    private final OrgAuditEventRepository audit;
    private final ConsultantAccess access;
    private final Clock clock;

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public ConsultantQueryService(ConsultantProfileRepository profiles, OrgAuditEventRepository audit, ConsultantAccess access) {
        this(profiles, audit, access, Clock.systemUTC());
    }

    ConsultantQueryService(ConsultantProfileRepository profiles, OrgAuditEventRepository audit, ConsultantAccess access, Clock clock) {
        this.profiles = profiles;
        this.audit = audit;
        this.access = access;
        this.clock = clock;
    }

    // ---- list -----------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConsultantDTO.Page list(OrgMembership me, ListQuery q) {
        ConsultantAccess.Reach reach = access.reach(me);
        Long orgId = me.orgId();
        int page = q.page() == null ? 0 : q.page();
        int size = q.size() == null ? DEFAULT_SIZE : q.size();
        if (page < 0) throw filter("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw filter("size", "must be between 1 and " + MAX_SIZE);
        String order = parseSort(q.sort());

        Map<String, Object> params = new HashMap<>();
        params.put("orgId", orgId);
        StringBuilder from = new StringBuilder(" from ConsultantProfile c where c.orgId = :orgId");
        String status = q.status() == null || q.status().isBlank() ? "ACTIVE" : q.status().trim().toUpperCase(Locale.ROOT);
        if (!STATUS.contains(status)) throw filter("status", "must be ACTIVE or INACTIVE");
        from.append(" and c.status = :status");
        params.put("status", status);
        from.append(reach.clause("c"));
        reach.bind(params);
        String search = parseSearch(q.q());
        if (search != null) {
            from.append(
                " and (lower(c.displayName) like :q escape '!' or lower(c.email) like :q escape '!' or lower(coalesce(c.jobTitle, '')) like :q escape '!'" +
                " or lower(coalesce(c.locationLabel, '')) like :q escape '!'" +
                " or exists (select 1 from ConsultantSkill qs where qs.orgId = c.orgId and qs.consultantId = c.id and lower(qs.skill) like :q escape '!'))"
            );
            params.put("q", "%" + escapeLike(search.toLowerCase(Locale.ROOT)) + "%");
        }
        if (notBlank(q.availability())) {
            String v = q.availability().trim().toUpperCase(Locale.ROOT);
            if (!AVAILABILITY.contains(v)) throw filter("availability", "unknown value");
            from.append(" and c.availabilityStatus = :availability");
            params.put("availability", v);
        }
        if (notBlank(q.license())) {
            String v = q.license().trim().toUpperCase(Locale.ROOT);
            if (!LICENSE.contains(v)) throw filter("license", "unknown value");
            from.append(" and c.licenseStatus = :license");
            params.put("license", v);
        }
        if (notBlank(q.workMode())) {
            String v = q.workMode().trim().toUpperCase(Locale.ROOT);
            if (!WORK_MODE.contains(v)) throw filter("workMode", "unknown value");
            from.append(" and upper(coalesce(c.workMode, '')) = :workMode");
            params.put("workMode", v);
        }
        if (notBlank(q.skill())) {
            from.append(" and exists (select 1 from ConsultantSkill fs where fs.orgId = c.orgId and fs.consultantId = c.id and lower(fs.skill) = :skill)");
            params.put("skill", q.skill().trim().toLowerCase(Locale.ROOT));
        }
        if (notBlank(q.marketerId())) {
            if ("none".equalsIgnoreCase(q.marketerId().trim())) {
                from.append(" and not exists (select 1 from MarketerAssignment fa where fa.orgId = c.orgId and fa.consultantId = c.id)");
            } else {
                from.append(" and exists (select 1 from MarketerAssignment fa where fa.orgId = c.orgId and fa.consultantId = c.id and fa.marketerMemberId = :marketerId)");
                params.put("marketerId", parseId("marketerId", q.marketerId()));
            }
        }
        if (q.departmentId() != null) {
            from.append(" and c.departmentGroupId = :departmentId");
            params.put("departmentId", q.departmentId());
        }

        TypedQuery<Long> count = em.createQuery("select count(c)" + from, Long.class);
        params.forEach(count::setParameter);
        long total = count.getSingleResult();
        if (total == 0 || (long) page * size >= total) return new ConsultantDTO.Page(List.of(), page, size, total, false);

        TypedQuery<ConsultantProfile> rows = em.createQuery("select c" + from + " order by " + order, ConsultantProfile.class);
        params.forEach(rows::setParameter);
        rows.setFirstResult(page * size);
        rows.setMaxResults(size);
        List<ConsultantDTO.Row> items = rowsOf(orgId, rows.getResultList());
        return new ConsultantDTO.Page(items, page, size, total, (long) (page + 1) * size < total);
    }

    // ---- tiles ----------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConsultantDTO.Counts counts(OrgMembership me) {
        ConsultantAccess.Reach reach = access.reach(me);
        Instant now = Instant.now(clock);
        Instant asOf = now.minus(30, ChronoUnit.DAYS);
        Map<String, Object> params = new HashMap<>();
        params.put("orgId", me.orgId());
        reach.bind(params);
        TypedQuery<Object[]> tq = em.createQuery(
            "select c.availabilityStatus, c.licenseStatus, c.createdAt from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE'" + reach.clause("c"), Object[].class
        );
        params.forEach(tq::setParameter);
        List<Object[]> facts = tq.getResultList();
        // a baseline exists only when somebody joined more than 30 days ago: otherwise "last month" is unknowable and the deltas are null
        boolean baseline = facts.stream().anyMatch(f -> ((Instant) f[2]).isBefore(asOf));
        ConsultantDTO.Tile total = tile(facts, f -> true, now, asOf, baseline);
        ConsultantDTO.Tile available = tile(facts, f -> "AVAILABLE".equals(f[0]), now, asOf, baseline);
        ConsultantDTO.Tile onProject = tile(facts, f -> "ON_PROJECT".equals(f[0]), now, asOf, baseline);
        ConsultantDTO.Tile review = tile(facts, f -> "NEEDS_REVIEW".equals(f[1]), now, asOf, baseline);
        return new ConsultantDTO.Counts(asOf, reach.all() ? "ORG" : reach.scope().name(), total, available, onProject, review);
    }

    private static ConsultantDTO.Tile tile(List<Object[]> facts, Predicate<Object[]> match, Instant now, Instant asOf, boolean baseline) {
        List<Instant> created = new ArrayList<>();
        for (Object[] f : facts) if (match.test(f)) created.add((Instant) f[2]);
        long value = created.size();
        long previous = created.stream().filter(c -> c.isBefore(asOf)).count();
        List<Long> series = new ArrayList<>();
        for (int w = SPARK_WEEKS - 1; w >= 0; w--) {
            Instant end = now.minus(7L * w, ChronoUnit.DAYS);
            series.add(created.stream().filter(c -> !c.isAfter(end)).count());
        }
        return ConsultantDTO.Tile.of(value, baseline ? previous : null, series);
    }

    // ---- detail ---------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConsultantDTO.Detail detail(OrgMembership me, Long id) {
        ConsultantProfile c = visible(me, id);
        Long orgId = me.orgId();
        ConsultantDTO.Row row = rowsOf(orgId, List.of(c)).get(0);
        List<ConsultantSkill> skills = orderedSkills(orgId, c.getId());
        MarketerAssignment a = assignmentRow(orgId, c.getId());
        Set<Long> seats = new LinkedHashSet<>();
        if (a != null) {
            seats.add(a.getMarketerMemberId());
            if (a.getBackupMemberId() != null) seats.add(a.getBackupMemberId());
        }
        ConsultantDTO.AssignmentInfo assignment = assignmentOf(a, namesOf(orgId, seats));
        long resumes = count("select count(r) from OrgResume r where r.orgId = :o and r.consultantId = :c", orgId, c.getId());
        long apps = count("select count(a) from TalentApplication a where a.orgId = :o and a.consultantId = :c", orgId, c.getId());
        long upcoming = em.createQuery(
            "select count(i) from TalentInterview i where i.orgId = :o and i.consultantId = :c and i.status = 'SCHEDULED' and i.scheduledAt > :now", Long.class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setParameter("now", Instant.now(clock)).getSingleResult();
        ConsultantDTO.GroupRef dept = null;
        if (c.getDepartmentGroupId() != null) {
            List<String> n = em.createQuery("select g.name from OrgGroup g where g.orgId = :o and g.id = :g", String.class)
                .setParameter("o", orgId).setParameter("g", c.getDepartmentGroupId()).getResultList();
            if (!n.isEmpty()) dept = new ConsultantDTO.GroupRef(c.getDepartmentGroupId(), n.get(0));
        }
        boolean active = "ACTIVE".equals(c.getStatus());
        boolean canEdit = access.holds(me, ConsultantAccess.EDIT);
        ConsultantDTO.Actions actions = new ConsultantDTO.Actions(
            canEdit && active,
            access.holds(me, ConsultantAccess.ASSIGN) && active,
            canEdit && active,
            canEdit && !active,
            access.holds(me, ConsultantAccess.OPPORTUNITIES) && active
        );
        ConsultantDTO.Checklist checklist = new ConsultantDTO.Checklist(true, !skills.isEmpty(), resumes > 0, c.isHasCertifications(), c.isHasPreferences());
        return new ConsultantDTO.Detail(
            row, c.getMemberId(), c.getHeadline(), skills.stream().map(s -> new ConsultantDTO.Skill(s.getSkill(), s.isPrimarySkill())).toList(),
            c.getAvailabilitySince(), c.getMarketingStatus(), dept, assignment, checklist, (int) apps, (int) upcoming, (int) resumes, actions, versionOf(c)
        );
    }

    /** The weak ETag of a consultant: the instant of its last change (what PATCH expects as If-Match). */
    public static String versionOf(ConsultantProfile c) {
        Instant t = c.getUpdatedAt();
        return "W/\"" + t.getEpochSecond() + "-" + t.getNano() + "\"";
    }

    @Transactional(readOnly = true)
    public ConsultantDTO.Assignments assignments(OrgMembership me, Long id) {
        ConsultantProfile c = visible(me, id);
        Long orgId = me.orgId();
        MarketerAssignment a = assignmentRow(orgId, c.getId());
        Set<Long> seats = new LinkedHashSet<>();
        if (a != null) {
            seats.add(a.getMarketerMemberId());
            if (a.getBackupMemberId() != null) seats.add(a.getBackupMemberId());
        }
        ConsultantDTO.AssignmentInfo info = assignmentOf(a, namesOf(orgId, seats));
        List<Object[]> jobs = em.createQuery(
            "select r.id, r.title, k.name, r.status, m.score, m.assignedAt from RequirementMatch m, ClientRequirement r, ClientAccount k " +
                "where m.orgId = :o and m.consultantId = :c and m.status = 'ASSIGNED' and r.orgId = m.orgId and r.id = m.requirementId and k.orgId = r.orgId and k.id = r.clientId " +
                "order by m.assignedAt desc", Object[].class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setMaxResults(50).getResultList();
        List<ConsultantDTO.JobAssignment> jobItems = new ArrayList<>();
        for (Object[] j : jobs) jobItems.add(new ConsultantDTO.JobAssignment((Long) j[0], (String) j[1], (String) j[2], (String) j[3], (Integer) j[4], (Instant) j[5]));
        List<Object[]> pl = em.createQuery(
            "select p.id, p.roleTitle, k.name, p.status, p.startDate, p.endDate from TalentPlacement p, ClientAccount k " +
                "where p.orgId = :o and p.consultantId = :c and k.orgId = p.orgId and k.id = p.clientId order by p.startDate desc", Object[].class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setMaxResults(20).getResultList();
        List<ConsultantDTO.PlacementItem> placements = new ArrayList<>();
        for (Object[] p : pl) placements.add(new ConsultantDTO.PlacementItem((Long) p[0], (String) p[1], (String) p[2], (String) p[3], (LocalDate) p[4], (LocalDate) p[5]));
        return new ConsultantDTO.Assignments(info, jobItems, placements);
    }

    @Transactional(readOnly = true)
    public ConsultantDTO.Applications applications(OrgMembership me, Long id) {
        ConsultantProfile c = visible(me, id);
        Long orgId = me.orgId();
        List<Object[]> rows = em.createQuery(
            "select a.id, a.code, r.title, k.name, a.stage, a.closedReason, a.appliedOn, a.nextAction, a.nextActionDue, a.stageChangedAt " +
                "from TalentApplication a, ClientRequirement r, ClientAccount k where a.orgId = :o and a.consultantId = :c and r.orgId = a.orgId and r.id = a.requirementId " +
                "and k.orgId = a.orgId and k.id = a.clientId order by a.stageChangedAt desc", Object[].class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setMaxResults(50).getResultList();
        List<ConsultantDTO.ApplicationItem> items = new ArrayList<>();
        for (Object[] r : rows) {
            items.add(new ConsultantDTO.ApplicationItem(
                (Long) r[0], (String) r[1], (String) r[2], (String) r[3], (String) r[4], (String) r[5], (LocalDate) r[6], (String) r[7], (LocalDate) r[8], (Instant) r[9]
            ));
        }
        List<Object[]> iv = em.createQuery(
            "select i.id, k.name, i.scheduledAt, i.durationMinutes, i.roundLabel, i.status from TalentInterview i, ClientAccount k " +
                "where i.orgId = :o and i.consultantId = :c and i.status = 'SCHEDULED' and i.scheduledAt > :now and k.orgId = i.orgId and k.id = i.clientId order by i.scheduledAt asc", Object[].class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setParameter("now", Instant.now(clock)).setMaxResults(10).getResultList();
        List<ConsultantDTO.InterviewItem> interviews = new ArrayList<>();
        for (Object[] r : iv) interviews.add(new ConsultantDTO.InterviewItem((Long) r[0], (String) r[1], (Instant) r[2], (Integer) r[3], (String) r[4], (String) r[5]));
        return new ConsultantDTO.Applications(items, interviews);
    }

    @Transactional(readOnly = true)
    public ConsultantDTO.Activity activity(OrgMembership me, Long id, Integer limit) {
        ConsultantProfile c = visible(me, id);
        Long orgId = me.orgId();
        int max = limit == null ? 20 : Math.min(Math.max(limit, 1), ACTIVITY_MAX);
        List<Object[]> ev = em.createQuery(
            "select e.occurredAt, e.actorMemberId, e.eventType, a.code, r.title, e.fromStage, e.toStage, e.detail from TalentApplicationEvent e, TalentApplication a, ClientRequirement r " +
                "where e.orgId = :o and a.orgId = e.orgId and a.id = e.applicationId and a.consultantId = :c and r.orgId = a.orgId and r.id = a.requirementId order by e.occurredAt desc", Object[].class
        ).setParameter("o", orgId).setParameter("c", c.getId()).setMaxResults(max).getResultList();
        Set<Long> actors = new LinkedHashSet<>();
        for (Object[] e : ev) if (e[1] != null) actors.add((Long) e[1]);
        List<OrgAuditEvent> rows = access.holds(me, "audit.view")
            ? audit.findByOrgIdAndTargetTypeAndTargetId(orgId, "CONSULTANT", String.valueOf(c.getId()), PageRequest.of(0, max, Sort.by(Sort.Direction.DESC, "createdAt"))).getContent()
            : List.of();
        Map<Long, String> names = namesOf(orgId, actors);
        List<ConsultantDTO.ActivityItem> items = new ArrayList<>();
        for (Object[] e : ev) {
            items.add(new ConsultantDTO.ActivityItem(
                "APPLICATION", (Instant) e[0], e[1] == null ? null : names.get((Long) e[1]), (String) e[2], (String) e[3], (String) e[4], (String) e[5], (String) e[6], (String) e[7]
            ));
        }
        for (OrgAuditEvent a : rows) items.add(new ConsultantDTO.ActivityItem("AUDIT", a.getCreatedAt(), a.getActorLogin(), a.getAction(), null, null, null, null, a.getDetails()));
        items.sort(Comparator.comparing(ConsultantDTO.ActivityItem::at).reversed());
        return new ConsultantDTO.Activity(items.size() > max ? new ArrayList<>(items.subList(0, max)) : items);
    }

    // ---- pickers --------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ConsultantDTO.Filters filters(OrgMembership me) {
        ConsultantAccess.Reach reach = access.reach(me);
        Long orgId = me.orgId();
        Map<String, Object> params = new HashMap<>();
        params.put("orgId", orgId);
        reach.bind(params);
        TypedQuery<String> sq = em.createQuery(
            "select distinct s.skill from ConsultantSkill s, ConsultantProfile c where s.orgId = :orgId and c.orgId = s.orgId and c.id = s.consultantId and c.status = 'ACTIVE'" + reach.clause("c"), String.class
        );
        params.forEach(sq::setParameter);
        List<String> skills = new ArrayList<>(new TreeSet<>(sq.getResultList()));
        List<Object[]> caps = em.createQuery("select k.memberId, k.capacity, k.status from MarketerCapacity k where k.orgId = :o", Object[].class).setParameter("o", orgId).getResultList();
        Map<Long, Long> load = new HashMap<>();
        for (Object[] l : em.createQuery("select a.marketerMemberId, count(a) from MarketerAssignment a where a.orgId = :o group by a.marketerMemberId", Object[].class).setParameter("o", orgId).getResultList()) {
            load.put((Long) l[0], (Long) l[1]);
        }
        Map<Long, String> names = namesOf(orgId, caps.stream().map(k -> (Long) k[0]).toList());
        List<ConsultantDTO.MarketerOption> marketers = new ArrayList<>();
        for (Object[] k : caps) {
            Long mid = (Long) k[0];
            if (!names.containsKey(mid)) continue; // a seat that no longer exists
            marketers.add(new ConsultantDTO.MarketerOption(mid, names.get(mid), load.getOrDefault(mid, 0L), (Integer) k[1], (String) k[2]));
        }
        marketers.sort(Comparator.comparing(ConsultantDTO.MarketerOption::name, String.CASE_INSENSITIVE_ORDER));
        List<ConsultantDTO.GroupRef> departments = new ArrayList<>();
        for (Object[] g : em.createQuery(
            "select g.id, g.name from OrgGroup g where g.orgId = :o and g.kind = com.dossier.api.domain.enumeration.OrgGroupKind.DEPARTMENT order by g.name", Object[].class
        ).setParameter("o", orgId).getResultList()) {
            departments.add(new ConsultantDTO.GroupRef((Long) g[0], (String) g[1]));
        }
        return new ConsultantDTO.Filters(skills, marketers, departments);
    }

    // ---- shared ---------------------------------------------------------------------------------------------------------------

    /** The consultant when it exists in THIS organization and the caller's reach covers it; the generic 404 otherwise. */
    ConsultantProfile visible(OrgMembership me, Long id) {
        ConsultantAccess.Reach reach = access.reach(me);
        ConsultantProfile c = profiles.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!reach.all()) {
            Map<String, Object> params = new HashMap<>();
            params.put("orgId", me.orgId());
            params.put("id", id);
            reach.bind(params);
            TypedQuery<Long> q = em.createQuery("select count(c) from ConsultantProfile c where c.orgId = :orgId and c.id = :id" + reach.clause("c"), Long.class);
            params.forEach(q::setParameter);
            if (q.getSingleResult() == 0) throw new OrgNotFoundException();
        }
        return c;
    }

    MarketerAssignment assignmentRow(Long orgId, Long consultantId) {
        List<MarketerAssignment> as = em.createQuery("select a from MarketerAssignment a where a.orgId = :o and a.consultantId = :c", MarketerAssignment.class)
            .setParameter("o", orgId).setParameter("c", consultantId).getResultList();
        return as.isEmpty() ? null : as.get(0);
    }

    List<ConsultantSkill> orderedSkills(Long orgId, Long consultantId) {
        return em.createQuery("select s from ConsultantSkill s where s.orgId = :o and s.consultantId = :c order by s.primarySkill desc, s.sortOrder asc, s.skill asc", ConsultantSkill.class)
            .setParameter("o", orgId).setParameter("c", consultantId).getResultList();
    }

    /** The table rows of these profiles, with their skills, marketer, open applications and next interview loaded in a few batch queries. */
    List<ConsultantDTO.Row> rowsOf(Long orgId, List<ConsultantProfile> list) {
        if (list.isEmpty()) return List.of();
        List<Long> ids = list.stream().map(ConsultantProfile::getId).toList();
        Map<Long, List<ConsultantSkill>> skills = new HashMap<>();
        for (ConsultantSkill s : em.createQuery(
            "select s from ConsultantSkill s where s.orgId = :o and s.consultantId in :ids order by s.primarySkill desc, s.sortOrder asc, s.skill asc", ConsultantSkill.class
        ).setParameter("o", orgId).setParameter("ids", ids).getResultList()) {
            skills.computeIfAbsent(s.getConsultantId(), k -> new ArrayList<>()).add(s);
        }
        Map<Long, Long> marketerOf = new HashMap<>();
        for (Object[] a : em.createQuery("select a.consultantId, a.marketerMemberId from MarketerAssignment a where a.orgId = :o and a.consultantId in :ids", Object[].class)
            .setParameter("o", orgId).setParameter("ids", ids).getResultList()) {
            marketerOf.put((Long) a[0], (Long) a[1]);
        }
        Map<Long, Long> apps = new HashMap<>();
        for (Object[] a : em.createQuery(
            "select a.consultantId, count(a) from TalentApplication a where a.orgId = :o and a.consultantId in :ids and a.stage <> 'CLOSED' group by a.consultantId", Object[].class
        ).setParameter("o", orgId).setParameter("ids", ids).getResultList()) {
            apps.put((Long) a[0], (Long) a[1]);
        }
        Map<Long, ConsultantDTO.NextInterview> next = new HashMap<>();
        for (Object[] i : em.createQuery(
            "select i.consultantId, i.scheduledAt, i.roundLabel from TalentInterview i where i.orgId = :o and i.consultantId in :ids and i.status = 'SCHEDULED' and i.scheduledAt > :now order by i.scheduledAt asc", Object[].class
        ).setParameter("o", orgId).setParameter("ids", ids).setParameter("now", Instant.now(clock)).getResultList()) {
            next.putIfAbsent((Long) i[0], new ConsultantDTO.NextInterview((Instant) i[1], (String) i[2]));
        }
        Map<Long, String> names = namesOf(orgId, new LinkedHashSet<>(marketerOf.values()));
        List<ConsultantDTO.Row> out = new ArrayList<>();
        for (ConsultantProfile c : list) {
            List<ConsultantSkill> sk = skills.getOrDefault(c.getId(), List.of());
            List<String> primary = sk.stream().filter(ConsultantSkill::isPrimarySkill).map(ConsultantSkill::getSkill).limit(3).toList();
            Long mid = marketerOf.get(c.getId());
            out.add(new ConsultantDTO.Row(
                c.getId(), c.getDisplayName(), c.getEmail(), c.getJobTitle(), primary, sk.size(), c.getYearsExperience(), c.getLocationLabel(), c.getWorkMode(),
                mid == null ? null : new ConsultantDTO.PersonRef(mid, names.getOrDefault(mid, "Unknown")), c.getAvailabilityStatus(), c.getAvailableFrom(), c.getLicenseStatus(),
                c.getLicenseValidUntil(), c.getProfileCompleteness(), apps.getOrDefault(c.getId(), 0L).intValue(), next.get(c.getId()), c.getStatus(), c.getCreatedAt()
            ));
        }
        return out;
    }

    ConsultantDTO.AssignmentInfo assignmentOf(MarketerAssignment a, Map<Long, String> names) {
        if (a == null) return null;
        return new ConsultantDTO.AssignmentInfo(
            new ConsultantDTO.PersonRef(a.getMarketerMemberId(), names.getOrDefault(a.getMarketerMemberId(), "Unknown")),
            a.getBackupMemberId() == null ? null : new ConsultantDTO.PersonRef(a.getBackupMemberId(), names.getOrDefault(a.getBackupMemberId(), "Unknown")),
            a.getPriority(), a.getStatus(), a.getAssignedAt()
        );
    }

    /** Display names of seats of this organization (the account's name, else the seat's label, else the invited address). */
    Map<Long, String> namesOf(Long orgId, Collection<Long> ids) {
        Map<Long, String> out = new LinkedHashMap<>();
        if (ids.isEmpty()) return out;
        for (Object[] r : em.createQuery(
            "select m.id, u.firstName, u.lastName, m.displayLabel, m.inviteEmail from OrgMember m left join User u on u.id = m.userId where m.orgId = :o and m.id in :ids", Object[].class
        ).setParameter("o", orgId).setParameter("ids", ids).getResultList()) {
            String name = ((r[1] == null ? "" : r[1]) + " " + (r[2] == null ? "" : r[2])).trim();
            if (name.isEmpty()) name = r[3] != null ? (String) r[3] : r[4] != null ? (String) r[4] : "Member";
            out.put((Long) r[0], name);
        }
        return out;
    }

    private long count(String jpql, Long orgId, Long consultantId) {
        return em.createQuery(jpql, Long.class).setParameter("o", orgId).setParameter("c", consultantId).getSingleResult();
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String parseSearch(String q) {
        if (q == null || q.isBlank()) return null;
        String t = q.strip();
        if (t.length() < 2 || t.length() > 80) throw filter("q", "must be 2 to 80 characters");
        return t;
    }

    private static Long parseId(String field, String raw) {
        try {
            long v = Long.parseLong(raw.trim());
            if (v <= 0) throw new NumberFormatException();
            return v;
        } catch (NumberFormatException e) {
            throw filter(field, "must be an id");
        }
    }

    private static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    /** {@code sort=field,dir} (repeatable); the id is always the last tie-break so paging is stable. */
    private static String parseSort(List<String> sort) {
        List<String> parts = new ArrayList<>();
        List<String> wanted = sort == null || sort.isEmpty() ? List.of("name,asc") : sort;
        for (String s : wanted) {
            String[] kv = s.split(",", 2);
            String field = kv[0].trim();
            String dir = kv.length > 1 ? kv[1].trim().toLowerCase(Locale.ROOT) : "asc";
            if (!SORT_FIELDS.contains(field) || !(dir.equals("asc") || dir.equals("desc"))) {
                throw OrgException.coded(400, CODE_SORT_INVALID, "Sort by one of " + String.join(", ", SORT_FIELDS) + " (asc or desc)", Map.of());
            }
            String col = switch (field) {
                case "name" -> "lower(c.displayName)";
                case "experience" -> "coalesce(c.yearsExperience, -1)";
                case "availability" -> "c.availabilityStatus";
                case "license" -> "c.licenseStatus";
                case "profile" -> "c.profileCompleteness";
                default -> "c.createdAt";
            };
            parts.add(col + " " + dir);
        }
        parts.add("c.id asc");
        return String.join(", ", parts);
    }

    private static OrgException filter(String field, String message) {
        return OrgException.coded(400, CODE_FILTER_INVALID, field + ": " + message, Map.of("field", field));
    }
}
