package com.dossier.api.service.ent.mgmt;

import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.ent.talent.MarketerCapacity;
import com.dossier.api.repository.ent.mgmt.MgmtLookupRepository;
import com.dossier.api.repository.ent.mgmt.MgmtTeamRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.MarketerCapacityRepository;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.marketing.MarketingSettings;
import com.dossier.api.service.ent.mkt.approvals.ApprovalRequestDTO;
import com.dossier.api.service.ent.mkt.approvals.ApprovalService;
import com.dossier.api.service.ent.mkt.escalations.EscalationDTO;
import com.dossier.api.service.ent.mkt.escalations.EscalationService;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Manager's Home (docs/enterprise-v2/deferred/marketing-manager.md section 4.3): the tiles, this week's pipeline against last week's, the most loaded
 * marketers, the oldest approvals and the most severe escalations that wait for the manager, and the latest activity of the team. Every number is a count of the
 * team's own rows ({@link TeamScope}: an organization-wide caller sees everyone); {@code empty} is true for a manager with no marketer in scope, and then the
 * page shows its "Build your team" state: it is never a 404. Reads need {@code workload.view} at TEAM scope or wider. Display names and counts only; no management
 * read consumes a licensed feature (21 section 3).
 */
@Service
public class MgmtHomeService {

    static final Set<String> OPEN_STATES = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");
    static final int NEEDS_YOU_EACH = 5;
    static final int TOP_LOAD = 3;
    static final int ACTIVITY_LINES = 10;

    private final TeamScope teamScope;
    private final MarketerCapacityRepository capacities;
    private final MarketerAssignmentRepository assignments;
    private final MgmtTeamRepository facts;
    private final MgmtLookupRepository lookup;
    private final ApplicationNames names;
    private final MarketingSettings marketing;
    private final ApprovalService approvals;
    private final EscalationService escalations;
    private final Clock clock;

    @Autowired
    public MgmtHomeService(
        TeamScope teamScope,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MgmtTeamRepository facts,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        MarketingSettings marketing,
        ApprovalService approvals,
        EscalationService escalations
    ) {
        this(teamScope, capacities, assignments, facts, lookup, names, marketing, approvals, escalations, Clock.systemUTC());
    }

    MgmtHomeService(
        TeamScope teamScope,
        MarketerCapacityRepository capacities,
        MarketerAssignmentRepository assignments,
        MgmtTeamRepository facts,
        MgmtLookupRepository lookup,
        ApplicationNames names,
        MarketingSettings marketing,
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
        this.approvals = approvals;
        this.escalations = escalations;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public MgmtHomeDTO home(OrgMembership me) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ);
        Long orgId = team.orgId();
        Instant now = clock.instant();
        if (team.empty()) {
            return new MgmtHomeDTO(
                true, now, new MgmtHomeDTO.Tiles(0, 0, 0, 0, 0, new EscalationDTO.Counts(0, 0, 0, 0, 0)),
                new MgmtHomeDTO.Pipeline(stat(0, 0), stat(0, 0), stat(0, 0), stat(0, 0)), List.of(), List.of(), List.of()
            );
        }
        Set<Long> marketerIds = team.marketerMemberIds();
        Collection<Long> consultantIds = team.consultantIds().isEmpty() ? List.of(-1L) : team.consultantIds();
        int overloadPct = marketing.overloadPct(orgId);

        // marketers: active and paused, and the load of each
        Map<Long, MarketerCapacity> capacity = new HashMap<>();
        for (MarketerCapacity c : capacities.findByOrgId(orgId)) if (marketerIds.contains(c.getMemberId())) capacity.put(c.getMemberId(), c);
        Map<Long, Integer> carried = new HashMap<>();
        for (MarketerAssignment a : assignments.findByOrgId(orgId)) if (marketerIds.contains(a.getMarketerMemberId())) carried.merge(a.getMarketerMemberId(), 1, Integer::sum);
        long active = capacity.values().stream().filter(c -> "ACTIVE".equals(c.getStatus())).count();
        long paused = capacity.values().stream().filter(c -> "PAUSED".equals(c.getStatus())).count();
        Map<Long, String> who = names.memberNames(orgId, marketerIds);
        List<MgmtHomeDTO.LoadRow> load = new ArrayList<>();
        for (MarketerCapacity c : capacity.values()) {
            int cap = c.getCapacity() == null ? 0 : c.getCapacity();
            int n = carried.getOrDefault(c.getMemberId(), 0);
            int percent = cap <= 0 ? 0 : (int) Math.round(n * 100.0 / cap);
            load.add(new MgmtHomeDTO.LoadRow(c.getMemberId(), who.getOrDefault(c.getMemberId(), "Member"), n, cap, percent, cap > 0 && n * 100L >= (long) overloadPct * cap));
        }
        load.sort(Comparator.comparingInt(MgmtHomeDTO.LoadRow::percent).reversed().thenComparing(r -> r.name().toLowerCase()));
        List<MgmtHomeDTO.LoadRow> topLoad = new ArrayList<>(load.subList(0, Math.min(TOP_LOAD, load.size())));

        MgmtHomeDTO.Tiles tiles = new MgmtHomeDTO.Tiles(
            active, paused, team.consultantIds().size(), facts.countOpen(orgId, team.all(), consultantIds, OPEN_STATES), approvals.countPending(team), escalations.counts(team)
        );
        return new MgmtHomeDTO(false, now, tiles, pipeline(team, consultantIds, now), topLoad, needsYou(team, orgId), activity(team, consultantIds, orgId));
    }

    private MgmtHomeDTO.Pipeline pipeline(TeamScope.View team, Collection<Long> consultantIds, Instant now) {
        Long orgId = team.orgId();
        Instant weekAgo = now.minus(Duration.ofDays(7));
        Instant twoWeeksAgo = now.minus(Duration.ofDays(14));
        java.time.LocalDate today = now.atOffset(ZoneOffset.UTC).toLocalDate();
        MgmtHomeDTO.Stat assigned = stat(
            facts.countOpportunityEvents(orgId, team.all(), consultantIds, List.of("ASSIGNED", "REASSIGNED"), weekAgo, now.plusSeconds(1)),
            facts.countOpportunityEvents(orgId, team.all(), consultantIds, List.of("ASSIGNED", "REASSIGNED"), twoWeeksAgo, weekAgo)
        );
        MgmtHomeDTO.Stat interested = stat(
            facts.countOpportunityEvents(orgId, team.all(), consultantIds, List.of("INTERESTED"), weekAgo, now.plusSeconds(1)),
            facts.countOpportunityEvents(orgId, team.all(), consultantIds, List.of("INTERESTED"), twoWeeksAgo, weekAgo)
        );
        MgmtHomeDTO.Stat submitted = stat(
            facts.countSubmitted(orgId, team.all(), consultantIds, today.minusDays(6), today.plusDays(1)),
            facts.countSubmitted(orgId, team.all(), consultantIds, today.minusDays(13), today.minusDays(6))
        );
        MgmtHomeDTO.Stat interviews = stat(
            facts.countInterviews(orgId, team.all(), consultantIds, weekAgo, now.plusSeconds(1)),
            facts.countInterviews(orgId, team.all(), consultantIds, twoWeeksAgo, weekAgo)
        );
        return new MgmtHomeDTO.Pipeline(assigned, interested, submitted, interviews);
    }

    private List<MgmtHomeDTO.NeedsYou> needsYou(TeamScope.View team, Long orgId) {
        List<MgmtHomeDTO.NeedsYou> out = new ArrayList<>();
        for (ApprovalRequestDTO a : approvals.oldestPending(team, NEEDS_YOU_EACH)) {
            out.add(new MgmtHomeDTO.NeedsYou("APPROVAL", a.id(), a.title(), null, a.requestedBy().name(), a.requestedAt(), "/w/marketing-mgmt/approvals?id=" + a.id()));
        }
        for (EscalationDTO e : escalations.topHigh(team, NEEDS_YOU_EACH)) {
            out.add(new MgmtHomeDTO.NeedsYou("ESCALATION", e.id(), e.title(), e.severity(), e.marketer() == null ? null : e.marketer().name(), e.raisedAt(), "/w/marketing-mgmt/escalations?id=" + e.id()));
        }
        return out;
    }

    private List<MgmtHomeDTO.ActivityRow> activity(TeamScope.View team, Collection<Long> consultantIds, Long orgId) {
        List<MktActivity> rows = facts.latestActivity(orgId, team.all(), consultantIds, org.springframework.data.domain.PageRequest.of(0, ACTIVITY_LINES));
        if (rows.isEmpty()) return List.of();
        Set<Long> actors = new HashSet<>();
        Set<Long> people = new HashSet<>();
        for (MktActivity a : rows) {
            actors.add(a.getActorMemberId());
            people.add(a.getConsultantId());
        }
        Map<Long, String> actorNames = names.memberNames(orgId, actors);
        Map<Long, String> consultantNames = new HashMap<>();
        for (Object[] c : lookup.consultantNames(orgId, people)) consultantNames.put((Long) c[0], (String) c[1]);
        List<MgmtHomeDTO.ActivityRow> out = new ArrayList<>();
        for (MktActivity a : rows) {
            out.add(new MgmtHomeDTO.ActivityRow(
                a.getId(), a.getActivityType(), a.getTitle(), consultantNames.getOrDefault(a.getConsultantId(), "Consultant"), actorNames.getOrDefault(a.getActorMemberId(), "Member"), a.getOccurredAt()
            ));
        }
        return out;
    }

    static MgmtHomeDTO.Stat stat(long thisWeek, long lastWeek) {
        Double delta = lastWeek <= 0 ? null : Math.round((thisWeek - lastWeek) * 1000.0 / lastWeek) / 10.0;
        return new MgmtHomeDTO.Stat(thisWeek, lastWeek, delta);
    }
}
