package com.dossier.api.service.ent.mgmt;

import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.repository.ent.mgmt.MgmtTeamRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.BulkResult;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.RowResult;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO.Skipped;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.marketing.MarketingAssignmentsService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Manager's Consultant Assignments and Workload (MM-07). There is NO second writer: every change is {@link MarketingAssignmentsService}'s own, with its
 * capacity rule, its history line, its hand-over of open work, its audit rows and its Undo (`previous` -> /restore). This class only adds the manager's wall in front:
 * the team ({@link TeamScope}) and the key {@code assignments.manage} (reads {@code workload.view}). A marketer outside the team is the generic 404 for the whole call; a
 * consultant carried by someone outside the team is skipped as NOT_FOUND, exactly as the admin board skips a consultant it cannot reach.
 */
@Service
public class MgmtAssignmentsService {

    public static final String KEY_MANAGE = "assignments.manage";
    public static final String KEY_VIEW = "workload.view";
    static final int WEEKS = 8;

    private final TeamScope teamScope;
    private final MarketingAssignmentsService assignments;
    private final MarketerAssignmentRepository rows;
    private final MgmtTeamRepository facts;
    private final Clock clock;

    @Autowired
    public MgmtAssignmentsService(TeamScope teamScope, MarketingAssignmentsService assignments, MarketerAssignmentRepository rows, MgmtTeamRepository facts) {
        this(teamScope, assignments, rows, facts, Clock.systemUTC());
    }

    MgmtAssignmentsService(TeamScope teamScope, MarketingAssignmentsService assignments, MarketerAssignmentRepository rows, MgmtTeamRepository facts, Clock clock) {
        this.teamScope = teamScope;
        this.assignments = assignments;
        this.rows = rows;
        this.facts = facts;
        this.clock = clock;
    }

    // ---- reads ----------------------------------------------------------------------------------------------------------------------

    /** The consultants table of the team: {@link MarketingAssignmentsService#consultants} narrowed to the team's marketers. */
    @Transactional(readOnly = true)
    public MarketingAssignmentsDTO.Page consultants(OrgMembership me, MarketingAssignmentsService.ConsultantQuery q) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY_MANAGE);
        return assignments.consultants(me, q, team);
    }

    /** One consultant's assignment history; a consultant carried outside the team (or unknown) is the generic 404. */
    @Transactional(readOnly = true)
    public MarketingAssignmentsDTO.History history(OrgMembership me, Long consultantId) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY_MANAGE);
        teamScope.requireConsultant(team, consultantId);
        return assignments.history(me, consultantId);
    }

    /** The workload of the team with eight weekly load points per marketer (rebuilt from the assignment history). */
    @Transactional(readOnly = true)
    public MgmtAssignmentsDTO.Workload workload(OrgMembership me) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY_VIEW);
        MarketingAssignmentsDTO.WorkloadReport report = assignments.workload(me, team);
        Instant now = clock.instant();
        List<Instant> ends = new ArrayList<>();
        for (int k = 0; k < WEEKS; k++) ends.add(now.minus(Duration.ofDays(7L * (WEEKS - 1 - k))));
        Map<Long, int[]> delta = new HashMap<>(); // marketer -> net change of their load after each week end (to be subtracted from today's load)
        Instant first = ends.get(0);
        Set<Long> ids = new LinkedHashSet<>();
        for (MarketingAssignmentsDTO.WorkloadRow r : report.items()) ids.add(r.memberId());
        if (!ids.isEmpty()) {
            for (Object[] move : facts.assignmentMoves(team.orgId(), first)) {
                Long from = (Long) move[0];
                Long to = (Long) move[1];
                Instant at = (Instant) move[2];
                for (int k = 0; k < WEEKS; k++) {
                    if (!at.isAfter(ends.get(k))) continue;
                    if (to != null && ids.contains(to)) delta.computeIfAbsent(to, x -> new int[WEEKS])[k] -= 1;
                    if (from != null && ids.contains(from)) delta.computeIfAbsent(from, x -> new int[WEEKS])[k] += 1;
                }
            }
        }
        List<MgmtAssignmentsDTO.WorkloadRow> items = new ArrayList<>();
        for (MarketingAssignmentsDTO.WorkloadRow r : report.items()) {
            int[] d = delta.getOrDefault(r.memberId(), new int[WEEKS]);
            List<Integer> series = new ArrayList<>();
            for (int k = 0; k < WEEKS; k++) series.add(Math.max(0, r.assigned() + d[k]));
            items.add(new MgmtAssignmentsDTO.WorkloadRow(r, series));
        }
        return new MgmtAssignmentsDTO.Workload(items, report.summary(), report.generatedAt(), ends);
    }

    // ---- writes: the admin board's own, behind the team wall ----------------------------------------------------------------------------

    /** The permission wall of every change: callable on its own so a route can refuse before it looks at the Idempotency-Key header. */
    public void gateWrite(OrgMembership me) {
        teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        assignments.gateWrite(me);
    }

    /** The shape of a body, validated outside any transaction (the admin board's own check). */
    public void validate(OrgMembership me, Object body) {
        assignments.validate(me.orgId(), body);
    }

    @Transactional
    public BulkResult assign(OrgMembership me, MarketingAssignmentsDTO.AssignRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        if (req != null && !team.all()) {
            teamScope.require(team, req.marketerMemberId());
            if (req.backupMemberId() != null) teamScope.require(team, req.backupMemberId());
        }
        List<Skipped> skipped = new ArrayList<>();
        List<Long> allowed = req == null ? null : reachable(team, req.consultantIds(), skipped);
        if (allowed != null && allowed.isEmpty()) return nothingReachable("ASSIGN", req.consultantIds(), skipped);
        BulkResult done = assignments.assign(
            me, req == null ? null : new MarketingAssignmentsDTO.AssignRequest(allowed, req.marketerMemberId(), req.backupMemberId(), req.priority(), req.status(), req.allowOverCapacity(), req.reason())
        );
        return merge(done, req == null ? 0 : req.consultantIds().size(), skipped);
    }

    @Transactional
    public BulkResult update(OrgMembership me, MarketingAssignmentsDTO.UpdateRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        if (req != null && req.backupMemberId() != null && !team.all()) teamScope.require(team, req.backupMemberId());
        List<Skipped> skipped = new ArrayList<>();
        List<Long> allowed = req == null ? null : reachable(team, req.consultantIds(), skipped);
        if (allowed != null && allowed.isEmpty()) return nothingReachable("UPDATE", req.consultantIds(), skipped);
        BulkResult done = assignments.update(
            me, req == null ? null : new MarketingAssignmentsDTO.UpdateRequest(allowed, req.priority(), req.status(), req.backupMemberId(), req.clearBackup(), req.reason())
        );
        return merge(done, req == null ? 0 : req.consultantIds().size(), skipped);
    }

    @Transactional
    public BulkResult unassign(OrgMembership me, MarketingAssignmentsDTO.UnassignRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        List<Skipped> skipped = new ArrayList<>();
        List<Long> allowed = req == null ? null : reachable(team, req.consultantIds(), skipped);
        if (allowed != null && allowed.isEmpty()) return nothingReachable("UNASSIGN", req.consultantIds(), skipped);
        BulkResult done = assignments.unassign(me, req == null ? null : new MarketingAssignmentsDTO.UnassignRequest(allowed, req.reason()));
        return merge(done, req == null ? 0 : req.consultantIds().size(), skipped);
    }

    @Transactional
    public BulkResult restore(OrgMembership me, MarketingAssignmentsDTO.RestoreRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        List<Skipped> skipped = new ArrayList<>();
        List<MarketingAssignmentsDTO.RestoreRow> allowed = null;
        if (req != null && req.rows() != null) {
            allowed = new ArrayList<>();
            Map<Long, MarketerAssignment> current = currentOf(team);
            for (MarketingAssignmentsDTO.RestoreRow r : req.rows()) {
                if (r == null || r.consultantId() == null) {
                    allowed.add(r); // the admin board refuses a row without a consultant itself
                    continue;
                }
                boolean mine = carriedInside(team, current.get(r.consultantId())) && (team.all() || r.marketerMemberId() == null || team.hasMarketer(r.marketerMemberId()))
                    && (team.all() || r.backupMemberId() == null || team.hasMarketer(r.backupMemberId()));
                if (mine) allowed.add(r);
                else skipped.add(new Skipped(r.consultantId(), MarketingAssignmentsService.REASON_NOT_FOUND));
            }
            if (allowed.isEmpty() && !skipped.isEmpty()) return nothingReachable("RESTORE", req.rows().stream().map(r -> r == null ? null : r.consultantId()).toList(), skipped);
        }
        BulkResult done = assignments.restore(me, req == null ? null : new MarketingAssignmentsDTO.RestoreRequest(allowed));
        return merge(done, req == null || req.rows() == null ? 0 : req.rows().size(), skipped);
    }

    /**
     * Moves consultants to other marketers of the team in ONE call: the capacity rule of the admin board applies per target (409 OVER_CAPACITY, no override), each
     * moved consultant gets its history line and its hand-over, there is one MARKETING_BULK audit row for the whole rebalance, and each result's {@code previous} is what
     * Undo sends to /restore. A target outside the team is the generic 404.
     */
    @Transactional
    public BulkResult rebalance(OrgMembership me, MarketingAssignmentsDTO.RebalanceRequest req) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.WRITE, KEY_MANAGE);
        return assignments.rebalance(me, req == null ? null : req.moves(), req == null ? null : req.reason(), team);
    }

    // ---- the team wall -----------------------------------------------------------------------------------------------------------------

    /** The consultants of {@code ids} that are unassigned or carried (as marketer) by someone of the team; the others go to {@code skipped} as NOT_FOUND. */
    private List<Long> reachable(TeamScope.View team, List<Long> ids, List<Skipped> skipped) {
        if (ids == null) return null;
        List<Long> out = new ArrayList<>();
        Map<Long, MarketerAssignment> current = currentOf(team);
        for (Long id : ids) {
            if (id == null) {
                out.add(id); // the admin board refuses it itself
                continue;
            }
            if (carriedInside(team, current.get(id))) out.add(id);
            else skipped.add(new Skipped(id, MarketingAssignmentsService.REASON_NOT_FOUND));
        }
        return out;
    }

    private Map<Long, MarketerAssignment> currentOf(TeamScope.View team) {
        Map<Long, MarketerAssignment> out = new HashMap<>();
        if (team.all()) return out; // an organization-wide caller is not narrowed here
        for (MarketerAssignment a : rows.findByOrgId(team.orgId())) out.put(a.getConsultantId(), a);
        return out;
    }

    private static boolean carriedInside(TeamScope.View team, MarketerAssignment current) {
        return team.all() || current == null || team.hasMarketer(current.getMarketerMemberId());
    }

    private static BulkResult nothingReachable(String action, List<Long> requested, List<Skipped> skipped) {
        List<RowResult> results = new ArrayList<>();
        for (Skipped s : skipped) results.add(new RowResult(s.consultantId(), false, s.reason(), null));
        return new BulkResult(action, requested == null ? 0 : requested.size(), 0, skipped, results);
    }

    private static BulkResult merge(BulkResult done, int requested, List<Skipped> skipped) {
        if (skipped.isEmpty()) return done;
        List<Skipped> allSkipped = new ArrayList<>(done.skipped());
        allSkipped.addAll(skipped);
        List<RowResult> results = new ArrayList<>(done.results());
        for (Skipped s : skipped) results.add(new RowResult(s.consultantId(), false, s.reason(), null));
        return new BulkResult(done.action(), requested, done.ok(), allSkipped, results);
    }
}
