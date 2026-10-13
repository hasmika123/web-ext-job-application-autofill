package com.dossier.api.service.ent.clients;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientContact;
import com.dossier.api.domain.ent.talent.ClientNote;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentPlacement;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientContactRepository;
import com.dossier.api.repository.ent.talent.ClientNoteRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.TalentPlacementRepository;
import com.dossier.api.service.dto.ent.ClientDTO;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Clock;
import java.time.Instant;
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
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The read side of the Clients page: the filtered, sorted, paged directory; the KPI tiles with their facets; one client's drawer; and
 * the Contacts, Requirements and Activity tabs. Every query names the organization of the caller's seat (the path id was already
 * matched to it by the interceptor); a client id of another tenant is the generic 404. A client's figures (open requirements, active
 * consultants, last activity, health) are grouped per organization in a handful of aggregate queries and the page is cut in memory, which
 * is fine at the size of one organization's client list (tens to a few hundred rows).
 */
@Service
public class ClientBoardService {

    public static final List<String> STATUSES = List.of("ACTIVE", "PROSPECT", "INACTIVE");
    public static final List<String> HEALTH = List.of(ClientHealth.HEALTHY, ClientHealth.AT_RISK, ClientHealth.NEUTRAL);
    public static final List<String> SIZE_BANDS = List.of("1-50", "51-200", "201-1000", "1000-5000", "5000+");
    public static final List<String> SORTS = List.of("name", "industry", "requirements", "consultants", "manager", "health", "activity");
    public static final int MAX_SIZE = 100;
    public static final int DEFAULT_SIZE = 10;
    static final int DETAIL_LIST_LIMIT = 100;
    static final int SUBMISSIONS_LIMIT = 5;
    static final int NOTES_LIMIT = 20;
    static final int ACTIVITY_DEFAULT = 30;
    static final int ACTIVITY_MAX = 100;

    /** The directory call's filters; every list field is "any of". */
    public record ListQuery(String q, List<String> industry, List<String> health, List<String> status, List<String> sizeBand, List<Long> managerId, String sort, String dir, Integer page, Integer size) {}

    /** What the rows of one client add up to. */
    record Stat(int open, int active, int placements, Instant lastActivity) {}

    private final ClientAccountRepository clients;
    private final ClientContactRepository contacts;
    private final ClientNoteRepository notes;
    private final ClientRequirementRepository requirements;
    private final TalentPlacementRepository placements;
    private final ClientAccess access;
    private final ClientsSettings settings;
    private final Clock clock = Clock.systemUTC();

    @PersistenceContext
    private EntityManager em;

    @Autowired
    public ClientBoardService(
        ClientAccountRepository clients,
        ClientContactRepository contacts,
        ClientNoteRepository notes,
        ClientRequirementRepository requirements,
        TalentPlacementRepository placements,
        ClientAccess access,
        ClientsSettings settings
    ) {
        this.clients = clients;
        this.contacts = contacts;
        this.notes = notes;
        this.requirements = requirements;
        this.placements = placements;
        this.access = access;
        this.settings = settings;
    }

    // ---- the directory ------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ClientDTO.Page list(OrgMembership me, ListQuery q) {
        access.requireView(me);
        Long orgId = me.orgId();
        int size = q.size() == null ? DEFAULT_SIZE : q.size();
        int page = q.page() == null ? 0 : q.page();
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "between 1 and " + MAX_SIZE);
        if (page < 0) throw OrgException.invalid("page", "0 or more");
        String sort = q.sort() == null || q.sort().isBlank() ? "activity" : q.sort();
        if (!SORTS.contains(sort)) throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + SORTS, Map.of());
        if (q.dir() != null && !q.dir().isBlank() && !"asc".equalsIgnoreCase(q.dir()) && !"desc".equalsIgnoreCase(q.dir())) throw OrgException.invalid("dir", "asc or desc");
        boolean desc = q.dir() == null || q.dir().isBlank() ? sortDefaultDesc(sort) : "desc".equalsIgnoreCase(q.dir());
        String text = q.q() == null ? "" : q.q().trim();
        if (!text.isEmpty() && (text.length() < 2 || text.length() > 80)) throw OrgException.invalid("q", "2 to 80 characters");
        List<String> healthIn = checked("health", q.health(), HEALTH);
        List<String> statusIn = checked("status", q.status(), STATUSES);

        Instant now = Instant.now(clock);
        ClientsSettings.Thresholds th = settings.thresholds(orgId);
        List<ClientAccount> all = liveClients(orgId);
        Map<Long, Stat> stats = stats(orgId, all);
        Map<Long, String> managerNames = managerNames(orgId, all);
        Set<String> industryIn = lower(q.industry());
        Set<String> sizeIn = lower(q.sizeBand());
        String needle = text.toLowerCase(Locale.ROOT);

        List<Row> rows = new ArrayList<>();
        for (ClientAccount c : all) {
            Stat s = stats.get(c.getId());
            ClientHealth.Result h = ClientHealth.of(c.getStatus(), s.lastActivity(), s.open(), s.active(), now, th);
            String manager = c.getOwnerMemberId() == null ? "" : managerNames.getOrDefault(c.getOwnerMemberId(), "");
            if (!needle.isEmpty() && !(c.getName().toLowerCase(Locale.ROOT).contains(needle) || (c.getIndustry() != null && c.getIndustry().toLowerCase(Locale.ROOT).contains(needle)) || manager.toLowerCase(Locale.ROOT).contains(needle))) continue;
            if (!industryIn.isEmpty() && (c.getIndustry() == null || !industryIn.contains(c.getIndustry().toLowerCase(Locale.ROOT)))) continue;
            if (!sizeIn.isEmpty() && (c.getSizeBand() == null || !sizeIn.contains(c.getSizeBand().toLowerCase(Locale.ROOT)))) continue;
            if (!healthIn.isEmpty() && !healthIn.contains(h.level())) continue;
            if (!statusIn.isEmpty() && !statusIn.contains(c.getStatus())) continue;
            if (q.managerId() != null && !q.managerId().isEmpty() && !q.managerId().contains(c.getOwnerMemberId())) continue;
            rows.add(new Row(c, s, h, manager));
        }

        Comparator<Row> cmp = switch (sort) {
            case "name" -> Comparator.comparing((Row r) -> r.c.getName().toLowerCase(Locale.ROOT));
            case "industry" -> Comparator.comparing((Row r) -> r.c.getIndustry() == null ? "" : r.c.getIndustry().toLowerCase(Locale.ROOT));
            case "requirements" -> Comparator.comparing((Row r) -> r.s.open());
            case "consultants" -> Comparator.comparing((Row r) -> r.s.active());
            case "manager" -> Comparator.comparing((Row r) -> r.manager.toLowerCase(Locale.ROOT));
            case "health" -> Comparator.comparing((Row r) -> HEALTH.indexOf(r.h.level()));
            default -> Comparator.comparing((Row r) -> r.s.lastActivity());
        };
        if (desc) cmp = cmp.reversed();
        cmp = cmp.thenComparing((Row r) -> r.c.getName().toLowerCase(Locale.ROOT)).thenComparing((Row r) -> r.c.getId());
        rows.sort(cmp);

        long total = rows.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min((long) from + size, total);
        List<ClientDTO.Row> items = new ArrayList<>();
        for (Row r : rows.subList(from, to)) {
            ClientAccount c = r.c;
            items.add(
                new ClientDTO.Row(
                    c.getId(), c.getName(), c.getIndustry(), c.getStatus(), c.getWebsite(), r.s.open(), r.s.active(),
                    c.getOwnerMemberId() == null || r.manager.isEmpty() ? null : new ClientDTO.Person(c.getOwnerMemberId(), r.manager),
                    new ClientDTO.Health(r.h.level(), r.h.reason()), r.s.lastActivity()
                )
            );
        }
        return new ClientDTO.Page(items, page, size, total, to < total);
    }

    private record Row(ClientAccount c, Stat s, ClientHealth.Result h, String manager) {}

    private static boolean sortDefaultDesc(String sort) {
        return !(sort.equals("name") || sort.equals("industry") || sort.equals("manager"));
    }

    private static Set<String> lower(List<String> values) {
        Set<String> out = new HashSet<>();
        if (values != null) for (String v : values) if (v != null && !v.isBlank()) out.add(v.trim().toLowerCase(Locale.ROOT));
        return out;
    }

    private static List<String> checked(String field, List<String> values, List<String> allowed) {
        List<String> out = new ArrayList<>();
        if (values == null) return out;
        for (String v : values) {
            if (v == null || v.isBlank()) continue;
            String u = v.trim().toUpperCase(Locale.ROOT);
            if (!allowed.contains(u)) throw OrgException.invalid(field, "one of " + allowed);
            out.add(u);
        }
        return out;
    }

    // ---- summary ------------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ClientDTO.Summary summary(OrgMembership me) {
        access.requireView(me);
        Long orgId = me.orgId();
        Instant now = Instant.now(clock);
        ClientsSettings.Thresholds th = settings.thresholds(orgId);
        List<ClientAccount> all = liveClients(orgId);
        List<ClientRequirement> reqs = requirements.findByOrgId(orgId);
        List<TalentPlacement> placed = placements.findByOrgId(orgId);
        ClientKpis.Tiles t = ClientKpis.compute(all, reqs, placed, now);

        Map<Long, Stat> stats = stats(orgId, all);
        Map<Long, String> managerNames = managerNames(orgId, all);
        Map<String, Integer> byIndustry = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        Map<String, Integer> byHealth = new LinkedHashMap<>();
        HEALTH.forEach(h -> byHealth.put(h, 0));
        Map<String, Integer> byStatus = new LinkedHashMap<>();
        STATUSES.forEach(s -> byStatus.put(s, 0));
        Map<String, Integer> bySize = new LinkedHashMap<>();
        Map<Long, Integer> byManager = new HashMap<>();
        for (ClientAccount c : all) {
            if (c.getIndustry() != null && !c.getIndustry().isBlank()) byIndustry.merge(c.getIndustry(), 1, Integer::sum);
            Stat s = stats.get(c.getId());
            byHealth.merge(ClientHealth.of(c.getStatus(), s.lastActivity(), s.open(), s.active(), now, th).level(), 1, Integer::sum);
            byStatus.merge(c.getStatus(), 1, Integer::sum);
            if (c.getSizeBand() != null) bySize.merge(c.getSizeBand(), 1, Integer::sum);
            if (c.getOwnerMemberId() != null) byManager.merge(c.getOwnerMemberId(), 1, Integer::sum);
        }
        List<ClientDTO.Facet> sizes = new ArrayList<>();
        for (String b : SIZE_BANDS) if (bySize.containsKey(b)) sizes.add(new ClientDTO.Facet(b, b, bySize.get(b)));
        List<ClientDTO.Facet> managers = byManager.entrySet().stream()
            .map(e -> new ClientDTO.Facet(String.valueOf(e.getKey()), managerNames.getOrDefault(e.getKey(), "Unknown"), e.getValue()))
            .sorted(Comparator.comparing(f -> f.label().toLowerCase(Locale.ROOT)))
            .toList();
        ClientDTO.Facets facets = new ClientDTO.Facets(
            byIndustry.entrySet().stream().map(e -> new ClientDTO.Facet(e.getKey(), e.getKey(), e.getValue())).toList(),
            byHealth.entrySet().stream().map(e -> new ClientDTO.Facet(e.getKey(), e.getKey(), e.getValue())).toList(),
            byStatus.entrySet().stream().map(e -> new ClientDTO.Facet(e.getKey(), e.getKey(), e.getValue())).toList(),
            sizes, managers
        );
        ClientDTO.Access acc = access.access(me);
        List<ClientDTO.Person> options = acc.canManage() ? managerOptions(orgId) : List.of();
        return new ClientDTO.Summary(t.total(), t.requirements(), t.fresh(), t.placements(), now, facets, new ClientDTO.Rule(th.healthyDays(), th.atRiskDays()), options, acc);
    }

    // ---- one client ---------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ClientDTO.Detail detail(OrgMembership me, Long clientId) {
        access.requireView(me);
        ClientAccount c = clients.findByOrgIdAndId(me.orgId(), clientId).filter(x -> x.getArchivedAt() == null).orElseThrow(OrgNotFoundException::new);
        return detailOf(me, c);
    }

    ClientDTO.Detail detailOf(OrgMembership me, ClientAccount c) {
        Long orgId = me.orgId();
        Instant now = Instant.now(clock);
        Stat s = stats(orgId, List.of(c)).get(c.getId());
        ClientHealth.Result h = ClientHealth.of(c.getStatus(), s.lastActivity(), s.open(), s.active(), now, settings.thresholds(orgId));
        Map<Long, String> managerNames = managerNames(orgId, List.of(c));

        List<ClientContact> cs = new ArrayList<>(contacts.findByOrgIdAndClientId(orgId, c.getId()).stream().filter(x -> "ACTIVE".equals(x.getStatus())).toList());
        cs.sort(Comparator.comparing(ClientContact::getCreatedAt).thenComparing(ClientContact::getId));
        List<ClientDTO.Contact> contactItems = cs.stream().limit(DETAIL_LIST_LIMIT).map(ClientBoardService::contactOf).toList();

        List<ClientRequirement> rs = requirementsOf(orgId, c.getId());
        Map<Long, Long> subCounts = submissionCounts(orgId, rs.stream().map(ClientRequirement::getId).toList());
        List<ClientDTO.RequirementItem> reqItems = rs.stream().limit(DETAIL_LIST_LIMIT)
            .map(r -> new ClientDTO.RequirementItem(r.getId(), r.getTitle(), r.getStatus(), r.getPositions(), r.getFilled(), r.getLocation(), r.getPostedAt(), subCounts.getOrDefault(r.getId(), 0L).intValue()))
            .toList();

        List<ClientDTO.SubmissionItem> subs = submissionsOf(orgId, c.getId());
        List<ClientNote> ns = notes.findByOrgIdAndClientIdOrderByCreatedAtDescIdDesc(orgId, c.getId());
        Set<Long> authorIds = new HashSet<>();
        ns.stream().limit(NOTES_LIMIT).forEach(n -> {
            if (n.getAuthorMemberId() != null) authorIds.add(n.getAuthorMemberId());
        });
        Map<Long, String> authors = memberNames(orgId, authorIds);
        List<ClientDTO.NoteItem> noteItems = ns.stream().limit(NOTES_LIMIT).map(n -> new ClientDTO.NoteItem(n.getId(), n.getBody(), n.getCreatedAt(), n.getAuthorMemberId() == null ? null : authors.get(n.getAuthorMemberId()))).toList();

        String manager = c.getOwnerMemberId() == null ? null : managerNames.get(c.getOwnerMemberId());
        return new ClientDTO.Detail(
            c.getId(), c.getName(), c.getStatus(), c.getIndustry(), c.getWebsite(), c.getLocation(), c.getSizeBand(), c.getClientSince(), c.getAbout(),
            manager == null ? null : new ClientDTO.Person(c.getOwnerMemberId(), manager), new ClientDTO.Health(h.level(), h.reason()),
            s.open(), s.active(), s.placements(), s.lastActivity(), contactItems, cs.size(), reqItems, rs.size(), subs, noteItems, ns.size(), versionOf(c), access.access(me)
        );
    }

    /** The ETag the PATCH expects as If-Match: the client's last-change instant. */
    public static String versionOf(ClientAccount c) {
        return String.valueOf(c.getUpdatedAt() == null ? 0L : c.getUpdatedAt().toEpochMilli());
    }

    static ClientDTO.Contact contactOf(ClientContact x) {
        return new ClientDTO.Contact(x.getId(), x.getName(), x.getTitle(), x.getWorkEmail(), x.getRoleLabel(), x.getStatus(), x.getCreatedAt());
    }

    @SuppressWarnings("unchecked")
    private List<ClientRequirement> requirementsOf(Long orgId, Long clientId) {
        return em.createQuery("select r from ClientRequirement r where r.orgId = :o and r.clientId = :c order by r.postedAt desc, r.id desc").setParameter("o", orgId).setParameter("c", clientId).getResultList();
    }

    @SuppressWarnings("unchecked")
    private Map<Long, Long> submissionCounts(Long orgId, Collection<Long> requirementIds) {
        Map<Long, Long> out = new HashMap<>();
        if (requirementIds.isEmpty()) return out;
        List<Object[]> rows = em.createQuery("select a.requirementId, count(a) from TalentApplication a where a.orgId = :o and a.requirementId in :ids group by a.requirementId").setParameter("o", orgId).setParameter("ids", requirementIds).getResultList();
        for (Object[] row : rows) out.put((Long) row[0], (Long) row[1]);
        return out;
    }

    @SuppressWarnings("unchecked")
    private List<ClientDTO.SubmissionItem> submissionsOf(Long orgId, Long clientId) {
        List<TalentApplication> apps = em.createQuery("select a from TalentApplication a where a.orgId = :o and a.clientId = :c order by a.stageChangedAt desc, a.id desc").setParameter("o", orgId).setParameter("c", clientId).setMaxResults(SUBMISSIONS_LIMIT).getResultList();
        if (apps.isEmpty()) return List.of();
        Map<Long, ConsultantProfile> people = new HashMap<>();
        for (ConsultantProfile p : (List<ConsultantProfile>) em.createQuery("select p from ConsultantProfile p where p.orgId = :o and p.id in :ids").setParameter("o", orgId).setParameter("ids", apps.stream().map(TalentApplication::getConsultantId).toList()).getResultList()) people.put(p.getId(), p);
        Map<Long, String> titles = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select r.id, r.title from ClientRequirement r where r.orgId = :o and r.id in :ids").setParameter("o", orgId).setParameter("ids", apps.stream().map(TalentApplication::getRequirementId).toList()).getResultList()) titles.put((Long) row[0], (String) row[1]);
        List<ClientDTO.SubmissionItem> out = new ArrayList<>();
        for (TalentApplication a : apps) {
            ConsultantProfile p = people.get(a.getConsultantId());
            out.add(new ClientDTO.SubmissionItem(a.getId(), a.getCode(), a.getConsultantId(), p == null ? "Consultant" : p.getDisplayName(), titles.getOrDefault(a.getRequirementId(), ""), a.getStage(), a.getClosedReason(), a.getStageChangedAt()));
        }
        return out;
    }

    // ---- the other tabs -----------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public ClientDTO.ContactPage contactList(OrgMembership me, String q, Long clientId, Integer page, Integer size) {
        access.requireView(me);
        Long orgId = me.orgId();
        int sz = size == null ? DEFAULT_SIZE : size;
        int pg = page == null ? 0 : page;
        if (sz < 1 || sz > MAX_SIZE) throw OrgException.invalid("size", "between 1 and " + MAX_SIZE);
        if (pg < 0) throw OrgException.invalid("page", "0 or more");
        String text = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        if (!text.isEmpty() && (text.length() < 2 || text.length() > 80)) throw OrgException.invalid("q", "2 to 80 characters");
        Map<Long, ClientAccount> byId = new HashMap<>();
        liveClients(orgId).forEach(c -> byId.put(c.getId(), c));
        List<ClientContact> found = new ArrayList<>();
        for (ClientContact x : contacts.findByOrgId(orgId)) {
            ClientAccount c = byId.get(x.getClientId());
            if (c == null || !"ACTIVE".equals(x.getStatus())) continue;
            if (clientId != null && !clientId.equals(x.getClientId())) continue;
            if (!text.isEmpty() && !(x.getName().toLowerCase(Locale.ROOT).contains(text) || (x.getTitle() != null && x.getTitle().toLowerCase(Locale.ROOT).contains(text)) || (x.getWorkEmail() != null && x.getWorkEmail().toLowerCase(Locale.ROOT).contains(text)) || c.getName().toLowerCase(Locale.ROOT).contains(text))) continue;
            found.add(x);
        }
        found.sort(Comparator.comparing((ClientContact x) -> x.getName().toLowerCase(Locale.ROOT)).thenComparing(ClientContact::getId));
        long total = found.size();
        int from = (int) Math.min((long) pg * sz, total);
        int to = (int) Math.min((long) from + sz, total);
        List<ClientDTO.ContactRow> items = new ArrayList<>();
        for (ClientContact x : found.subList(from, to)) {
            items.add(new ClientDTO.ContactRow(x.getId(), x.getName(), x.getTitle(), x.getWorkEmail(), x.getRoleLabel(), x.getStatus(), new ClientDTO.ClientRef(x.getClientId(), byId.get(x.getClientId()).getName()), x.getCreatedAt()));
        }
        return new ClientDTO.ContactPage(items, pg, sz, total, to < total);
    }

    @Transactional(readOnly = true)
    public ClientDTO.RequirementPage requirementList(OrgMembership me, String q, String status, Long clientId, Integer page, Integer size) {
        access.requireView(me);
        Long orgId = me.orgId();
        int sz = size == null ? DEFAULT_SIZE : size;
        int pg = page == null ? 0 : page;
        if (sz < 1 || sz > MAX_SIZE) throw OrgException.invalid("size", "between 1 and " + MAX_SIZE);
        if (pg < 0) throw OrgException.invalid("page", "0 or more");
        String text = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        if (!text.isEmpty() && (text.length() < 2 || text.length() > 80)) throw OrgException.invalid("q", "2 to 80 characters");
        List<String> st = checked("status", status == null || status.isBlank() ? List.of() : List.of(status), List.of("OPEN", "IN_REVIEW", "ON_HOLD", "FILLED", "CLOSED"));
        Map<Long, ClientAccount> byId = new HashMap<>();
        liveClients(orgId).forEach(c -> byId.put(c.getId(), c));
        List<ClientRequirement> found = new ArrayList<>();
        for (ClientRequirement r : requirements.findByOrgId(orgId)) {
            ClientAccount c = byId.get(r.getClientId());
            if (c == null) continue;
            if (clientId != null && !clientId.equals(r.getClientId())) continue;
            if (!st.isEmpty() && !st.contains(r.getStatus())) continue;
            if (!text.isEmpty() && !(r.getTitle().toLowerCase(Locale.ROOT).contains(text) || c.getName().toLowerCase(Locale.ROOT).contains(text) || (r.getLocation() != null && r.getLocation().toLowerCase(Locale.ROOT).contains(text)))) continue;
            found.add(r);
        }
        found.sort(Comparator.comparing(ClientRequirement::getPostedAt).reversed().thenComparing(ClientRequirement::getId, Comparator.reverseOrder()));
        long total = found.size();
        int from = (int) Math.min((long) pg * sz, total);
        int to = (int) Math.min((long) from + sz, total);
        List<ClientRequirement> slice = found.subList(from, to);
        Map<Long, Long> subs = submissionCounts(orgId, slice.stream().map(ClientRequirement::getId).toList());
        List<ClientDTO.RequirementRow> items = new ArrayList<>();
        for (ClientRequirement r : slice) {
            items.add(new ClientDTO.RequirementRow(r.getId(), r.getTitle(), new ClientDTO.ClientRef(r.getClientId(), byId.get(r.getClientId()).getName()), r.getStatus(), r.getPositions(), r.getFilled(), r.getLocation(), r.getPostedAt(), subs.getOrDefault(r.getId(), 0L).intValue()));
        }
        return new ClientDTO.RequirementPage(items, pg, sz, total, to < total);
    }

    /** The newest happenings across every client, merged from the rows that record them (account, contacts, notes, requirements, applications, placements). */
    @Transactional(readOnly = true)
    @SuppressWarnings("unchecked")
    public ClientDTO.ActivityFeed activity(OrgMembership me, Integer limit) {
        access.requireView(me);
        Long orgId = me.orgId();
        int n = limit == null ? ACTIVITY_DEFAULT : limit;
        if (n < 1 || n > ACTIVITY_MAX) throw OrgException.invalid("limit", "between 1 and " + ACTIVITY_MAX);
        Map<Long, ClientAccount> byId = new HashMap<>();
        liveClients(orgId).forEach(c -> byId.put(c.getId(), c));
        List<ClientDTO.ActivityItem> items = new ArrayList<>();
        java.util.function.Function<Long, ClientDTO.ClientRef> ref = id -> new ClientDTO.ClientRef(id, byId.get(id).getName());

        for (ClientAccount c : byId.values()) items.add(new ClientDTO.ActivityItem(c.getCreatedAt(), "client", c.getName() + " became a client", ref.apply(c.getId()), null));
        for (ClientContact x : contacts.findByOrgId(orgId)) {
            if (byId.containsKey(x.getClientId())) items.add(new ClientDTO.ActivityItem(x.getCreatedAt(), "contact", x.getName() + " was added as a contact at " + byId.get(x.getClientId()).getName(), ref.apply(x.getClientId()), null));
        }
        List<ClientNote> recentNotes = em.createQuery("select n from ClientNote n where n.orgId = :o order by n.createdAt desc, n.id desc").setParameter("o", orgId).setMaxResults(n).getResultList();
        Map<Long, String> authors = memberNames(orgId, recentNotes.stream().map(ClientNote::getAuthorMemberId).filter(java.util.Objects::nonNull).toList());
        for (ClientNote x : recentNotes) {
            if (byId.containsKey(x.getClientId())) items.add(new ClientDTO.ActivityItem(x.getCreatedAt(), "note", "A relationship note was added for " + byId.get(x.getClientId()).getName(), ref.apply(x.getClientId()), x.getAuthorMemberId() == null ? null : authors.get(x.getAuthorMemberId())));
        }
        List<ClientRequirement> recentReqs = em.createQuery("select r from ClientRequirement r where r.orgId = :o order by r.postedAt desc, r.id desc").setParameter("o", orgId).setMaxResults(n).getResultList();
        for (ClientRequirement r : recentReqs) {
            if (byId.containsKey(r.getClientId())) items.add(new ClientDTO.ActivityItem(r.getPostedAt(), "requirement", r.getTitle() + " was posted for " + byId.get(r.getClientId()).getName(), ref.apply(r.getClientId()), null));
        }
        List<TalentApplication> recentApps = em.createQuery("select a from TalentApplication a where a.orgId = :o and a.clientId is not null order by a.stageChangedAt desc, a.id desc").setParameter("o", orgId).setMaxResults(n).getResultList();
        Map<Long, ConsultantProfile> people = new HashMap<>();
        Map<Long, String> titles = new HashMap<>();
        if (!recentApps.isEmpty()) {
            for (ConsultantProfile p : (List<ConsultantProfile>) em.createQuery("select p from ConsultantProfile p where p.orgId = :o and p.id in :ids").setParameter("o", orgId).setParameter("ids", recentApps.stream().map(TalentApplication::getConsultantId).toList()).getResultList()) people.put(p.getId(), p);
            for (Object[] row : (List<Object[]>) em.createQuery("select r.id, r.title from ClientRequirement r where r.orgId = :o and r.id in :ids").setParameter("o", orgId).setParameter("ids", recentApps.stream().map(TalentApplication::getRequirementId).toList()).getResultList()) titles.put((Long) row[0], (String) row[1]);
        }
        for (TalentApplication a : recentApps) {
            if (!byId.containsKey(a.getClientId())) continue;
            ConsultantProfile p = people.get(a.getConsultantId());
            items.add(new ClientDTO.ActivityItem(a.getStageChangedAt(), "submission", (p == null ? "A consultant" : p.getDisplayName()) + " is " + stageWords(a.getStage()) + " for " + titles.getOrDefault(a.getRequirementId(), "a role") + " at " + byId.get(a.getClientId()).getName(), ref.apply(a.getClientId()), null));
        }
        List<TalentPlacement> recentPlacements = em.createQuery("select p from TalentPlacement p where p.orgId = :o order by p.createdAt desc, p.id desc").setParameter("o", orgId).setMaxResults(n).getResultList();
        Map<Long, ConsultantProfile> placedPeople = new HashMap<>();
        if (!recentPlacements.isEmpty()) {
            for (ConsultantProfile p : (List<ConsultantProfile>) em.createQuery("select p from ConsultantProfile p where p.orgId = :o and p.id in :ids").setParameter("o", orgId).setParameter("ids", recentPlacements.stream().map(TalentPlacement::getConsultantId).toList()).getResultList()) placedPeople.put(p.getId(), p);
        }
        for (TalentPlacement p : recentPlacements) {
            if (!byId.containsKey(p.getClientId())) continue;
            ConsultantProfile c = placedPeople.get(p.getConsultantId());
            items.add(new ClientDTO.ActivityItem(ClientKpis.startOf(p), "placement", (c == null ? "A consultant" : c.getDisplayName()) + " was placed at " + byId.get(p.getClientId()).getName() + (p.getRoleTitle() == null ? "" : " as " + p.getRoleTitle()), ref.apply(p.getClientId()), null));
        }
        Instant now = Instant.now(clock);
        items.removeIf(i -> i.at() == null || i.at().isAfter(now.plusSeconds(86400)));
        items.sort(Comparator.comparing(ClientDTO.ActivityItem::at).reversed());
        return new ClientDTO.ActivityFeed(items.size() > n ? new ArrayList<>(items.subList(0, n)) : items);
    }

    static String stageWords(String stage) {
        return switch (stage == null ? "" : stage) {
            case "ASSIGNED" -> "assigned";
            case "SUBMITTED" -> "submitted";
            case "UNDER_REVIEW" -> "under review";
            case "INTERVIEWING" -> "interviewing";
            case "OFFER" -> "at the offer stage";
            case "CLOSED" -> "closed out";
            default -> "in the pipeline";
        };
    }

    // ---- shared with the write side -----------------------------------------------------------------------------------------------

    List<ClientAccount> liveClients(Long orgId) {
        return clients.findByOrgId(orgId).stream().filter(c -> c.getArchivedAt() == null).toList();
    }

    /** Open requirements, placed consultants, placements and last activity of each given client (one aggregate query per source). */
    @SuppressWarnings("unchecked")
    Map<Long, Stat> stats(Long orgId, Collection<ClientAccount> of) {
        Map<Long, Long> open = new HashMap<>();
        Map<Long, Instant> lastReq = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select r.clientId, sum(case when r.status = 'OPEN' then 1 else 0 end), max(r.postedAt), max(r.updatedAt) from ClientRequirement r where r.orgId = :o group by r.clientId").setParameter("o", orgId).getResultList()) {
            open.put((Long) row[0], row[1] == null ? 0L : ((Number) row[1]).longValue());
            lastReq.put((Long) row[0], newest((Instant) row[2], (Instant) row[3]));
        }
        Map<Long, Long> active = new HashMap<>();
        Map<Long, Long> placed = new HashMap<>();
        Map<Long, Instant> lastPlacement = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select p.clientId, count(distinct case when p.status = 'ACTIVE' then p.consultantId else null end), count(p), max(p.updatedAt), max(p.createdAt) from TalentPlacement p where p.orgId = :o group by p.clientId").setParameter("o", orgId).getResultList()) {
            active.put((Long) row[0], ((Number) row[1]).longValue());
            placed.put((Long) row[0], ((Number) row[2]).longValue());
            lastPlacement.put((Long) row[0], newest((Instant) row[3], (Instant) row[4]));
        }
        Map<Long, Instant> lastApp = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select a.clientId, max(a.stageChangedAt) from TalentApplication a where a.orgId = :o and a.clientId is not null group by a.clientId").setParameter("o", orgId).getResultList()) lastApp.put((Long) row[0], (Instant) row[1]);
        Map<Long, Instant> lastContact = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select x.clientId, max(x.createdAt) from ClientContact x where x.orgId = :o group by x.clientId").setParameter("o", orgId).getResultList()) lastContact.put((Long) row[0], (Instant) row[1]);
        Map<Long, Instant> lastNote = new HashMap<>();
        for (Object[] row : (List<Object[]>) em.createQuery("select n.clientId, max(n.createdAt) from ClientNote n where n.orgId = :o group by n.clientId").setParameter("o", orgId).getResultList()) lastNote.put((Long) row[0], (Instant) row[1]);

        Map<Long, Stat> out = new HashMap<>();
        for (ClientAccount c : of) {
            Long id = c.getId();
            Instant last = newest(c.getCreatedAt(), c.getUpdatedAt(), lastReq.get(id), lastPlacement.get(id), lastApp.get(id), lastContact.get(id), lastNote.get(id));
            out.put(id, new Stat(open.getOrDefault(id, 0L).intValue(), active.getOrDefault(id, 0L).intValue(), placed.getOrDefault(id, 0L).intValue(), last));
        }
        return out;
    }

    private static Instant newest(Instant... values) {
        Instant best = null;
        for (Instant v : values) if (v != null && (best == null || v.isAfter(best))) best = v;
        return best;
    }

    /** Names of the account managers (members) that own the given clients. */
    Map<Long, String> managerNames(Long orgId, Collection<ClientAccount> of) {
        Set<Long> ids = new HashSet<>();
        for (ClientAccount c : of) if (c.getOwnerMemberId() != null) ids.add(c.getOwnerMemberId());
        return memberNames(orgId, ids);
    }

    @SuppressWarnings("unchecked")
    Map<Long, String> memberNames(Long orgId, Collection<Long> memberIds) {
        Map<Long, String> out = new HashMap<>();
        if (memberIds.isEmpty()) return out;
        List<Object[]> rows = em.createQuery("select m.id, u.firstName, u.lastName, u.login from OrgMember m, User u where m.orgId = :o and m.id in :ids and u.id = m.userId").setParameter("o", orgId).setParameter("ids", memberIds).getResultList();
        for (Object[] row : rows) {
            String full = ((row[1] == null ? "" : row[1]) + " " + (row[2] == null ? "" : row[2])).trim();
            out.put((Long) row[0], full.isEmpty() ? null : full);
        }
        return out;
    }

    /** Active members who can own a client (the Add Client form's account-manager menu). */
    @SuppressWarnings("unchecked")
    List<ClientDTO.Person> managerOptions(Long orgId) {
        List<Object[]> rows = em.createQuery("select m.id, u.firstName, u.lastName from OrgMember m, User u where m.orgId = :o and m.status = com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE and u.id = m.userId order by u.firstName, u.lastName").setParameter("o", orgId).setMaxResults(200).getResultList();
        List<ClientDTO.Person> out = new ArrayList<>();
        for (Object[] row : rows) {
            String full = ((row[1] == null ? "" : row[1]) + " " + (row[2] == null ? "" : row[2])).trim();
            if (!full.isEmpty()) out.add(new ClientDTO.Person((Long) row[0], full));
        }
        return out;
    }

    static String fullName(User u) {
        String first = u.getFirstName() == null ? "" : u.getFirstName().trim();
        String last = u.getLastName() == null ? "" : u.getLastName().trim();
        String full = (first + " " + last).trim();
        return full.isEmpty() ? null : full;
    }
}
