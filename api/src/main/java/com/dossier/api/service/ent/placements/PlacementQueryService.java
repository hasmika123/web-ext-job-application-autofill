package com.dossier.api.service.ent.placements;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.PlacementEvent;
import com.dossier.api.domain.ent.talent.PlacementExtension;
import com.dossier.api.domain.ent.talent.PlacementNote;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.PlacementEventRepository;
import com.dossier.api.repository.ent.talent.PlacementExtensionRepository;
import com.dossier.api.repository.ent.talent.PlacementNoteRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.dto.ent.PlacementDTO;
import com.dossier.api.service.ent.applications.ApplicationNames;
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
import java.time.temporal.ChronoUnit;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Placements board: table, KPI tiles with real month-over-month deltas and weekly sparklines, tab counts, filter options,
 * pickers and the detail drawer. Everything starts from {@code p.orgId = :orgId} and is narrowed to the caller's scope; a row outside the scope
 * is the same generic 404 as a row of another tenant. A figure with no history behind it is null, never an estimate.
 */
@Service("entPlacementQueryService")
@Transactional(readOnly = true)
public class PlacementQueryService {

    static final int SEARCH_MIN = 2;
    static final int SEARCH_MAX = 80;
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    static final int SERIES_POINTS = 8;
    static final int MONTH_DAYS = 30;
    static final Duration UNDO_WINDOW = Duration.ofMinutes(10);
    public static final Set<String> TABS = Set.of("active", "upcoming", "completed", "extensions");

    private static final String FROM =
        " from TalentPlacement p, ConsultantProfile c, ClientAccount cl where p.orgId = :orgId and c.orgId = :orgId and c.id = p.consultantId" +
        " and cl.orgId = :orgId and cl.id = p.clientId";
    private static final String PENDING_EXT =
        "exists (select 1 from PlacementExtension x where x.orgId = :orgId and x.placementId = p.id and x.status = 'REQUESTED')";

    public record ListQuery(
        String tab, String q, Long clientId, String role, List<String> status, Long managerId, String type,
        LocalDate startFrom, LocalDate startTo, LocalDate endFrom, LocalDate endTo, List<String> sort, Integer page, Integer size
    ) {}

    private final EntityManager em;
    private final PlacementAccess access;
    private final PlacementSettings settings;
    private final ApplicationNames names;
    private final TalentPlacementRepository placements;
    private final PlacementExtensionRepository extensions;
    private final PlacementNoteRepository notes;
    private final PlacementEventRepository events;
    private final ClientContactRepository contacts;
    private final Clock clock;

    @Autowired
    public PlacementQueryService(
        EntityManager em,
        PlacementAccess access,
        PlacementSettings settings,
        ApplicationNames names,
        TalentPlacementRepository placements,
        PlacementExtensionRepository extensions,
        PlacementNoteRepository notes,
        PlacementEventRepository events,
        ClientContactRepository contacts
    ) {
        this(em, access, settings, names, placements, extensions, notes, events, contacts, Clock.systemUTC());
    }

    PlacementQueryService(
        EntityManager em,
        PlacementAccess access,
        PlacementSettings settings,
        ApplicationNames names,
        TalentPlacementRepository placements,
        PlacementExtensionRepository extensions,
        PlacementNoteRepository notes,
        PlacementEventRepository events,
        ClientContactRepository contacts,
        Clock clock
    ) {
        this.em = em;
        this.access = access;
        this.settings = settings;
        this.names = names;
        this.placements = placements;
        this.extensions = extensions;
        this.notes = notes;
        this.events = events;
        this.contacts = contacts;
        this.clock = clock;
    }

    LocalDate today() {
        return LocalDate.now(clock);
    }

    // ---- query building --------------------------------------------------------------------------------------------------------

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

    private static String tabClause(String tab) {
        return switch (tab) {
            case "active" -> "p.status <> 'ENDED' and p.startDate <= :today";
            case "upcoming" -> "p.status <> 'ENDED' and p.startDate > :today";
            case "completed" -> "p.status = 'ENDED'";
            case "extensions" -> "p.status <> 'ENDED' and " + PENDING_EXT;
            default -> throw OrgException.invalid("tab", "must be active, upcoming, completed or extensions");
        };
    }

    /** The caller's scope as a clause; {@code null} when the scope reaches nothing at all (an empty list of managers). */
    private Where scoped(OrgMembership me, ListQuery f) {
        PermissionScope scope = access.requireView(me);
        LocalDate today = today();
        Where w = new Where().param("orgId", me.orgId()).param("today", today);
        Set<Long> visible = access.managersVisible(me, scope);
        if (visible != null) {
            if (visible.isEmpty()) return null;
            w.and("p.accountManagerMemberId in :scope").param("scope", visible);
        }
        if (f == null) return w;
        if (f.tab() != null && !f.tab().isBlank()) {
            if (!TABS.contains(f.tab())) throw OrgException.invalid("tab", "must be active, upcoming, completed or extensions");
            w.and(tabClause(f.tab()));
        }
        if (f.q() != null && !f.q().isBlank()) {
            String q = f.q().strip().toLowerCase(Locale.ROOT);
            if (q.length() < SEARCH_MIN || q.length() > SEARCH_MAX) throw OrgException.invalid("q", "must be " + SEARCH_MIN + " to " + SEARCH_MAX + " characters");
            w.and(
                "(lower(c.displayName) like :q escape '!' or lower(cl.name) like :q escape '!' or lower(p.roleTitle) like :q escape '!'" +
                " or exists (select 1 from ConsultantSkill s where s.orgId = :orgId and s.consultantId = c.id and lower(s.skill) like :q escape '!'))"
            ).param("q", "%" + escapeLike(q) + "%");
        }
        if (f.clientId() != null) w.and("p.clientId = :clientId").param("clientId", f.clientId());
        if (f.role() != null && !f.role().isBlank()) w.and("p.roleTitle = :role").param("role", f.role().strip());
        if (f.managerId() != null) w.and("p.accountManagerMemberId = :managerId").param("managerId", f.managerId());
        if (f.type() != null && !f.type().isBlank()) {
            String t = f.type().strip().toUpperCase(Locale.ROOT);
            if (!PlacementRules.TYPES.contains(t)) throw OrgException.invalid("type", "must be CONTRACT, FTE or C2C");
            w.and("p.placementType = :type").param("type", t);
        }
        if (f.startFrom() != null) w.and("p.startDate >= :startFrom").param("startFrom", f.startFrom());
        if (f.startTo() != null) w.and("p.startDate <= :startTo").param("startTo", f.startTo());
        if (f.endFrom() != null) w.and("p.endDate >= :endFrom").param("endFrom", f.endFrom());
        if (f.endTo() != null) w.and("p.endDate <= :endTo").param("endTo", f.endTo());
        List<String> statuses = parseStatuses(f.status());
        for (String s : statuses) {
            switch (s) {
                case "ACTIVE" -> w.and(tabClause("active"));
                case "UPCOMING" -> w.and(tabClause("upcoming"));
                case "COMPLETED" -> w.and(tabClause("completed"));
                case "EXTENSION_REQUESTED" -> w.and(PENDING_EXT);
                case "IN_POOL" -> w.and("p.redeploymentPool = true");
                case "ENDING_SOON" -> w.and("p.status <> 'ENDED' and p.startDate <= :today and p.endDate is not null and p.endDate <= :soon").param("soon", today.plusDays(settings.endingSoonDays(me.orgId())));
                default -> throw OrgException.invalid("status", "unknown status " + s);
            }
        }
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
                String t = s.strip().toUpperCase(Locale.ROOT);
                if (t.isEmpty()) continue;
                if (!PlacementRules.STATUS_FILTERS.contains(t)) throw OrgException.invalid("status", "unknown status " + s.strip());
                if (!out.contains(t)) out.add(t);
            }
        }
        return out;
    }

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
                    case "end" -> "p.endDate";
                    case "start" -> "p.startDate";
                    case "consultant" -> "lower(c.displayName)";
                    case "client" -> "lower(cl.name)";
                    case "role" -> "lower(p.roleTitle)";
                    case "rate" -> "coalesce(p.billRateMinor, 0)";
                    default -> throw sortInvalid(raw);
                };
                if (out.length() > 0) out.append(", ");
                if (key.equals("end")) out.append("case when p.endDate is null then 1 else 0 end, p.endDate ").append(dir);
                else out.append(expr).append(' ').append(dir);
            }
        }
        if (out.length() == 0) out.append("case when p.endDate is null then 1 else 0 end, p.endDate asc");
        return " order by " + out + ", p.id desc";
    }

    private static OrgException sortInvalid(String raw) {
        return OrgException.coded(400, "SORT_INVALID", "Sort by end, start, consultant, client, role or rate (asc or desc): " + raw, Map.of());
    }

    private Query query(String jpql, Where w) {
        Query q = em.createQuery(jpql);
        w.params.forEach((k, v) -> {
            if (jpql.contains(":" + k)) q.setParameter(k, v);
        });
        return q;
    }

    // ---- list ------------------------------------------------------------------------------------------------------------------

    public PlacementDTO.Page list(OrgMembership me, ListQuery f) {
        int size = f.size() == null ? DEFAULT_SIZE : f.size();
        int page = f.page() == null ? 0 : f.page();
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be 1 to " + MAX_SIZE);
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        Where w = scoped(me, f);
        if (w == null) return new PlacementDTO.Page(List.of(), page, size, 0, false);
        return pageOf(me, w, orderBy(f.sort()), page, size);
    }

    @SuppressWarnings("unchecked")
    private PlacementDTO.Page pageOf(OrgMembership me, Where w, String order, int page, int size) {
        long total = ((Number) query("select count(p)" + FROM + w.sql, w).getSingleResult()).longValue();
        Query q = query("select p, c, cl" + FROM + w.sql + order, w);
        q.setFirstResult(page * size);
        q.setMaxResults(size);
        List<Object[]> rows = q.getResultList();
        return new PlacementDTO.Page(rowsOf(me, rows), page, size, total, (long) (page + 1) * size < total);
    }

    private List<PlacementDTO.Row> rowsOf(OrgMembership me, List<Object[]> rows) {
        Long orgId = me.orgId();
        Set<Long> managerIds = new HashSet<>();
        List<Long> ids = new ArrayList<>();
        for (Object[] r : rows) {
            TalentPlacement p = (TalentPlacement) r[0];
            managerIds.add(p.getAccountManagerMemberId());
            ids.add(p.getId());
        }
        Map<Long, String> who = names.memberNames(orgId, managerIds);
        Set<Long> pending = pendingIds(orgId, ids);
        boolean rates = access.seesRates(me);
        LocalDate today = today();
        List<PlacementDTO.Row> out = new ArrayList<>();
        for (Object[] r : rows) out.add(row((TalentPlacement) r[0], (ConsultantProfile) r[1], (ClientAccount) r[2], who, pending, rates, today, me.orgId()));
        return out;
    }

    @SuppressWarnings("unchecked")
    private Set<Long> pendingIds(Long orgId, Collection<Long> ids) {
        if (ids.isEmpty()) return Set.of();
        List<Long> found = em.createQuery("select x.placementId from PlacementExtension x where x.orgId = :o and x.status = 'REQUESTED' and x.placementId in :ids")
            .setParameter("o", orgId).setParameter("ids", ids).getResultList();
        return new HashSet<>(found);
    }

    private PlacementDTO.Row row(TalentPlacement p, ConsultantProfile c, ClientAccount cl, Map<Long, String> who, Set<Long> pending, boolean rates, LocalDate today, Long orgId) {
        String eff = PlacementRules.effectiveStatus(p.getStatus(), p.getStartDate(), today);
        boolean ext = pending.contains(p.getId());
        PlacementDTO.NextAction next = PlacementRules.nextAction(eff, p.getStartDate(), p.getEndDate(), p.isRedeploymentPool(), ext, today, settings.endingSoonDays(orgId), settings.endingUrgentDays(orgId), settings.startingSoonDays(orgId));
        return new PlacementDTO.Row(
            p.getId(), consultantRef(c), clientRef(cl), p.getRoleTitle(), p.getPlacementType(), p.getStartDate(), p.getEndDate(), member(p.getAccountManagerMemberId(), who), PlacementRules.displayStatus(eff, p.getEndKind(), p.getNoticeOn()),
            rates ? p.getBillRateMinor() : null, rates ? p.getRateUnit() : null, rates ? p.getCurrency() : null, next, p.isRedeploymentPool(), ext
        );
    }

    PlacementDTO.Member member(Long id, Map<Long, String> who) {
        if (id == null) return null;
        String name = who.getOrDefault(id, "Member");
        return new PlacementDTO.Member(id, name, ApplicationNames.initials(name));
    }

    static PlacementDTO.PersonRef consultantRef(ConsultantProfile c) {
        return new PlacementDTO.PersonRef(c.getId(), c.getDisplayName(), ApplicationNames.initials(c.getDisplayName()), c.getJobTitle());
    }

    static PlacementDTO.ClientRef clientRef(ClientAccount cl) {
        return new PlacementDTO.ClientRef(cl.getId(), cl.getName(), PlacementRules.clientInitials(cl.getName()), cl.getIndustry());
    }

    // ---- KPI tiles -------------------------------------------------------------------------------------------------------------

    /** One placement's facts for the tiles: {@code [id, status, start, end, pool, createdAt]}. */
    private record Fact(long id, String status, LocalDate start, LocalDate end, boolean pool, LocalDate created) {}

    @SuppressWarnings("unchecked")
    private List<Fact> facts(OrgMembership me, PermissionScope scope) {
        Set<Long> visible = access.managersVisible(me, scope);
        if (visible != null && visible.isEmpty()) return List.of();
        String jpql = "select p.id, p.status, p.startDate, p.endDate, p.redeploymentPool, p.createdAt from TalentPlacement p where p.orgId = :orgId" + (visible == null ? "" : " and p.accountManagerMemberId in :scope");
        Query q = em.createQuery(jpql).setParameter("orgId", me.orgId());
        if (visible != null) q.setParameter("scope", visible);
        List<Object[]> rows = q.getResultList();
        List<Fact> out = new ArrayList<>();
        for (Object[] r : rows) out.add(new Fact(((Number) r[0]).longValue(), (String) r[1], (LocalDate) r[2], (LocalDate) r[3], (Boolean) r[4], ((Instant) r[5]).atZone(ZoneOffset.UTC).toLocalDate()));
        return out;
    }

    /** Pool membership events of the caller's placements, oldest first: {@code [placementId, eventType, occurredAt]}. */
    @SuppressWarnings("unchecked")
    private List<Object[]> poolEvents(OrgMembership me, PermissionScope scope) {
        Set<Long> visible = access.managersVisible(me, scope);
        if (visible != null && visible.isEmpty()) return List.of();
        String jpql = "select e.placementId, e.eventType, e.occurredAt from PlacementEvent e, TalentPlacement p where e.orgId = :orgId and p.orgId = :orgId and p.id = e.placementId" +
            " and e.eventType in ('REDEPLOY_STARTED', 'REDEPLOY_CANCELLED')" + (visible == null ? "" : " and p.accountManagerMemberId in :scope") + " order by e.placementId, e.occurredAt, e.id";
        Query q = em.createQuery(jpql).setParameter("orgId", me.orgId());
        if (visible != null) q.setParameter("scope", visible);
        return q.getResultList();
    }

    /** True while {@code f} was running on {@code d}. */
    static boolean runningOn(Fact f, LocalDate d) {
        return !f.start().isAfter(d) && (f.end() == null || f.end().isAfter(d));
    }

    public PlacementDTO.Counts counts(OrgMembership me) {
        PermissionScope scope = access.requireView(me);
        Long orgId = me.orgId();
        LocalDate today = today();
        Instant now = Instant.now(clock);
        int soon = settings.endingSoonDays(orgId);
        int starting = settings.startingSoonDays(orgId);
        List<Fact> facts = facts(me, scope);
        List<Object[]> pool = poolEvents(me, scope);

        // current figures = the same rows the tabs and filters select
        long active = 0, startingNow = 0, endingNow = 0, poolNow = 0;
        for (Fact f : facts) {
            boolean open = !PlacementRules.STORED_ENDED.equals(f.status());
            if (open && !f.start().isAfter(today)) {
                active++;
                if (f.end() != null && !f.end().isAfter(today.plusDays(soon))) endingNow++;
            }
            if (open && f.start().isAfter(today) && !f.start().isAfter(today.plusDays(starting))) startingNow++;
            if (f.pool()) poolNow++;
        }

        // history: eight weekly points, the last one is "now"; the month-ago figure is the point 30 days back
        List<LocalDate> days = new ArrayList<>();
        for (int i = SERIES_POINTS - 1; i >= 0; i--) days.add(today.minusDays(7L * i));
        LocalDate monthAgo = today.minusDays(MONTH_DAYS);
        boolean history = facts.stream().anyMatch(f -> !f.start().isAfter(monthAgo) || !f.created().isAfter(monthAgo));

        List<Long> aSeries = new ArrayList<>(), sSeries = new ArrayList<>(), eSeries = new ArrayList<>(), pSeries = new ArrayList<>();
        for (LocalDate d : days) {
            aSeries.add(activeAt(facts, d));
            sSeries.add(startingAt(facts, d, starting));
            eSeries.add(endingAt(facts, d, soon));
        }
        aSeries.set(aSeries.size() - 1, active);
        sSeries.set(sSeries.size() - 1, startingNow);
        eSeries.set(eSeries.size() - 1, endingNow);

        // the pool: replay join / leave events; a flagged placement with no event at all has no history, so the month-ago figure is unknown
        Map<Long, List<Object[]>> byPlacement = new HashMap<>();
        for (Object[] e : pool) byPlacement.computeIfAbsent(((Number) e[0]).longValue(), k -> new ArrayList<>()).add(e);
        boolean poolKnown = history && facts.stream().noneMatch(f -> f.pool() && !byPlacement.containsKey(f.id()));
        for (int i = 0; i < days.size(); i++) {
            Instant at = i == days.size() - 1 ? now : days.get(i).plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);
            pSeries.add(poolKnown ? poolAt(byPlacement, at) : (i == days.size() - 1 ? poolNow : 0L));
        }
        Instant monthInstant = monthAgo.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC);

        Long prevActive = history ? activeAt(facts, monthAgo) : null;
        Long prevStarting = history ? startingAt(facts, monthAgo, starting) : null;
        Long prevEnding = history ? endingAt(facts, monthAgo, soon) : null;
        Long prevPool = poolKnown ? poolAt(byPlacement, monthInstant) : null;
        PlacementDTO.Tabs tabs = new PlacementDTO.Tabs(tabCount(me, "active"), tabCount(me, "upcoming"), tabCount(me, "completed"), tabCount(me, "extensions"));
        Instant seriesFrom = days.get(0).atStartOfDay().toInstant(ZoneOffset.UTC);
        return new PlacementDTO.Counts(
            now, seriesFrom, scope.name(),
            PlacementDTO.Tile.of(active, prevActive, aSeries),
            PlacementDTO.Tile.of(startingNow, prevStarting, sSeries),
            PlacementDTO.Tile.of(endingNow, prevEnding, eSeries),
            PlacementDTO.Tile.of(poolNow, prevPool, poolSeries(pSeries, poolKnown)),
            tabs, settings.windows(orgId)
        );
    }

    private static List<Long> poolSeries(List<Long> series, boolean known) {
        return known ? series : List.of(series.get(series.size() - 1));
    }

    private long tabCount(OrgMembership me, String tab) {
        Where w = scoped(me, new ListQuery(tab, null, null, null, null, null, null, null, null, null, null, null, null, null));
        if (w == null) return 0;
        return ((Number) query("select count(p) from TalentPlacement p where p.orgId = :orgId" + w.sql, w).getSingleResult()).longValue();
    }

    static long activeAt(List<Fact> facts, LocalDate d) {
        return facts.stream().filter(f -> runningOn(f, d)).count();
    }

    static long endingAt(List<Fact> facts, LocalDate d, int soon) {
        return facts.stream().filter(f -> runningOn(f, d) && f.end() != null && !f.end().isAfter(d.plusDays(soon))).count();
    }

    static long startingAt(List<Fact> facts, LocalDate d, int starting) {
        return facts.stream().filter(f -> f.start().isAfter(d) && !f.start().isAfter(d.plusDays(starting)) && !f.created().isAfter(d)).count();
    }

    private static long poolAt(Map<Long, List<Object[]>> byPlacement, Instant at) {
        long n = 0;
        for (List<Object[]> evs : byPlacement.values()) {
            boolean in = false;
            for (Object[] e : evs) {
                if (((Instant) e[2]).isAfter(at)) break;
                in = "REDEPLOY_STARTED".equals(e[1]);
            }
            if (in) n++;
        }
        return n;
    }

    // ---- filters and pickers ---------------------------------------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    public PlacementDTO.Filters filters(OrgMembership me) {
        List<PlacementDTO.Option> statuses = PlacementRules.STATUS_FILTERS.stream().map(s -> new PlacementDTO.Option(s, PlacementRules.statusFilterLabel(s))).toList();
        List<PlacementDTO.Option> types = PlacementRules.TYPES.stream().sorted().map(t -> new PlacementDTO.Option(t, PlacementRules.typeLabel(t))).toList();
        Where w = scoped(me, null);
        if (w == null) return new PlacementDTO.Filters(List.of(), List.of(), List.of(), types, statuses);
        List<Object[]> cls = query("select distinct cl.id, cl.name" + FROM + w.sql + " order by cl.name", w).getResultList();
        List<String> roles = query("select distinct p.roleTitle" + FROM + w.sql + " order by p.roleTitle", w).getResultList();
        List<Long> mids = query("select distinct p.accountManagerMemberId" + FROM + w.sql + " and p.accountManagerMemberId is not null", w).getResultList();
        Map<Long, String> who = names.memberNames(me.orgId(), mids);
        List<PlacementDTO.Option> managers = mids.stream().map(id -> new PlacementDTO.Option(String.valueOf(id), who.getOrDefault(id, "Member"))).sorted(Comparator.comparing(PlacementDTO.Option::label)).toList();
        return new PlacementDTO.Filters(
            cls.stream().map(c -> new PlacementDTO.Option(String.valueOf(c[0]), (String) c[1])).toList(),
            roles.stream().map(r -> new PlacementDTO.Option(r, r)).toList(),
            managers, types, statuses
        );
    }

    /** Candidates for Add Placement: consultants (not placed right now), clients, their contacts and the people who may be account manager. */
    @SuppressWarnings("unchecked")
    public PlacementDTO.Pickers pickers(OrgMembership me, String kind, String q, Long clientId) {
        access.writeScope(me).orElseThrow(OrgNotFoundException::new);
        String needle = q == null ? "" : q.strip().toLowerCase(Locale.ROOT);
        if (needle.length() > SEARCH_MAX) throw OrgException.invalid("q", "at most " + SEARCH_MAX + " characters");
        String like = "%" + escapeLike(needle) + "%";
        Long orgId = me.orgId();
        switch (kind == null ? "" : kind) {
            case "consultant" -> {
                List<ConsultantProfile> rows = em.createQuery(
                    "select c from ConsultantProfile c where c.orgId = :orgId and c.status = 'ACTIVE' and lower(c.displayName) like :q escape '!'" +
                    " and not exists (select 1 from TalentPlacement p where p.orgId = :orgId and p.consultantId = c.id and p.status <> 'ENDED') order by c.displayName"
                ).setParameter("orgId", orgId).setParameter("q", like).setMaxResults(20).getResultList();
                return new PlacementDTO.Pickers(kind, rows.stream().map(c -> new PlacementDTO.PickerItem(c.getId(), c.getDisplayName(), c.getJobTitle())).toList());
            }
            case "client" -> {
                List<ClientAccount> rows = em.createQuery("select cl from ClientAccount cl where cl.orgId = :orgId and cl.status = 'ACTIVE' and lower(cl.name) like :q escape '!' order by cl.name")
                    .setParameter("orgId", orgId).setParameter("q", like).setMaxResults(20).getResultList();
                return new PlacementDTO.Pickers(kind, rows.stream().map(c -> new PlacementDTO.PickerItem(c.getId(), c.getName(), c.getIndustry())).toList());
            }
            case "contact" -> {
                if (clientId == null) throw OrgException.invalid("clientId", "is required");
                List<ClientContact> rows = em.createQuery("select cc from ClientContact cc where cc.orgId = :orgId and cc.clientId = :cid and cc.status = 'ACTIVE' and lower(cc.name) like :q escape '!' order by cc.name")
                    .setParameter("orgId", orgId).setParameter("cid", clientId).setParameter("q", like).setMaxResults(20).getResultList();
                return new PlacementDTO.Pickers(kind, rows.stream().map(c -> new PlacementDTO.PickerItem(c.getId(), c.getName(), c.getTitle())).toList());
            }
            case "manager" -> {
                List<Long> ids = em.createQuery("select m.memberId from MarketerCapacity m where m.orgId = :orgId and m.status = 'ACTIVE'").setParameter("orgId", orgId).getResultList();
                Map<Long, String> who = names.memberNames(orgId, ids);
                return new PlacementDTO.Pickers(kind, who.entrySet().stream().filter(e -> e.getValue().toLowerCase(Locale.ROOT).contains(needle))
                    .sorted(Map.Entry.comparingByValue()).map(e -> new PlacementDTO.PickerItem(e.getKey(), e.getValue(), null)).toList());
            }
            default -> throw OrgException.invalid("kind", "must be consultant, client, contact or manager");
        }
    }

    // ---- detail ----------------------------------------------------------------------------------------------------------------

    /** The placement, only when the caller may read it (their scope covers its account manager); otherwise the generic 404. */
    public TalentPlacement visible(OrgMembership me, Long id) {
        PermissionScope scope = access.requireView(me);
        TalentPlacement p = placements.findByOrgIdAndId(me.orgId(), id).orElseThrow(OrgNotFoundException::new);
        if (!access.covers(me, scope, p.getAccountManagerMemberId())) throw new OrgNotFoundException();
        return p;
    }

    public PlacementDTO.Detail detail(OrgMembership me, Long id) {
        return detailOf(me, visible(me, id));
    }

    public PlacementDTO.Detail detailOf(OrgMembership me, TalentPlacement p) {
        Long orgId = me.orgId();
        LocalDate today = today();
        ConsultantProfile c = em.createQuery("select c from ConsultantProfile c where c.orgId = :o and c.id = :id", ConsultantProfile.class).setParameter("o", orgId).setParameter("id", p.getConsultantId()).getSingleResult();
        ClientAccount cl = em.createQuery("select c from ClientAccount c where c.orgId = :o and c.id = :id", ClientAccount.class).setParameter("o", orgId).setParameter("id", p.getClientId()).getSingleResult();
        List<PlacementExtension> exts = extensions.findByOrgIdAndPlacementIdOrderByCreatedAtDescIdDesc(orgId, p.getId());
        List<PlacementEvent> evs = events.findByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(orgId, p.getId());
        List<PlacementNote> nts = notes.findByOrgIdAndPlacementIdOrderByCreatedAtDescIdDesc(orgId, p.getId());
        Set<Long> memberIds = new HashSet<>();
        memberIds.add(p.getAccountManagerMemberId());
        for (PlacementExtension x : exts) {
            memberIds.add(x.getRequestedByMemberId());
            memberIds.add(x.getDecidedByMemberId());
        }
        for (PlacementEvent e : evs) memberIds.add(e.getActorMemberId());
        for (PlacementNote n : nts) memberIds.add(n.getAuthorMemberId());
        Map<Long, String> who = names.memberNames(orgId, memberIds);

        String eff = PlacementRules.effectiveStatus(p.getStatus(), p.getStartDate(), today);
        boolean pending = exts.stream().anyMatch(x -> PlacementRules.EXT_REQUESTED.equals(x.getStatus()));
        PlacementDTO.NextAction next = PlacementRules.nextAction(eff, p.getStartDate(), p.getEndDate(), p.isRedeploymentPool(), pending, today, settings.endingSoonDays(orgId), settings.endingUrgentDays(orgId), settings.startingSoonDays(orgId));
        boolean rates = access.seesRates(me);
        PlacementDTO.Contact contact = null;
        if (p.getClientContactId() != null) {
            contact = contacts.findByOrgIdAndId(orgId, p.getClientContactId()).map(cc -> new PlacementDTO.Contact(cc.getId(), cc.getName(), cc.getTitle())).orElse(null);
        }
        LocalDate availableFrom = PlacementRules.availableFrom(p.getRedeploymentDate(), p.getEndDate());
        Integer inDays = availableFrom == null ? null : (int) ChronoUnit.DAYS.between(today, availableFrom);
        PlacementDTO.Availability availability = new PlacementDTO.Availability(p.isRedeploymentPool(), availableFrom, inDays, PlacementRules.ENDED.equals(eff));
        boolean open = !PlacementRules.ENDED.equals(eff);
        boolean canWrite = access.canWrite(me, p);
        PlacementDTO.Actions actions = new PlacementDTO.Actions(
            canWrite && open, canWrite && open && !pending, canWrite && open, canWrite && !p.isRedeploymentPool(),
            canWrite, canWrite && open && pending, canWrite && open, canWrite && open && p.getNoticeOn() == null && !p.getStartDate().isAfter(today)
        );
        Integer endsIn = p.getEndDate() == null ? null : (int) ChronoUnit.DAYS.between(today, p.getEndDate());
        Integer startsIn = p.getStartDate().isAfter(today) ? (int) ChronoUnit.DAYS.between(today, p.getStartDate()) : null;
        return new PlacementDTO.Detail(
            p.getId(), consultantRef(c), clientRef(cl), p.getRoleTitle(), p.getPlacementType(), p.getStartDate(), p.getEndDate(), endsIn, startsIn, member(p.getAccountManagerMemberId(), who), contact, PlacementRules.displayStatus(eff, p.getEndKind(), p.getNoticeOn()),
            rates ? p.getBillRateMinor() : null, rates ? p.getRateUnit() : null, rates ? p.getCurrency() : null, next, PlacementRules.engagement(p.getStartDate(), p.getEndDate(), today), pending,
            exts.stream().map(x -> new PlacementDTO.ExtensionItem(x.getId(), x.getStatus(), x.getFromEndDate(), x.getRequestedEndDate(), x.getNote(), member(x.getRequestedByMemberId(), who), member(x.getDecidedByMemberId(), who), x.getCreatedAt(), x.getDecidedAt())).toList(),
            availability,
            evs.stream().map(e -> new PlacementDTO.EventItem(e.getId(), e.getEventType(), member(e.getActorMemberId(), who), e.getDetail(), e.getOccurredAt())).toList(),
            nts.stream().map(n -> new PlacementDTO.NoteItem(n.getId(), member(n.getAuthorMemberId(), who), n.getBody(), n.getCreatedAt())).toList(),
            nts.size(), actions, undoToken(me, p, evs), p.getEndKind(), p.getEndReason(), p.getNoticeOn(), p.getOfferId()
        );
    }

    /** The caller's own latest change, while it can still be undone (ten minutes, nothing recorded after it). */
    private PlacementDTO.UndoToken undoToken(OrgMembership me, TalentPlacement p, List<PlacementEvent> timelineNewestFirst) {
        PlacementEvent last = events.findFirstByOrgIdAndPlacementIdOrderByOccurredAtDescIdDesc(me.orgId(), p.getId()).orElse(null);
        if (last == null || !PlacementCommandService.UNDOABLE.contains(last.getEventType()) || !me.memberId().equals(last.getActorMemberId())) return null;
        Instant expires = last.getOccurredAt().plus(UNDO_WINDOW);
        if (expires.isBefore(Instant.now(clock)) || !access.canWrite(me, p)) return null;
        return new PlacementDTO.UndoToken(last.getId(), expires, last.getEventType());
    }
}
