package com.dossier.api.service.ent.marketing;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.repository.ent.MarketingBoardRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.*;
import com.dossier.api.service.ent.OrgRoleService;
import com.dossier.api.service.ent.RoleTemplates;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.members.MemberAccess;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Assignments board on real data (design/enterprise-talent/marketing-assignments.png, 17-marketing-assignments, talent-foundation.md s5).
 *
 * <p>Permissions (roles-as-data keys, no new ones): the board is visible with {@code workload.view} or {@code assignments.manage}; every change needs
 * {@code assignments.manage} at a scope that covers the marketer being changed (a Marketing Manager sees and edits their team, an Org Admin everything).
 * Anyone without the key, a member of another organization and a row outside the caller's scope all get the generic 404 ({@link OrgNotFoundException}).
 *
 * <p>Business rule (E1): a marketer prepares, requests and records. An assignment never lets anyone submit or sign in as a consultant, and nothing here
 * touches {@code member.act_for} or consent. Nothing in this class sends or submits anything.
 *
 * <p>Capacity: assigning more consultants than a marketer's capacity is refused with 409 {@code OVER_CAPACITY} (with the figures) unless the request says
 * {@code allowOverCapacity}; an override is audited at MEDIUM risk. Every change writes one audit row per consultant plus one {@code MARKETING_BULK} summary.
 */
@Service
public class MarketingAssignmentsService {

    public static final String KEY_VIEW = "workload.view";
    public static final String KEY_MANAGE = "assignments.manage";
    public static final String KEY_CLIENTS = "clients.view";

    public static final String CODE_OVER_CAPACITY = "OVER_CAPACITY";
    public static final String CODE_MARKETER_INVALID = "MARKETER_INVALID";
    public static final String CODE_ALREADY_MARKETER = "ALREADY_MARKETER";
    public static final String REASON_NOT_FOUND = "NOT_FOUND";
    public static final String REASON_BACKUP_SAME = "BACKUP_SAME_AS_MARKETER";
    public static final String REASON_NO_ASSIGNMENT = "NOT_ASSIGNED";
    public static final String REASON_UNCHANGED = "UNCHANGED";

    public static final String ACTION_ASSIGN = "ASSIGN";
    public static final String ACTION_UPDATE = "UPDATE";
    public static final String ACTION_UNASSIGN = "UNASSIGN";
    public static final String ACTION_RESTORE = "RESTORE";

    public static final String AUDIT_ASSIGN = "MARKETING_ASSIGN";
    public static final String AUDIT_REASSIGN = "MARKETING_REASSIGN";
    public static final String AUDIT_UPDATE = "MARKETING_UPDATE";
    public static final String AUDIT_UNASSIGN = "MARKETING_UNASSIGN";
    public static final String AUDIT_RESTORE = "MARKETING_RESTORE";
    public static final String AUDIT_BULK = "MARKETING_BULK";
    public static final String AUDIT_MARKETER_ADD = "MARKETER_ADD";
    public static final String AUDIT_MARKETER_UPDATE = "MARKETER_UPDATE";
    public static final String TARGET_CONSULTANT = "CONSULTANT";

    public static final List<String> PRIORITIES = List.of("HIGH", "MEDIUM", "LOW");
    public static final List<String> ASSIGNMENT_STATUSES = List.of("ACTIVE", "PAUSED");
    public static final List<String> MARKETER_STATUSES = List.of("ACTIVE", "PAUSED");
    public static final List<String> AVAILABILITIES = List.of("AVAILABLE", "ON_PROJECT", "NOTICE", "UNAVAILABLE");
    static final List<String> MARKETING_ROLE_KEYS = List.of(RoleTemplates.MARKETING_SPECIALIST, RoleTemplates.MARKETING_MANAGER);
    static final int DEFAULT_CAPACITY = 20;
    static final int MAX_CAPACITY = 200;
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 10;
    static final int WEEKS = 8;
    static final String NOTE = "Earlier figures are rebuilt from assignment and marketer timestamps; moves and removals are not versioned, so the past is as the rows stand today.";

    private final MarketerAssignmentRepository assignments;
    private final MarketerCapacityRepository capacities;
    private final ConsultantProfileRepository consultants;
    private final ClientAccountRepository clients;
    private final MarketingBoardRepository board;
    private final MemberAccess access;
    private final OrgRoleService roles;
    private final OrgAuditService audit;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public MarketingAssignmentsService(
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketingBoardRepository board,
        MemberAccess access,
        OrgRoleService roles,
        OrgAuditService audit,
        ObjectMapper json
    ) {
        this(assignments, capacities, consultants, clients, board, access, roles, audit, json, Clock.systemUTC());
    }

    MarketingAssignmentsService(
        MarketerAssignmentRepository assignments,
        MarketerCapacityRepository capacities,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketingBoardRepository board,
        MemberAccess access,
        OrgRoleService roles,
        OrgAuditService audit,
        ObjectMapper json,
        Clock clock
    ) {
        this.assignments = assignments;
        this.capacities = capacities;
        this.consultants = consultants;
        this.clients = clients;
        this.board = board;
        this.access = access;
        this.roles = roles;
        this.audit = audit;
        this.json = json;
        this.clock = clock;
    }

    // ---- gates ---------------------------------------------------------------------------------------------------------------------

    /** The board needs roles from data and {@code workload.view} or {@code assignments.manage}; the answer to everyone else is the generic 404. */
    private PermissionScope viewScope(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        return access.widest(me, List.of(KEY_VIEW, KEY_MANAGE)).orElseThrow(OrgNotFoundException::new);
    }

    /** The permission wall of every change: callable on its own so the endpoint can refuse before it looks at the Idempotency-Key header. */
    public void gateWrite(OrgMembership me) {
        if (me == null || !roles.rolesFromData(me.orgId())) throw new OrgNotFoundException();
        access.requireWritable(me, KEY_MANAGE);
        access.requireScope(me, KEY_MANAGE);
    }

    private void gateWriteOrg(OrgMembership me) {
        gateWrite(me);
        if (access.requireScope(me, KEY_MANAGE) != PermissionScope.ORG) throw new OrgNotFoundException();
    }

    private boolean canManage(OrgMembership me) {
        return me.canKey(KEY_MANAGE);
    }

    /** Whether the marketer is one the caller may see (null = everyone). */
    private static boolean visible(Set<Long> visible, Long memberId) {
        return visible == null || visible.contains(memberId);
    }

    // ---- reads: marketers ---------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public MarketerList marketers(OrgMembership me, String q, String status) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        Set<Long> visible = access.visibleIds(me, scope);
        String st = normaliseOrNull(status, MARKETER_STATUSES, "status");
        String search = search(q);
        State s = load(orgId, visible);
        List<Marketer> items = new ArrayList<>();
        for (MarketerCapacity c : s.capacities) {
            if (st != null && !st.equals(c.getStatus())) continue;
            Marketer m = marketer(me, c, s);
            if (search != null && !(m.name().toLowerCase(Locale.ROOT).contains(search) || (m.title() != null && m.title().toLowerCase(Locale.ROOT).contains(search)))) continue;
            items.add(m);
        }
        items.sort(Comparator.comparingInt(Marketer::percent).reversed().thenComparing(Marketer::name, String.CASE_INSENSITIVE_ORDER));
        return new MarketerList(items, summary(s), canManage(me));
    }

    @Transactional(readOnly = true)
    public WorkloadReport workload(OrgMembership me) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        Set<Long> visible = access.visibleIds(me, scope);
        State s = load(orgId, visible);
        Map<Long, Integer> apps = openApplications(orgId);
        Map<Long, Integer> high = new HashMap<>(), paused = new HashMap<>(), noBackup = new HashMap<>(), backups = new HashMap<>(), openApps = new HashMap<>();
        for (MarketerAssignment a : s.assignmentRows) {
            if ("HIGH".equals(a.getPriority())) high.merge(a.getMarketerMemberId(), 1, Integer::sum);
            if ("PAUSED".equals(a.getStatus())) paused.merge(a.getMarketerMemberId(), 1, Integer::sum);
            if (a.getBackupMemberId() == null) noBackup.merge(a.getMarketerMemberId(), 1, Integer::sum);
            else backups.merge(a.getBackupMemberId(), 1, Integer::sum);
            openApps.merge(a.getMarketerMemberId(), apps.getOrDefault(a.getConsultantId(), 0), Integer::sum);
        }
        List<WorkloadRow> rows = new ArrayList<>();
        for (MarketerCapacity c : s.capacities) {
            Marketer m = marketer(me, c, s);
            Long id = c.getMemberId();
            rows.add(new WorkloadRow(
                id, m.name(), m.title(), m.status(), m.capacity(), m.assigned(), m.percent(), m.overloaded(),
                high.getOrDefault(id, 0), paused.getOrDefault(id, 0), noBackup.getOrDefault(id, 0), openApps.getOrDefault(id, 0), backups.getOrDefault(id, 0)
            ));
        }
        rows.sort(Comparator.comparingInt(WorkloadRow::percent).reversed().thenComparing(WorkloadRow::name, String.CASE_INSENSITIVE_ORDER));
        return new WorkloadReport(rows, summary(s), Instant.now(clock));
    }

    // ---- reads: consultants -----------------------------------------------------------------------------------------------------

    /** Sort fields of the consultants table. */
    public static final List<String> SORT_FIELDS = List.of("name", "priority", "status", "activeApps", "lastActivity", "assigned");

    /** The table's parameters; {@code marketerId} null with {@code unassigned} false means every assigned consultant the caller may see. */
    public record ConsultantQuery(
        Long marketerId, Boolean unassigned, String q, String status, String priority, Long clientId, String availability, Boolean noBackup, String sort, Integer page, Integer size
    ) {}

    @Transactional(readOnly = true)
    public Page consultants(OrgMembership me, ConsultantQuery q) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        Set<Long> visible = access.visibleIds(me, scope);
        int page = q.page() == null ? 0 : q.page();
        int size = q.size() == null ? DEFAULT_SIZE : q.size();
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be between 1 and " + MAX_SIZE);
        String status = normaliseOrNull(q.status(), ASSIGNMENT_STATUSES, "status");
        String priority = normaliseOrNull(q.priority(), PRIORITIES, "priority");
        String availability = normaliseOrNull(q.availability(), AVAILABILITIES, "availability");
        String search = search(q.q());
        State s = load(orgId, visible);
        if (q.marketerId() != null && s.capacityOf(q.marketerId()) == null) throw new OrgNotFoundException();
        boolean unassigned = Boolean.TRUE.equals(q.unassigned());

        Set<Long> clientMatch = null;
        if (q.clientId() != null) {
            if (!me.canKey(KEY_CLIENTS)) throw new OrgNotFoundException();
            clientMatch = new HashSet<>(board.consultantIdsWithApplicationAt(orgId, q.clientId()));
            clientMatch.addAll(board.consultantIdsPlacedAt(orgId, q.clientId()));
        }
        Set<Long> searchMatch = null;
        if (search != null) {
            String pattern = "%" + escapeLike(search) + "%";
            searchMatch = new HashSet<>(board.consultantIdsBySkill(orgId, pattern));
            if (me.canKey(KEY_CLIENTS)) searchMatch.addAll(board.consultantIdsByClientName(orgId, pattern));
        }
        Map<Long, Integer> apps = openApplications(orgId);
        Map<Long, String> names = names(orgId, s.seatIds());

        List<Row> rows = new ArrayList<>();
        for (ConsultantProfile c : s.consultantsActive) {
            MarketerAssignment a = s.assignmentByConsultant.get(c.getId());
            if (unassigned) {
                if (a != null) continue;
            } else {
                if (a == null) continue;
                if (q.marketerId() != null && !q.marketerId().equals(a.getMarketerMemberId())) continue;
                if (!visible(visible, a.getMarketerMemberId())) continue;
                if (status != null && !status.equals(a.getStatus())) continue;
                if (priority != null && !priority.equals(a.getPriority())) continue;
                if (Boolean.TRUE.equals(q.noBackup()) && a.getBackupMemberId() != null) continue;
            }
            if (availability != null && !availability.equals(c.getAvailabilityStatus())) continue;
            if (clientMatch != null && !clientMatch.contains(c.getId())) continue;
            if (search != null) {
                boolean hit = contains(c.getDisplayName(), search) || contains(c.getJobTitle(), search) || contains(c.getEmail(), search) || searchMatch.contains(c.getId());
                if (!hit) continue;
            }
            rows.add(row(c, a, names, apps));
        }
        rows.sort(rowOrder(q.sort()));
        long total = rows.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min((long) from + size, total);
        return new Page(new ArrayList<>(rows.subList(from, to)), page, size, total, to < total);
    }

    @Transactional(readOnly = true)
    public Filters filters(OrgMembership me) {
        viewScope(me);
        List<Option> cs = new ArrayList<>();
        if (me.canKey(KEY_CLIENTS)) {
            for (ClientAccount c : clients.findByOrgIdOrderByNameAsc(me.orgId())) cs.add(new Option(c.getId(), c.getName(), null));
        }
        return new Filters(cs, ASSIGNMENT_STATUSES, PRIORITIES, AVAILABILITIES);
    }

    /** Seats that may be added as marketers: active members with a marketing role and no capacity row yet. */
    @Transactional(readOnly = true)
    public MarketerCandidates candidates(OrgMembership me) {
        viewScope(me);
        gateWriteOrg(me);
        Long orgId = me.orgId();
        Set<Long> have = new HashSet<>();
        for (MarketerCapacity c : capacities.findByOrgId(orgId)) have.add(c.getMemberId());
        List<Option> out = new ArrayList<>();
        for (Object[] r : board.seatsWithRoleKeys(orgId, MARKETING_ROLE_KEYS)) {
            Long id = (Long) r[0];
            if (have.contains(id)) continue;
            out.add(new Option(id, nameOf(r[1], r[2], r[3], null), (String) r[4]));
        }
        out.sort(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER));
        return new MarketerCandidates(out);
    }

    // ---- reads: KPI tiles --------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Kpis kpis(OrgMembership me) {
        PermissionScope scope = viewScope(me);
        Long orgId = me.orgId();
        Set<Long> visible = access.visibleIds(me, scope);
        State s = load(orgId, visible);
        Instant now = Instant.now(clock);
        Instant lastMonth = now.minus(Duration.ofDays(30));
        List<Instant> points = new ArrayList<>();
        for (int k = 0; k < WEEKS; k++) points.add(now.minus(Duration.ofDays(7L * (WEEKS - 1 - k))));
        List<Tile> tiles = new ArrayList<>();
        tiles.add(tile("assigned", s, now, lastMonth, points, "UP", Snapshot.ASSIGNED));
        tiles.add(tile("marketers", s, now, lastMonth, points, "UP", Snapshot.MARKETERS));
        tiles.add(tile("unassigned", s, now, lastMonth, points, "DOWN", Snapshot.UNASSIGNED));
        tiles.add(tile("overloaded", s, now, lastMonth, points, "DOWN", Snapshot.OVERLOADED));
        return new Kpis(tiles, now, NOTE);
    }

    private enum Snapshot { ASSIGNED, MARKETERS, UNASSIGNED, OVERLOADED }

    private Tile tile(String key, State s, Instant now, Instant lastMonth, List<Instant> points, String good, Snapshot what) {
        long current = at(s, now, what);
        long previous = at(s, lastMonth, what);
        List<Long> series = new ArrayList<>();
        for (Instant p : points) series.add(at(s, p, what));
        long delta = current - previous;
        Double pct = previous == 0 ? null : Math.round(delta * 1000.0 / previous) / 1000.0;
        return new Tile(key, current, previous, delta, pct, series, good);
    }

    /** The figure as the rows stand at {@code t}: rows that did not exist yet are left out; changes since are not known. */
    private long at(State s, Instant t, Snapshot what) {
        switch (what) {
            case ASSIGNED -> {
                return s.assignmentRows.stream().filter(a -> !a.getAssignedAt().isAfter(t)).count();
            }
            case MARKETERS -> {
                return s.capacities.stream().filter(c -> "ACTIVE".equals(c.getStatus()) && !c.getCreatedAt().isAfter(t)).count();
            }
            case UNASSIGNED -> {
                long existing = s.consultantsActive.stream().filter(c -> !c.getCreatedAt().isAfter(t)).count();
                Set<Long> existingIds = new HashSet<>();
                for (ConsultantProfile c : s.consultantsActive) if (!c.getCreatedAt().isAfter(t)) existingIds.add(c.getId());
                long assigned = s.assignmentRows.stream().filter(a -> !a.getAssignedAt().isAfter(t) && existingIds.contains(a.getConsultantId())).count();
                return Math.max(0, existing - assigned);
            }
            default -> {
                Map<Long, Integer> per = new HashMap<>();
                for (MarketerAssignment a : s.assignmentRows) if (!a.getAssignedAt().isAfter(t)) per.merge(a.getMarketerMemberId(), 1, Integer::sum);
                return s.capacities.stream()
                    .filter(c -> "ACTIVE".equals(c.getStatus()) && !c.getCreatedAt().isAfter(t))
                    .filter(c -> overloaded(per.getOrDefault(c.getMemberId(), 0), c.getCapacity()))
                    .count();
            }
        }
    }

    // ---- writes: assignments --------------------------------------------------------------------------------------------------------

    /** Assigns or reassigns the named consultants to one marketer. 409 {@code OVER_CAPACITY} when it would push the marketer past capacity without the override. */
    public BulkResult assign(OrgMembership me, AssignRequest req) {
        gateWrite(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.consultantIds());
        if (req.marketerMemberId() == null) throw OrgException.invalid("marketerMemberId", "is required");
        String priority = req.priority() == null ? null : oneOf("priority", req.priority(), PRIORITIES);
        String status = req.status() == null ? null : oneOf("status", req.status(), ASSIGNMENT_STATUSES);
        Long orgId = me.orgId();
        MarketerCapacity target = capacities.findByOrgIdAndMemberId(orgId, req.marketerMemberId()).orElse(null);
        if (target == null || !access.canAct(me, KEY_MANAGE, target.getMemberId())) throw new OrgNotFoundException();
        if (!"ACTIVE".equals(target.getStatus())) throw OrgException.coded(422, CODE_MARKETER_INVALID, "This marketer is paused and takes no new consultants", Map.of("marketerMemberId", target.getMemberId()));
        if (req.backupMemberId() != null) {
            if (req.backupMemberId().equals(req.marketerMemberId())) throw OrgException.coded(422, REASON_BACKUP_SAME, "The backup cannot be the marketer", Map.of());
            if (capacities.findByOrgIdAndMemberId(orgId, req.backupMemberId()).isEmpty()) throw OrgException.coded(422, CODE_MARKETER_INVALID, "The backup is not a marketer", Map.of());
        }
        State s = load(orgId, null);
        // capacity: how many of the named consultants would be NEW to this marketer
        int adds = 0;
        for (Long id : ids) {
            ConsultantProfile c = s.consultantById.get(id);
            if (c == null || !"ACTIVE".equals(c.getStatus())) continue;
            MarketerAssignment a = s.assignmentByConsultant.get(id);
            if (a == null || !target.getMemberId().equals(a.getMarketerMemberId())) adds++;
        }
        long current = s.countFor(target.getMemberId());
        long projected = current + adds;
        boolean over = projected > target.getCapacity();
        if (over && !Boolean.TRUE.equals(req.allowOverCapacity())) {
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("marketerMemberId", target.getMemberId());
            extra.put("capacity", target.getCapacity());
            extra.put("current", current);
            extra.put("adding", adds);
            extra.put("projected", projected);
            throw OrgException.coded(409, CODE_OVER_CAPACITY, "This would put the marketer over capacity", extra);
        }
        Instant now = Instant.now(clock);
        List<RowResult> results = new ArrayList<>();
        for (Long id : ids) {
            ConsultantProfile c = s.consultantById.get(id);
            if (c == null || !"ACTIVE".equals(c.getStatus())) {
                results.add(skip(id, REASON_NOT_FOUND));
                continue;
            }
            MarketerAssignment a = s.assignmentByConsultant.get(id);
            if (a != null && !access.canAct(me, KEY_MANAGE, a.getMarketerMemberId())) {
                results.add(skip(id, REASON_NOT_FOUND)); // someone else's consultant, outside the caller's scope
                continue;
            }
            Map<String, Object> previous = a == null ? null : snapshot(a);
            boolean marketerChanges = a == null || !target.getMemberId().equals(a.getMarketerMemberId());
            MarketerAssignment row = a == null ? new MarketerAssignment() : a;
            boolean changed = a == null;
            if (a == null) {
                row.setOrgId(orgId);
                row.setConsultantId(id);
            }
            if (marketerChanges) {
                row.setMarketerMemberId(target.getMemberId());
                row.setAssignedAt(now);
                row.setAssignedByMemberId(me.memberId());
                changed = true;
                if (row.getBackupMemberId() != null && row.getBackupMemberId().equals(target.getMemberId())) row.setBackupMemberId(null);
            }
            if (req.backupMemberId() != null && !req.backupMemberId().equals(row.getBackupMemberId())) {
                row.setBackupMemberId(req.backupMemberId());
                changed = true;
            }
            if (priority != null && !priority.equals(row.getPriority())) {
                row.setPriority(priority);
                changed = true;
            }
            if (status != null && !status.equals(row.getStatus())) {
                row.setStatus(status);
                changed = true;
            }
            if (!changed) {
                results.add(new RowResult(id, true, REASON_UNCHANGED, null));
                continue;
            }
            row.setLastActivityAt(now);
            assignments.save(row);
            s.assignmentByConsultant.put(id, row);
            Map<String, Object> details = new LinkedHashMap<>();
            details.put("to", target.getMemberId());
            if (previous != null) details.put("from", previous.get("marketerMemberId"));
            if (over) details.put("overCapacity", true);
            audit(me, marketerChanges ? (a == null ? AUDIT_ASSIGN : AUDIT_REASSIGN) : AUDIT_UPDATE, id, details, over ? "MEDIUM" : "LOW");
            results.add(new RowResult(id, true, null, previous == null ? Map.of() : previous));
        }
        return finish(me, ACTION_ASSIGN, ids, results, over);
    }

    /** Sets the priority, the status or the backup marketer of assignments the caller manages. */
    public BulkResult update(OrgMembership me, UpdateRequest req) {
        gateWrite(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.consultantIds());
        boolean clear = Boolean.TRUE.equals(req.clearBackup());
        int given = (req.priority() != null ? 1 : 0) + (req.status() != null ? 1 : 0) + (req.backupMemberId() != null ? 1 : 0) + (clear ? 1 : 0);
        if (given != 1) throw OrgException.invalid("priority", "name exactly one of priority, status, backupMemberId or clearBackup");
        String priority = req.priority() == null ? null : oneOf("priority", req.priority(), PRIORITIES);
        String status = req.status() == null ? null : oneOf("status", req.status(), ASSIGNMENT_STATUSES);
        Long orgId = me.orgId();
        if (req.backupMemberId() != null && capacities.findByOrgIdAndMemberId(orgId, req.backupMemberId()).isEmpty()) {
            throw OrgException.coded(422, CODE_MARKETER_INVALID, "The backup is not a marketer", Map.of());
        }
        State s = load(orgId, null);
        Instant now = Instant.now(clock);
        List<RowResult> results = new ArrayList<>();
        for (Long id : ids) {
            MarketerAssignment a = s.assignmentByConsultant.get(id);
            if (a == null) {
                results.add(skip(id, s.consultantById.containsKey(id) ? REASON_NO_ASSIGNMENT : REASON_NOT_FOUND));
                continue;
            }
            if (!access.canAct(me, KEY_MANAGE, a.getMarketerMemberId())) {
                results.add(skip(id, REASON_NOT_FOUND));
                continue;
            }
            if (req.backupMemberId() != null && req.backupMemberId().equals(a.getMarketerMemberId())) {
                results.add(skip(id, REASON_BACKUP_SAME));
                continue;
            }
            Map<String, Object> previous = snapshot(a);
            boolean changed = false;
            if (priority != null && !priority.equals(a.getPriority())) {
                a.setPriority(priority);
                changed = true;
            }
            if (status != null && !status.equals(a.getStatus())) {
                a.setStatus(status);
                changed = true;
            }
            if (req.backupMemberId() != null && !req.backupMemberId().equals(a.getBackupMemberId())) {
                a.setBackupMemberId(req.backupMemberId());
                changed = true;
            }
            if (clear && a.getBackupMemberId() != null) {
                a.setBackupMemberId(null);
                changed = true;
            }
            if (!changed) {
                results.add(new RowResult(id, true, REASON_UNCHANGED, null));
                continue;
            }
            a.setLastActivityAt(now);
            assignments.save(a);
            Map<String, Object> details = new LinkedHashMap<>();
            if (priority != null) details.put("priority", priority);
            if (status != null) details.put("status", status);
            if (req.backupMemberId() != null) details.put("backup", req.backupMemberId());
            if (clear) details.put("backup", null);
            audit(me, AUDIT_UPDATE, id, details, "LOW");
            results.add(new RowResult(id, true, null, previous));
        }
        return finish(me, ACTION_UPDATE, ids, results, false);
    }

    /** Removes the assignment of the named consultants (they become unassigned). */
    public BulkResult unassign(OrgMembership me, UnassignRequest req) {
        gateWrite(me);
        if (req == null) throw OrgException.invalid("body", "is required");
        List<Long> ids = cleanIds(req.consultantIds());
        State s = load(me.orgId(), null);
        List<RowResult> results = new ArrayList<>();
        for (Long id : ids) {
            MarketerAssignment a = s.assignmentByConsultant.get(id);
            if (a == null) {
                results.add(skip(id, s.consultantById.containsKey(id) ? REASON_NO_ASSIGNMENT : REASON_NOT_FOUND));
                continue;
            }
            if (!access.canAct(me, KEY_MANAGE, a.getMarketerMemberId())) {
                results.add(skip(id, REASON_NOT_FOUND));
                continue;
            }
            Map<String, Object> previous = snapshot(a);
            assignments.delete(a);
            s.assignmentByConsultant.remove(id);
            audit(me, AUDIT_UNASSIGN, id, Map.of("from", a.getMarketerMemberId()), "LOW");
            results.add(new RowResult(id, true, null, previous));
        }
        return finish(me, ACTION_UNASSIGN, ids, results, false);
    }

    /** Puts assignments back exactly as an earlier answer's {@code previous} said (the Undo of an assign, a reassign or an unassign). No capacity check: it restores a state that existed. */
    public BulkResult restore(OrgMembership me, RestoreRequest req) {
        gateWrite(me);
        if (req == null || req.rows() == null || req.rows().isEmpty()) throw OrgException.invalid("rows", "name at least one assignment");
        if (req.rows().size() > MarketingAssignmentsDTO.BULK_MAX) throw OrgException.invalid("rows", "at most " + MarketingAssignmentsDTO.BULK_MAX + " per call");
        Long orgId = me.orgId();
        State s = load(orgId, null);
        Instant now = Instant.now(clock);
        List<Long> ids = new ArrayList<>();
        List<RowResult> results = new ArrayList<>();
        Set<Long> seen = new LinkedHashSet<>();
        for (RestoreRow r : req.rows()) {
            Long id = r == null ? null : r.consultantId();
            if (id == null || id <= 0) throw OrgException.invalid("rows", "each row names a consultant");
            if (!seen.add(id)) continue;
            ids.add(id);
            ConsultantProfile c = s.consultantById.get(id);
            MarketerAssignment a = s.assignmentByConsultant.get(id);
            if (c == null || (a != null && !access.canAct(me, KEY_MANAGE, a.getMarketerMemberId()))) {
                results.add(skip(id, REASON_NOT_FOUND));
                continue;
            }
            if (r.marketerMemberId() == null) { // there was no assignment: take it away again
                if (a == null) {
                    results.add(new RowResult(id, true, REASON_UNCHANGED, null));
                    continue;
                }
                Map<String, Object> previous = snapshot(a);
                assignments.delete(a);
                s.assignmentByConsultant.remove(id);
                audit(me, AUDIT_RESTORE, id, Map.of("to", "NONE"), "LOW");
                results.add(new RowResult(id, true, null, previous));
                continue;
            }
            if (!access.canAct(me, KEY_MANAGE, r.marketerMemberId()) || capacities.findByOrgIdAndMemberId(orgId, r.marketerMemberId()).isEmpty()) {
                results.add(skip(id, REASON_NOT_FOUND));
                continue;
            }
            if (r.backupMemberId() != null && (r.backupMemberId().equals(r.marketerMemberId()) || capacities.findByOrgIdAndMemberId(orgId, r.backupMemberId()).isEmpty())) {
                results.add(skip(id, REASON_BACKUP_SAME));
                continue;
            }
            String priority = oneOf("priority", r.priority() == null ? "MEDIUM" : r.priority(), PRIORITIES);
            String status = oneOf("status", r.status() == null ? "ACTIVE" : r.status(), ASSIGNMENT_STATUSES);
            Map<String, Object> previous = a == null ? Map.of() : snapshot(a);
            MarketerAssignment row = a == null ? new MarketerAssignment() : a;
            if (a == null) {
                row.setOrgId(orgId);
                row.setConsultantId(id);
                row.setAssignedAt(now);
                row.setAssignedByMemberId(me.memberId());
            }
            if (!r.marketerMemberId().equals(row.getMarketerMemberId()) && a != null) {
                row.setAssignedAt(now);
                row.setAssignedByMemberId(me.memberId());
            }
            row.setMarketerMemberId(r.marketerMemberId());
            row.setBackupMemberId(r.backupMemberId());
            row.setPriority(priority);
            row.setStatus(status);
            row.setLastActivityAt(now);
            assignments.save(row);
            s.assignmentByConsultant.put(id, row);
            audit(me, AUDIT_RESTORE, id, Map.of("to", r.marketerMemberId()), "LOW");
            results.add(new RowResult(id, true, null, previous));
        }
        return finish(me, ACTION_RESTORE, ids, results, false);
    }

    // ---- writes: marketers ---------------------------------------------------------------------------------------------------------

    /** Promotes an existing active member who holds a marketing role to a marketer with a capacity. No account is created. */
    @Transactional
    public Marketer addMarketer(OrgMembership me, AddMarketerRequest req) {
        gateWriteOrg(me);
        if (req == null || req.memberId() == null) throw OrgException.invalid("memberId", "is required");
        Long orgId = me.orgId();
        if (board.countActiveSeatWithRoleKeys(orgId, req.memberId(), MARKETING_ROLE_KEYS) == 0) {
            throw OrgException.coded(422, CODE_MARKETER_INVALID, "Only an active member with a marketing role can be a marketer", Map.of("memberId", req.memberId()));
        }
        if (capacities.findByOrgIdAndMemberId(orgId, req.memberId()).isPresent()) {
            throw OrgException.coded(409, CODE_ALREADY_MARKETER, "This member is already a marketer", Map.of("memberId", req.memberId()));
        }
        int capacity = capacityOf(req.capacity() == null ? DEFAULT_CAPACITY : req.capacity());
        String title = title(req.title());
        MarketerCapacity c = new MarketerCapacity();
        c.setOrgId(orgId);
        c.setMemberId(req.memberId());
        c.setCapacity(capacity);
        c.setStatus("ACTIVE");
        c.setTitleLabel(title);
        capacities.save(c);
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("capacity", capacity);
        audit.record(me.orgId(), me.login(), me.role(), AUDIT_MARKETER_ADD, OrgAuditService.TARGET_MEMBER, null, String.valueOf(req.memberId()), text(details), null, null, null, "LOW");
        State s = load(orgId, null);
        return marketer(me, c, s);
    }

    /** Changes a marketer's capacity, status or title label. Lowering the capacity below the workload is allowed (it shows as overloaded). */
    @Transactional
    public Marketer updateMarketer(OrgMembership me, Long memberId, UpdateMarketerRequest req) {
        gateWrite(me);
        if (req == null || (req.capacity() == null && req.status() == null && req.title() == null)) throw OrgException.invalid("capacity", "name something to change");
        Long orgId = me.orgId();
        MarketerCapacity c = capacities.findByOrgIdAndMemberId(orgId, memberId).orElseThrow(OrgNotFoundException::new);
        if (!access.canAct(me, KEY_MANAGE, memberId)) throw new OrgNotFoundException();
        Map<String, Object> details = new LinkedHashMap<>();
        if (req.capacity() != null) {
            int cap = capacityOf(req.capacity());
            if (cap != c.getCapacity()) details.put("capacity", cap);
            c.setCapacity(cap);
        }
        if (req.status() != null) {
            String st = oneOf("status", req.status(), MARKETER_STATUSES);
            if (!st.equals(c.getStatus())) details.put("status", st);
            c.setStatus(st);
        }
        if (req.title() != null) {
            String t = title(req.title());
            if (!java.util.Objects.equals(t, c.getTitleLabel())) details.put("title", t);
            c.setTitleLabel(t);
        }
        capacities.save(c);
        if (!details.isEmpty()) {
            audit.record(me.orgId(), me.login(), me.role(), AUDIT_MARKETER_UPDATE, OrgAuditService.TARGET_MEMBER, null, String.valueOf(memberId), text(details), null, null, null, "LOW");
        }
        return marketer(me, c, load(orgId, null));
    }

    // ---- internals --------------------------------------------------------------------------------------------------------------------

    /** Everything of the organization the board needs, loaded once per request (an organization has tens of marketers and hundreds of consultants). */
    private final class State {
        final List<MarketerCapacity> capacities = new ArrayList<>();
        final List<MarketerAssignment> assignmentRows = new ArrayList<>();
        final Map<Long, MarketerAssignment> assignmentByConsultant = new HashMap<>();
        final List<ConsultantProfile> consultantsActive = new ArrayList<>();
        final Map<Long, ConsultantProfile> consultantById = new HashMap<>();
        final Map<Long, Long> countByMarketer = new HashMap<>();
        Set<Long> allCapacityIds = new HashSet<>();

        MarketerCapacity capacityOf(Long memberId) {
            for (MarketerCapacity c : capacities) if (c.getMemberId().equals(memberId)) return c;
            return null;
        }

        long countFor(Long memberId) {
            return assignmentByConsultant.values().stream().filter(a -> memberId.equals(a.getMarketerMemberId())).count();
        }

        Set<Long> seatIds() {
            Set<Long> ids = new HashSet<>(allCapacityIds);
            for (MarketerAssignment a : assignmentByConsultant.values()) {
                ids.add(a.getMarketerMemberId());
                if (a.getBackupMemberId() != null) ids.add(a.getBackupMemberId());
            }
            return ids;
        }
    }

    /** {@code visible} narrows the marketers (null = all); assignment rows are always the whole organization's, the callers filter them. */
    private State load(Long orgId, Set<Long> visible) {
        State s = new State();
        for (MarketerCapacity c : capacities.findByOrgId(orgId)) {
            s.allCapacityIds.add(c.getMemberId());
            if (visible(visible, c.getMemberId())) s.capacities.add(c);
        }
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) {
            s.assignmentByConsultant.put(a.getConsultantId(), a);
            if (visible(visible, a.getMarketerMemberId())) s.assignmentRows.add(a);
            s.countByMarketer.merge(a.getMarketerMemberId(), 1L, Long::sum);
        }
        for (ConsultantProfile c : consultants.findByOrgId(orgId)) {
            s.consultantById.put(c.getId(), c);
            if ("ACTIVE".equals(c.getStatus())) s.consultantsActive.add(c);
        }
        return s;
    }

    private Marketer marketer(OrgMembership me, MarketerCapacity c, State s) {
        Map<Long, String> names = names(me.orgId(), Set.of(c.getMemberId()));
        int assigned = s.countByMarketer.getOrDefault(c.getMemberId(), 0L).intValue();
        int pct = c.getCapacity() == null || c.getCapacity() <= 0 ? 0 : (int) Math.round(assigned * 100.0 / c.getCapacity());
        return new Marketer(
            c.getMemberId(), names.getOrDefault(c.getMemberId(), "Member"), c.getTitleLabel(), c.getStatus(), c.getCapacity(), assigned, pct,
            overloaded(assigned, c.getCapacity()), access.canAct(me, KEY_MANAGE, c.getMemberId())
        );
    }

    private Summary summary(State s) {
        int active = 0, total = 0, over = 0;
        for (MarketerCapacity c : s.capacities) {
            int assigned = s.countByMarketer.getOrDefault(c.getMemberId(), 0L).intValue();
            total += assigned;
            if ("ACTIVE".equals(c.getStatus())) {
                active++;
                if (overloaded(assigned, c.getCapacity())) over++;
            }
        }
        int unassigned = (int) s.consultantsActive.stream().filter(c -> !s.assignmentByConsultant.containsKey(c.getId())).count();
        Double avg = active == 0 ? null : Math.round(total * 10.0 / active) / 10.0;
        return new Summary(active, total, avg, over, unassigned);
    }

    static boolean overloaded(int assigned, Integer capacity) {
        return capacity != null && capacity > 0 && assigned * 100L >= (long) TalentDemoSeeder.OVERLOAD_PCT * capacity;
    }

    private Row row(ConsultantProfile c, MarketerAssignment a, Map<Long, String> names, Map<Long, Integer> apps) {
        Person marketer = a == null ? null : new Person(a.getMarketerMemberId(), names.getOrDefault(a.getMarketerMemberId(), "Member"));
        Person backup = a == null || a.getBackupMemberId() == null ? null : new Person(a.getBackupMemberId(), names.getOrDefault(a.getBackupMemberId(), "Member"));
        return new Row(
            c.getId(), c.getDisplayName(), c.getJobTitle(), c.getEmail(), c.getAvailabilityStatus(), marketer, backup,
            a == null ? null : a.getStatus(), a == null ? null : a.getPriority(), apps.getOrDefault(c.getId(), 0),
            a == null ? null : a.getLastActivityAt(), a == null ? null : a.getAssignedAt()
        );
    }

    private static Comparator<Row> rowOrder(String sort) {
        String field = "lastActivity";
        boolean desc = true;
        if (sort != null && !sort.isBlank()) {
            String[] parts = sort.split(",");
            field = parts[0].strip();
            desc = parts.length > 1 && "desc".equalsIgnoreCase(parts[1].strip());
            if (parts.length == 1) desc = false;
            if (!SORT_FIELDS.contains(field)) throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + SORT_FIELDS, Map.of());
        }
        Comparator<Row> byName = Comparator.comparing((Row r) -> r.name() == null ? "" : r.name().toLowerCase(Locale.ROOT));
        Comparator<Row> c = switch (field) {
            case "name" -> byName;
            case "priority" -> Comparator.comparingInt((Row r) -> r.priority() == null ? 9 : PRIORITIES.indexOf(r.priority())).thenComparing(byName);
            case "status" -> Comparator.comparing((Row r) -> r.status() == null ? "" : r.status()).thenComparing(byName);
            case "activeApps" -> Comparator.comparingInt(Row::activeApps).thenComparing(byName);
            case "assigned" -> Comparator.comparing((Row r) -> r.assignedAt() == null ? Instant.EPOCH : r.assignedAt()).thenComparing(byName);
            default -> Comparator.comparing((Row r) -> r.lastActivityAt() == null ? Instant.EPOCH : r.lastActivityAt()).thenComparing(byName);
        };
        return desc ? c.reversed() : c;
    }

    private Map<Long, Integer> openApplications(Long orgId) {
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] r : board.countOpenApplicationsByConsultant(orgId)) out.put((Long) r[0], ((Number) r[1]).intValue());
        return out;
    }

    private Map<Long, String> names(Long orgId, Collection<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        if (ids.isEmpty()) return out;
        for (Object[] r : board.seatNames(orgId, ids)) out.put((Long) r[0], nameOf(r[1], r[2], r[3], r[4]));
        return out;
    }

    private static String nameOf(Object first, Object last, Object label, Object inviteName) {
        String n = ((first == null ? "" : first) + " " + (last == null ? "" : last)).strip();
        if (!n.isEmpty()) return n;
        if (label != null && !label.toString().isBlank()) return label.toString();
        if (inviteName != null && !inviteName.toString().isBlank()) return inviteName.toString();
        return "Member";
    }

    private static Map<String, Object> snapshot(MarketerAssignment a) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("marketerMemberId", a.getMarketerMemberId());
        m.put("backupMemberId", a.getBackupMemberId());
        m.put("priority", a.getPriority());
        m.put("status", a.getStatus());
        return m;
    }

    private static RowResult skip(Long id, String reason) {
        return new RowResult(id, false, reason, null);
    }

    private BulkResult finish(OrgMembership me, String action, List<Long> ids, List<RowResult> results, boolean overCapacity) {
        List<Skipped> skipped = new ArrayList<>();
        int ok = 0;
        for (RowResult r : results) {
            if (r.ok()) ok++;
            else skipped.add(new Skipped(r.consultantId(), r.reason()));
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("action", action);
        summary.put("requested", ids.size());
        summary.put("ok", ok);
        summary.put("skipped", skipped.size());
        if (overCapacity) summary.put("overCapacity", true);
        audit.record(me.orgId(), me.login(), me.role(), AUDIT_BULK, TARGET_CONSULTANT, null, null, text(summary), null, null, null, overCapacity ? "MEDIUM" : "LOW");
        return new BulkResult(action, ids.size(), ok, skipped, results);
    }

    private void audit(OrgMembership me, String action, Long consultantId, Map<String, Object> details, String risk) {
        audit.record(me.orgId(), me.login(), me.role(), action, TARGET_CONSULTANT, null, String.valueOf(consultantId), text(details), null, null, null, risk);
    }

    private String text(Object o) {
        try {
            return json.writeValueAsString(o);
        } catch (JsonProcessingException e) {
            return String.valueOf(o);
        }
    }

    private static List<Long> cleanIds(List<Long> raw) {
        if (raw == null || raw.isEmpty()) throw OrgException.invalid("consultantIds", "name at least one consultant");
        if (raw.size() > MarketingAssignmentsDTO.BULK_MAX) throw OrgException.invalid("consultantIds", "at most " + MarketingAssignmentsDTO.BULK_MAX + " consultants per call");
        LinkedHashSet<Long> ids = new LinkedHashSet<>();
        for (Long id : raw) {
            if (id == null || id <= 0) throw OrgException.invalid("consultantIds", "must be consultant ids");
            ids.add(id);
        }
        return new ArrayList<>(ids);
    }

    /** Validates the body of a change without touching anything (the endpoint calls it before it opens the idempotent transaction). */
    public void validate(Object body) {
        if (body == null) throw OrgException.invalid("body", "is required");
        if (body instanceof AssignRequest r) {
            cleanIds(r.consultantIds());
            if (r.marketerMemberId() == null) throw OrgException.invalid("marketerMemberId", "is required");
            if (r.priority() != null) oneOf("priority", r.priority(), PRIORITIES);
            if (r.status() != null) oneOf("status", r.status(), ASSIGNMENT_STATUSES);
        } else if (body instanceof UpdateRequest r) {
            cleanIds(r.consultantIds());
            if (r.priority() != null) oneOf("priority", r.priority(), PRIORITIES);
            if (r.status() != null) oneOf("status", r.status(), ASSIGNMENT_STATUSES);
        } else if (body instanceof UnassignRequest r) {
            cleanIds(r.consultantIds());
        } else if (body instanceof RestoreRequest r) {
            if (r.rows() == null || r.rows().isEmpty()) throw OrgException.invalid("rows", "name at least one assignment");
        }
    }

    private static String oneOf(String field, String raw, List<String> allowed) {
        String v = raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + allowed);
        return v;
    }

    private static String normaliseOrNull(String raw, List<String> allowed, String field) {
        if (raw == null || raw.isBlank() || "ALL".equalsIgnoreCase(raw.strip())) return null;
        return oneOf(field, raw, allowed);
    }

    private static int capacityOf(int capacity) {
        if (capacity < 1 || capacity > MAX_CAPACITY) throw OrgException.invalid("capacity", "must be between 1 and " + MAX_CAPACITY);
        return capacity;
    }

    private static String title(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String t = raw.strip();
        if (t.length() > 80) throw OrgException.invalid("title", "at most 80 characters");
        SensitiveContent.check("title", "title", t);
        return t;
    }

    private static String search(String q) {
        if (q == null || q.isBlank()) return null;
        String t = q.strip().toLowerCase(Locale.ROOT);
        if (t.length() < 2 || t.length() > 80) throw OrgException.invalid("q", "must be 2 to 80 characters");
        return t;
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needle);
    }

    private static String escapeLike(String s) {
        return s.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }
}
