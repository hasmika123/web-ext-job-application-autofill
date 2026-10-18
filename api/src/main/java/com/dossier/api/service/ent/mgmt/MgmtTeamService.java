package com.dossier.api.service.ent.mgmt;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MgmtTeamRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.marketing.MarketingAssignmentsService;
import com.dossier.api.service.ent.marketing.MarketingSettings;
import com.dossier.api.service.ent.mkt.approvals.ApprovalService;
import com.dossier.api.service.ent.mkt.escalations.EscalationService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Team page of the Marketing Manager workspace (MM-06): the marketers of {@link TeamScope} with their load, what waits on them and when they were last active;
 * one marketer in full (the consultants they carry, eight weeks of work, their open approvals and escalations); and the edits a manager may make to a marketer of
 * their team (capacity, paused or active, title), which are {@link MarketingAssignmentsService#updateMarketer} unchanged, so the audit row and the rules are the
 * admin board's. Reads need {@code member.view_summary} at TEAM scope or wider (and the team key {@code workload.view}); a marketer outside the team and an unknown id
 * are the generic 404. Display names and counts only.
 */
@Service
public class MgmtTeamService {

    public static final String KEY_VIEW = "member.view_summary";
    public static final String KEY_MANAGE = "assignments.manage";
    static final int WEEKS = 8;
    static final int ITEMS_SHOWN = 10;
    static final int MAX_SIZE = 100;
    static final int DEFAULT_SIZE = 20;
    public static final List<String> SORTS = List.of("name", "load", "approvals", "escalations", "activity");

    private final TeamScope teamScope;
    private final MarketerCapacityRepository capacities;
    private final MarketerAssignmentRepository assignments;
    private final MgmtTeamRepository facts;
    private final MgmtLookupRepository lookup;
    private final ApplicationNames names;
    private final MarketingSettings marketing;
    private final MarketingAssignmentsService marketers;
    private final ApprovalService approvals;
    private final EscalationService escalations;
    private final Clock clock;

    @Autowired
    public MgmtTeamService(
        TeamScope teamScope,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MgmtTeamRepository facts,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        MarketingSettings marketing,
        MarketingAssignmentsService marketers,
        ApprovalService approvals,
        EscalationService escalations
    ) {
        this(teamScope, capacities, assignments, facts, lookup, names, marketing, marketers, approvals, escalations, Clock.systemUTC());
    }

    MgmtTeamService(
        TeamScope teamScope,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MgmtTeamRepository facts,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        MarketingSettings marketing,
        MarketingAssignmentsService marketers,
        ApprovalService approvals,
        EscalationService escalations,
        Clock clock
    ) {
        this.teamScope = teamScope;
        this.capacities = capacities;
        this.assignments = assignments;
        this.facts = facts;
        this.lookup = lookup;
        this.names = names;
        this.marketing = marketing;
        this.marketers = marketers;
        this.approvals = approvals;
        this.escalations = escalations;
        this.clock = clock;
    }

    // ---- the list --------------------------------------------------------------------------------------------------------------------

    /** The Team page: the gate and one page of rows. */
    @Transactional(readOnly = true)
    public TeamRowDTO.Page list(OrgMembership me, TeamRowDTO.Filter f, int page, int size) {
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be between 1 and " + MAX_SIZE);
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY_VIEW);
        return team(me, team, f, page, size);
    }

    /** The rows of the team, filtered, sorted and paged. */
    @Transactional(readOnly = true)
    public TeamRowDTO.Page team(OrgMembership me, TeamScope.View team, TeamRowDTO.Filter f, int page, int size) {
        List<TeamRowDTO> all = rows(me, team);
        String status = f == null || f.status() == null || f.status().isBlank() || "ALL".equalsIgnoreCase(f.status().strip()) ? null : f.status().strip().toUpperCase(Locale.ROOT);
        if (status != null && !status.equals("ACTIVE") && !status.equals("PAUSED")) throw OrgException.invalid("status", "must be ACTIVE, PAUSED or ALL");
        String q = f == null || f.q() == null || f.q().isBlank() ? null : f.q().strip().toLowerCase(Locale.ROOT);
        if (q != null && (q.length() < 2 || q.length() > 80)) throw OrgException.invalid("q", "must be 2 to 80 characters");
        List<TeamRowDTO> out = new ArrayList<>();
        for (TeamRowDTO r : all) {
            if (status != null && !status.equals(r.status())) continue;
            if (q != null && !(r.name().toLowerCase(Locale.ROOT).contains(q) || (r.title() != null && r.title().toLowerCase(Locale.ROOT).contains(q)))) continue;
            out.add(r);
        }
        out.sort(order(f == null ? null : f.sort()));
        long total = out.size();
        int from = (int) Math.min((long) page * size, total);
        int to = (int) Math.min((long) from + size, total);
        return new TeamRowDTO.Page(new ArrayList<>(out.subList(from, to)), page, size, total, to < total);
    }

    /** Every marketer of the team as a row (unsorted). */
    private List<TeamRowDTO> rows(OrgMembership me, TeamScope.View team) {
        Long orgId = team.orgId();
        if (team.empty()) return List.of();
        Set<Long> ids = team.marketerMemberIds();
        int overloadPct = marketing.overloadPct(orgId);
        Map<Long, MarketerCapacity> capacity = new HashMap<>();
        for (MarketerCapacity c : capacities.findByOrgId(orgId)) if (ids.contains(c.getMemberId())) capacity.put(c.getMemberId(), c);
        Map<Long, Integer> carried = new HashMap<>();
        Map<Long, Instant> lastAssignmentActivity = new HashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) {
            if (!ids.contains(a.getMarketerMemberId())) continue;
            carried.merge(a.getMarketerMemberId(), 1, Integer::sum);
            if (a.getLastActivityAt() != null) lastAssignmentActivity.merge(a.getMarketerMemberId(), a.getLastActivityAt(), (x, y) -> x.isAfter(y) ? x : y);
        }
        Map<Long, Integer> approvalCounts = counts(facts.pendingApprovalsByRequester(orgId, ids));
        Map<Long, Integer> escalationCounts = counts(facts.openEscalationsByMarketer(orgId, ids));
        Map<Long, Instant> lastActivity = new HashMap<>(lastAssignmentActivity);
        for (Object[] r : facts.lastActivityByActor(orgId, ids)) lastActivity.merge((Long) r[0], (Instant) r[1], (x, y) -> x.isAfter(y) ? x : y);
        Map<Long, String> who = names.memberNames(orgId, ids);
        List<TeamRowDTO> out = new ArrayList<>();
        for (Long id : ids) {
            MarketerCapacity c = capacity.get(id);
            int cap = c == null || c.getCapacity() == null ? 0 : c.getCapacity();
            int assigned = carried.getOrDefault(id, 0);
            int percent = cap <= 0 ? 0 : (int) Math.round(assigned * 100.0 / cap);
            boolean over = cap > 0 && assigned * 100L >= (long) overloadPct * cap;
            out.add(new TeamRowDTO(
                id, who.getOrDefault(id, "Member"), c == null ? null : c.getTitleLabel(), c == null ? "UNSET" : c.getStatus(), cap, assigned, percent, over,
                approvalCounts.getOrDefault(id, 0), escalationCounts.getOrDefault(id, 0), lastActivity.get(id), c != null && me != null && me.canKey(KEY_MANAGE)
            ));
        }
        return out;
    }

    private static Map<Long, Integer> counts(List<Object[]> rows) {
        Map<Long, Integer> out = new HashMap<>();
        for (Object[] r : rows) out.put((Long) r[0], ((Number) r[1]).intValue());
        return out;
    }

    private static Comparator<TeamRowDTO> order(String sort) {
        String field = "name";
        boolean reverse = false;
        if (sort != null && !sort.isBlank()) {
            String s = sort.strip();
            if (s.startsWith("-")) {
                reverse = true;
                s = s.substring(1);
            }
            field = s;
            if (!SORTS.contains(field)) throw OrgException.coded(400, "SORT_INVALID", "Sort by one of " + SORTS + " (a leading minus reverses it)", Map.of());
        }
        Comparator<TeamRowDTO> byName = Comparator.comparing((TeamRowDTO r) -> r.name().toLowerCase(Locale.ROOT)).thenComparing(TeamRowDTO::memberId);
        Comparator<TeamRowDTO> c = switch (field) {
            case "load" -> Comparator.comparingInt(TeamRowDTO::percent).reversed().thenComparing(byName);
            case "approvals" -> Comparator.comparingInt(TeamRowDTO::openApprovals).reversed().thenComparing(byName);
            case "escalations" -> Comparator.comparingInt(TeamRowDTO::openEscalations).reversed().thenComparing(byName);
            case "activity" -> Comparator.comparing((TeamRowDTO r) -> r.lastActiveAt() == null ? Instant.EPOCH : r.lastActiveAt()).reversed().thenComparing(byName);
            default -> byName;
        };
        return reverse ? c.reversed() : c;
    }

    // ---- one marketer -------------------------------------------------------------------------------------------------------------------

    /** The gate and one marketer of the team in full. A marketer outside the team or unknown: the generic 404. */
    @Transactional(readOnly = true)
    public TeamMemberDTO member(OrgMembership me, Long memberId) {
        return member(me, teamScope.resolve(me, AuthzOperation.READ, KEY_VIEW), memberId);
    }

    @Transactional(readOnly = true)
    public TeamMemberDTO member(OrgMembership me, TeamScope.View team, Long memberId) {
        teamScope.require(team, memberId);
        Long orgId = team.orgId();
        TeamRowDTO row = rows(me, team).stream().filter(r -> r.memberId().equals(memberId)).findFirst().orElseThrow(OrgNotFoundException::new);

        List<MarketerAssignment> mine = new ArrayList<>();
        Set<Long> consultantIds = new HashSet<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) {
            if (memberId.equals(a.getMarketerMemberId()) || memberId.equals(a.getBackupMemberId())) {
                mine.add(a);
                consultantIds.add(a.getConsultantId());
            }
        }
        Map<Long, String> consultantNames = new HashMap<>();
        if (!consultantIds.isEmpty()) for (Object[] c : lookup.consultantNames(orgId, consultantIds)) consultantNames.put((Long) c[0], (String) c[1]);
        List<TeamMemberDTO.ConsultantRow> consultants = new ArrayList<>();
        for (MarketerAssignment a : mine) {
            consultants.add(new TeamMemberDTO.ConsultantRow(a.getConsultantId(), consultantNames.getOrDefault(a.getConsultantId(), "Consultant"), a.getPriority(), a.getStatus(), !memberId.equals(a.getMarketerMemberId())));
        }
        consultants.sort(Comparator.comparing((TeamMemberDTO.ConsultantRow c) -> c.name().toLowerCase(Locale.ROOT)));

        return new TeamMemberDTO(
            row,
            consultants,
            weeks(orgId, consultantIds),
            approvals.pending(team, new ApprovalService.Filter("PENDING", null, memberId), PageRequest.of(0, ITEMS_SHOWN)).getContent(),
            escalations.openOf(team, memberId, ITEMS_SHOWN)
        );
    }

    /** Eight weeks, oldest first, each with its Monday. */
    private List<TeamMemberDTO.WeekPoint> weeks(Long orgId, Set<Long> consultantIds) {
        LocalDate thisMonday = clock.instant().atOffset(ZoneOffset.UTC).toLocalDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        LocalDate first = thisMonday.minusWeeks(WEEKS - 1L);
        Map<LocalDate, long[]> buckets = new TreeMap<>();
        for (LocalDate w = first; !w.isAfter(thisMonday); w = w.plusWeeks(1)) buckets.put(w, new long[3]);
        if (!consultantIds.isEmpty()) {
            Collection<Long> ids = consultantIds;
            Instant from = first.atStartOfDay().toInstant(ZoneOffset.UTC);
            for (Instant t : facts.assignedAt(orgId, ids, from)) bump(buckets, t.atOffset(ZoneOffset.UTC).toLocalDate(), 0);
            for (LocalDate d : facts.submittedOn(orgId, ids, first)) if (d != null) bump(buckets, d, 1);
            for (Instant t : facts.interviewsAt(orgId, ids, from)) bump(buckets, t.atOffset(ZoneOffset.UTC).toLocalDate(), 2);
        }
        List<TeamMemberDTO.WeekPoint> out = new ArrayList<>();
        buckets.forEach((w, v) -> out.add(new TeamMemberDTO.WeekPoint(w.toString(), v[0], v[1], v[2])));
        return out;
    }

    private static void bump(Map<LocalDate, long[]> buckets, LocalDate day, int slot) {
        long[] b = buckets.get(day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)));
        if (b != null) b[slot]++;
    }

    // ---- editing a marketer ------------------------------------------------------------------------------------------------------------

    /**
     * Changes the capacity, the status (ACTIVE or PAUSED) or the title of a marketer of the team: {@link MarketingAssignmentsService#updateMarketer}, so the
     * checks, the bounds and the one MARKETER_UPDATE audit row are the admin board's. The permission wall is {@code assignments.manage} at TEAM or wider, then the team.
     */
    @Transactional
    public MarketingAssignmentsDTO.Marketer update(OrgMembership me, Long memberId, MarketingAssignmentsDTO.UpdateMarketerRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        teamScope.require(team, memberId);
        return marketers.updateMarketer(me, memberId, req);
    }

    /** The permission wall of the edit: callable on its own so the route can refuse before it looks at the Idempotency-Key header. */
    public void gateWrite(OrgMembership me) {
        teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
    }
}
