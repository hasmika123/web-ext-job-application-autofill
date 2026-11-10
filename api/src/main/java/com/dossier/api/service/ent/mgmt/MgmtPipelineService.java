package com.dossier.api.service.ent.mgmt;

import com.dossier.api.repository.ent.mgmt.MgmtPipelineRepository;
import com.dossier.api.repository.ent.mgmt.MgmtTeamRepository;
import com.dossier.api.service.dto.ent.MarketingAssignmentsDTO;
import com.dossier.api.service.ent.applications.ApplicationNames;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.mkt.escalations.EscalationSettings;
import com.dossier.api.service.ent.reports.OrgReportsService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
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
 * The Marketing Manager's Pipeline board (docs/enterprise-v2/deferred/marketing-manager.md sections 5 and 6): the opportunities of the consultants the team carries,
 * in the board's columns, and the summary strip (a count per column and the 30 / 90 day funnel). It is a READ: there is no route that moves a card (a status change
 * belongs to the marketer and consultant flows) and nothing here sends or submits anything (E1). Needs {@code pipeline.view} at TEAM scope or wider (and the team
 * key {@code workload.view}); a marketer or consultant outside the team is the generic 404. A manager with no marketer in scope gets an empty board, never a 404.
 *
 * <p>Columns come from the opportunity's own state: ASSIGNED, VIEWED, INTERESTED and NEEDS_INFO are columns of their own; an APPLIED opportunity is in INTERVIEW or
 * OFFER when the consultant's application for that job has reached INTERVIEWING or OFFER, and in APPLIED otherwise; DECLINED and CLOSED are CLOSED. The four
 * right-hand columns show the cards that changed within the range (30 or 90 days, default 30), so they do not grow forever. A card is stale when it is still in one
 * of the first four columns and has had no timeline line for the admin's {@code org.pipeline.stalled_days} (the same number the escalation rule uses).
 */
@Service
public class MgmtPipelineService {

    public static final String KEY = "pipeline.view";
    public static final List<String> COLUMNS = List.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO", "APPLIED", "INTERVIEW", "OFFER", "CLOSED");
    static final Map<String, String> LABELS = Map.of(
        "ASSIGNED", "Assigned", "VIEWED", "Viewed", "INTERESTED", "Interested", "NEEDS_INFO", "Needs info", "APPLIED", "Applied", "INTERVIEW", "Interview", "OFFER", "Offer", "CLOSED", "Closed"
    );
    static final Set<String> OPEN_COLUMNS = Set.of("ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO");
    static final int DEFAULT_SIZE = 50;
    static final int MAX_SIZE = 200;

    private final TeamScope teamScope;
    private final MgmtPipelineRepository rows;
    private final MgmtTeamRepository facts;
    private final ApplicationNames names;
    private final EscalationSettings settings;
    private final Clock clock;

    @Autowired
    public MgmtPipelineService(TeamScope teamScope, MgmtPipelineRepository rows, MgmtTeamRepository facts, ApplicationNames names, EscalationSettings settings) {
        this(teamScope, rows, facts, names, settings, Clock.systemUTC());
    }

    MgmtPipelineService(TeamScope teamScope, MgmtPipelineRepository rows, MgmtTeamRepository facts, ApplicationNames names, EscalationSettings settings, Clock clock) {
        this.teamScope = teamScope;
        this.rows = rows;
        this.facts = facts;
        this.names = names;
        this.settings = settings;
        this.clock = clock;
    }

    /** The filters of the board; every one optional. */
    public record Filter(Long marketer, Long consultant, Long client, boolean stale, String range) {}

    @Transactional(readOnly = true)
    public MgmtPipelineDTO.Board board(OrgMembership me, Filter filter, int page, int size) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        if (page < 0) throw OrgException.invalid("page", "must be 0 or more");
        if (size < 1 || size > MAX_SIZE) throw OrgException.invalid("size", "must be between 1 and " + MAX_SIZE);
        int range = OrgReportsService.parseRange(filter == null ? null : filter.range());
        if (filter != null && filter.marketer() != null) teamScope.require(team, filter.marketer());
        if (filter != null && filter.consultant() != null) teamScope.requireConsultant(team, filter.consultant());
        Instant now = clock.instant();
        int staleDays = settings.stalledDays(team.orgId());
        if (team.empty() && !team.all()) return new MgmtPipelineDTO.Board(emptyColumns(), 0, page, size, staleDays, range, true, now);

        List<MgmtPipelineDTO.Card> cards = cards(team, now, range, staleDays);
        List<MgmtPipelineDTO.Card> filtered = new ArrayList<>();
        for (MgmtPipelineDTO.Card c : cards) {
            if (filter != null) {
                if (filter.marketer() != null && (c.marketer() == null || !filter.marketer().equals(c.marketer().memberId()))) continue;
                if (filter.consultant() != null && !filter.consultant().equals(c.consultantId())) continue;
                if (filter.client() != null && !filter.client().equals(c.clientId())) continue;
                if (filter.stale() && !c.stale()) continue;
            }
            filtered.add(c);
        }
        filtered.sort(Comparator.comparing(MgmtPipelineDTO.Card::lastActivityAt).reversed().thenComparing(MgmtPipelineDTO.Card::id, Comparator.reverseOrder()));
        int from = (int) Math.min((long) page * size, filtered.size());
        int to = Math.min(from + size, filtered.size());
        Map<String, List<MgmtPipelineDTO.Card>> onPage = new HashMap<>();
        for (MgmtPipelineDTO.Card c : filtered.subList(from, to)) onPage.computeIfAbsent(c.column(), k -> new ArrayList<>()).add(c);
        Map<String, Long> counts = new HashMap<>();
        for (MgmtPipelineDTO.Card c : filtered) counts.merge(c.column(), 1L, Long::sum);
        List<MgmtPipelineDTO.Column> columns = new ArrayList<>();
        for (String key : COLUMNS) columns.add(new MgmtPipelineDTO.Column(key, LABELS.get(key), counts.getOrDefault(key, 0L), onPage.getOrDefault(key, List.of())));
        return new MgmtPipelineDTO.Board(columns, filtered.size(), page, size, staleDays, range, false, now);
    }

    @Transactional(readOnly = true)
    public MgmtPipelineDTO.Summary summary(OrgMembership me, String rangeParam) {
        TeamScope.View team = teamScope.resolve(me, AuthzOperation.READ, KEY);
        int range = OrgReportsService.parseRange(rangeParam);
        Instant now = clock.instant();
        int staleDays = settings.stalledDays(team.orgId());
        if (team.empty() && !team.all()) {
            List<MgmtPipelineDTO.ColumnCount> none = new ArrayList<>();
            for (String key : COLUMNS) none.add(new MgmtPipelineDTO.ColumnCount(key, LABELS.get(key), 0));
            return new MgmtPipelineDTO.Summary(none, 0, staleDays, range, List.of(window(team, now, 30), window(team, now, 90)), true, now);
        }
        List<MgmtPipelineDTO.Card> cards = cards(team, now, range, staleDays);
        Map<String, Long> counts = new HashMap<>();
        long stale = 0;
        for (MgmtPipelineDTO.Card c : cards) {
            counts.merge(c.column(), 1L, Long::sum);
            if (c.stale()) stale++;
        }
        List<MgmtPipelineDTO.ColumnCount> columns = new ArrayList<>();
        for (String key : COLUMNS) columns.add(new MgmtPipelineDTO.ColumnCount(key, LABELS.get(key), counts.getOrDefault(key, 0L)));
        return new MgmtPipelineDTO.Summary(columns, stale, staleDays, range, List.of(window(team, now, 30), window(team, now, 90)), false, now);
    }

    // ---- internals ---------------------------------------------------------------------------------------------------------------

    private static Collection<Long> ids(TeamScope.View team) {
        return team.consultantIds().isEmpty() ? List.of(-1L) : team.consultantIds();
    }

    private static List<MgmtPipelineDTO.Column> emptyColumns() {
        List<MgmtPipelineDTO.Column> out = new ArrayList<>();
        for (String key : COLUMNS) out.add(new MgmtPipelineDTO.Column(key, LABELS.get(key), 0, List.of()));
        return out;
    }

    /** The column of an opportunity: its own state, refined for an applied one by how far the consultant's application for that job has got. */
    static String column(String state, String applicationStage) {
        if (state == null) return "CLOSED";
        return switch (state) {
            case "ASSIGNED", "VIEWED", "INTERESTED", "NEEDS_INFO" -> state;
            case "APPLIED" -> "OFFER".equals(applicationStage) ? "OFFER" : "INTERVIEWING".equals(applicationStage) ? "INTERVIEW" : "APPLIED";
            default -> "CLOSED";
        };
    }

    private List<MgmtPipelineDTO.Card> cards(TeamScope.View team, Instant now, int range, int staleDays) {
        Long orgId = team.orgId();
        Collection<Long> ids = ids(team);
        Map<String, String> advanced = new HashMap<>();
        for (Object[] r : rows.advancedApplications(orgId, team.all(), ids)) advanced.merge(r[0] + ":" + r[1], String.valueOf(r[2]), (a, b) -> "OFFER".equals(a) || "OFFER".equals(b) ? "OFFER" : a);
        Instant since = now.minus(Duration.ofDays(range));
        Instant staleBefore = now.minus(Duration.ofDays(staleDays));
        List<Object[]> raw = rows.cards(orgId, team.all(), ids);
        Set<Long> owners = new HashSet<>();
        for (Object[] r : raw) if (r[9] != null) owners.add((Long) r[9]);
        Map<Long, String> who = names.memberNames(orgId, owners);
        List<MgmtPipelineDTO.Card> out = new ArrayList<>();
        for (Object[] r : raw) {
            String column = column((String) r[7], advanced.get(r[1] + ":" + r[3]));
            Instant updated = (Instant) r[11];
            if (!OPEN_COLUMNS.contains(column) && updated.isBefore(since)) continue; // the right-hand columns show what changed within the range
            Instant created = (Instant) r[10];
            Instant lastEvent = (Instant) r[12];
            Instant last = lastEvent != null && lastEvent.isAfter(created) ? lastEvent : created;
            Long owner = (Long) r[9];
            out.add(new MgmtPipelineDTO.Card(
                (Long) r[0], (Long) r[1], (String) r[2], (Long) r[3], (String) r[4], (Long) r[5], (String) r[6],
                owner == null ? null : new MarketingAssignmentsDTO.Person(owner, who.getOrDefault(owner, "Member")),
                column, (String) r[8], last, (int) Math.max(0, Duration.between(created, now).toDays()), OPEN_COLUMNS.contains(column) && last.isBefore(staleBefore)
            ));
        }
        return out;
    }

    private MgmtPipelineDTO.Window window(TeamScope.View team, Instant now, int days) {
        Long orgId = team.orgId();
        Collection<Long> ids = ids(team);
        boolean all = team.all();
        Instant from = now.minus(Duration.ofDays(days));
        Instant to = now.plusSeconds(1);
        LocalDate today = now.atOffset(ZoneOffset.UTC).toLocalDate();
        boolean none = team.empty() && !all;
        long assigned = none ? 0 : facts.countOpportunityEvents(orgId, all, ids, List.of("ASSIGNED", "REASSIGNED"), from, to);
        long interested = none ? 0 : facts.countOpportunityEvents(orgId, all, ids, List.of("INTERESTED"), from, to);
        long sent = none ? 0 : facts.countSubmitted(orgId, all, ids, today.minusDays(days - 1L), today.plusDays(1));
        long interviews = none ? 0 : facts.countInterviews(orgId, all, ids, from, to);
        long offers = none ? 0 : rows.countOffers(orgId, all, ids, from, to);
        List<MgmtPipelineDTO.Step> steps = new ArrayList<>();
        steps.add(new MgmtPipelineDTO.Step("assigned", "Assigned", assigned, null));
        steps.add(new MgmtPipelineDTO.Step("interested", "Interested", interested, pct(interested, assigned)));
        steps.add(new MgmtPipelineDTO.Step("submitted", "Recorded as submitted", sent, pct(sent, interested)));
        steps.add(new MgmtPipelineDTO.Step("interview", "Interviews", interviews, pct(interviews, sent)));
        steps.add(new MgmtPipelineDTO.Step("offer", "Offers", offers, pct(offers, interviews)));
        return new MgmtPipelineDTO.Window(days, steps);
    }

    static Double pct(long count, long previous) {
        if (previous <= 0) return null;
        return Math.round(count * 1000.0 / previous) / 10.0;
    }
}
