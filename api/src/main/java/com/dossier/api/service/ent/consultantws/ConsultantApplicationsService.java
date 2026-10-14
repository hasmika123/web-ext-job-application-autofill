package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.repository.ent.consultantws.CwsApplicationEventRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Detail;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Option;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Paging;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Response;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Row;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Step;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Tiles;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.TimelineEntry;
import com.dossier.api.service.ent.consultantws.ConsultantApplicationsDTO.Update;
import com.dossier.api.service.ent.consultantws.ConsultantHomeDTO.Tile;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.BiPredicate;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Consultant workspace My Applications page (docs/enterprise-v2/page-consultant-applications.md): the caller's OWN applications,
 * read-only. The gate is {@link ConsultantHomeService#requireSelf} (Consultant role, own consultant_profile, else the generic 404);
 * every query is organization id first plus the caller's own consultant id, so an application id that is not theirs is the same 404.
 * The "vs last month" delta of a tile uses the stage the application had 30 days ago, taken from its stage events
 * (talent-foundation.md, applications section), restricted to this consultant.
 */
@Service
public class ConsultantApplicationsService {

    static final int WEEKS = 6;
    static final int MAX_PAGE_SIZE = 50;
    static final int DEFAULT_PAGE_SIZE = 10;
    static final int RECENT = 5;
    static final List<String> SORTS = List.of("applied", "company", "stage");
    static final List<String> STATUSES = List.of("ASSIGNED", "SUBMITTED", "UNDER_REVIEW", "INTERVIEWING", "OFFER", "HIRED", "REJECTED", "WITHDRAWN", "NO_RESPONSE");
    private static final Map<String, Integer> STAGE_ORDER = Map.of("ASSIGNED", 1, "SUBMITTED", 2, "UNDER_REVIEW", 3, "INTERVIEWING", 4, "OFFER", 5, "CLOSED", 6);

    private final ConsultantHomeService gate;
    private final TalentApplicationRepository applications;
    private final CwsApplicationEventRepository events;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final Clock clock;

    @Autowired
    public ConsultantApplicationsService(
        ConsultantHomeService gate,
        TalentApplicationRepository applications,
        CwsApplicationEventRepository events,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients
    ) {
        this(gate, applications, events, requirements, clients, Clock.systemUTC());
    }

    ConsultantApplicationsService(
        ConsultantHomeService gate,
        TalentApplicationRepository applications,
        CwsApplicationEventRepository events,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        Clock clock
    ) {
        this.gate = gate;
        this.applications = applications;
        this.events = events;
        this.requirements = requirements;
        this.clients = clients;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public Response page(OrgMembership me, String status, String sort, int page, int size) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);

        String st = status == null || status.isBlank() ? "ALL" : status.strip().toUpperCase();
        if (!"ALL".equals(st) && !STATUSES.contains(st)) throw TrackerException.invalid("status", "is not a known status");
        String order = sort == null || sort.isBlank() ? "applied" : sort.strip().toLowerCase();
        if (!SORTS.contains(order)) throw TrackerException.sortInvalid(sort, SORTS);
        int pg = Math.max(0, page);
        int sz = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);

        List<TalentApplication> mine = applications.findByOrgIdAndConsultantId(org, c.getId());
        Map<Long, List<TalentApplicationEvent>> evs = eventsByApplication(org, mine);
        Map<Long, ClientRequirement> reqs = requirementsOf(org, mine);
        Map<Long, ClientAccount> clientById = clientsOf(org, mine);

        // tiles: value now, value 30 days ago from the stage events, weekly sparkline
        Tiles tiles = new Tiles(
            tile(mine, evs, now, (a, s) -> true),
            tile(mine, evs, now, (a, s) -> "SUBMITTED".equals(s) || "UNDER_REVIEW".equals(s)),
            tile(mine, evs, now, (a, s) -> "INTERVIEWING".equals(s)),
            tile(mine, evs, now, (a, s) -> "CLOSED".equals(s) && "REJECTED".equals(a.getClosedReason())),
            tile(mine, evs, now, (a, s) -> "OFFER".equals(s))
        );

        // status options with counts
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String k : STATUSES) counts.put(k, 0L);
        for (TalentApplication a : mine) counts.merge(statusKey(a), 1L, Long::sum);
        List<Option> options = new ArrayList<>();
        options.add(new Option("ALL", mine.size()));
        counts.forEach((k, v) -> {
            if (STATUSES.contains(k)) options.add(new Option(k, v));
        });

        // the page of rows
        List<TalentApplication> filtered = mine.stream().filter(a -> "ALL".equals(st) || st.equals(statusKey(a))).toList();
        Comparator<TalentApplication> byApplied = Comparator.comparing(TalentApplication::getAppliedOn, Comparator.reverseOrder()).thenComparing(TalentApplication::getId, Comparator.reverseOrder());
        Comparator<TalentApplication> cmp = switch (order) {
            case "company" -> Comparator.comparing((TalentApplication a) -> companyName(a, clientById).toLowerCase()).thenComparing(byApplied);
            case "stage" -> Comparator.comparing((TalentApplication a) -> STAGE_ORDER.getOrDefault(a.getStage(), 0)).thenComparing(byApplied);
            default -> byApplied;
        };
        List<TalentApplication> sorted = filtered.stream().sorted(cmp).toList();
        int from = (int) Math.min((long) pg * sz, sorted.size());
        int to = Math.min(from + sz, sorted.size());
        List<Row> rows = sorted.subList(from, to).stream().map(a -> row(a, reqs, clientById)).toList();
        Paging paging = new Paging(pg, sz, sorted.size(), (int) Math.ceil(sorted.size() / (double) sz));

        // funnel: counts and share of all applications
        long total = mine.size();
        List<Step> funnel = new ArrayList<>();
        funnel.add(step("TOTAL", total, total));
        funnel.add(step("UNDER_REVIEW", mine.stream().filter(a -> "SUBMITTED".equals(a.getStage()) || "UNDER_REVIEW".equals(a.getStage())).count(), total));
        funnel.add(step("INTERVIEWING", mine.stream().filter(a -> "INTERVIEWING".equals(a.getStage())).count(), total));
        funnel.add(step("OFFER", mine.stream().filter(a -> "OFFER".equals(a.getStage())).count(), total));
        funnel.add(step("REJECTED", mine.stream().filter(a -> "REJECTED".equals(statusKey(a))).count(), total));

        // recent status updates: the caller's own STAGE_CHANGE events, newest first
        Map<Long, TalentApplication> appById = mine.stream().collect(Collectors.toMap(TalentApplication::getId, Function.identity()));
        List<Update> recent = evs.values().stream()
            .flatMap(List::stream)
            .filter(e -> "STAGE_CHANGE".equals(e.getEventType()) && e.getToStage() != null)
            .sorted(Comparator.comparing(TalentApplicationEvent::getOccurredAt).reversed().thenComparing(TalentApplicationEvent::getId, Comparator.reverseOrder()))
            .limit(RECENT)
            .map(e -> {
                TalentApplication a = appById.get(e.getApplicationId());
                ClientRequirement r = reqs.get(a.getRequirementId());
                return new Update(e.getId(), a.getId(), e.getToStage(), "CLOSED".equals(e.getToStage()) ? a.getClosedReason() : null, r == null ? null : r.getTitle(), companyName(a, clientById, true), by(e, a, me), e.getOccurredAt());
            })
            .toList();

        return new Response(org, now, c.getDisplayName(), tiles, rows, paging, st, order, options, funnel, recent);
    }

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, long applicationId) {
        ConsultantProfile c = gate.requireSelf(me);
        Long org = c.getOrgId();
        TalentApplication a = applications.findByOrgIdAndId(org, applicationId).filter(x -> c.getId().equals(x.getConsultantId())).orElseThrow(OrgNotFoundException::new);
        List<TalentApplication> one = List.of(a);
        List<TimelineEntry> timeline = events.findByOrgIdAndApplicationIdOrderByOccurredAtAsc(org, a.getId()).stream()
            .filter(e -> ("CREATED".equals(e.getEventType()) || "STAGE_CHANGE".equals(e.getEventType())) && e.getToStage() != null)
            .map(e -> new TimelineEntry(e.getId(), e.getEventType(), e.getFromStage(), e.getToStage(), by(e, a, me), e.getOccurredAt()))
            .toList();
        return new Detail(row(a, requirementsOf(org, one), clientsOf(org, one)), a.getCreatedAt(), a.getStageChangedAt(), timeline);
    }

    // ---- helpers --------------------------------------------------------------------------------------------------

    /** The filter key of an application: its stage, or the closed reason for a CLOSED one (a closed application without a reason is only in ALL). */
    static String statusKey(TalentApplication a) {
        return "CLOSED".equals(a.getStage()) ? (a.getClosedReason() == null ? "CLOSED" : a.getClosedReason()) : a.getStage();
    }

    static String by(TalentApplicationEvent e, TalentApplication a, OrgMembership me) {
        if (e.getActorMemberId() == null) return "TEAM";
        if (e.getActorMemberId().equals(me.memberId())) return "YOU";
        if (e.getActorMemberId().equals(a.getMarketerMemberId())) return "MARKETER";
        return "TEAM";
    }

    private static Step step(String key, long count, long total) {
        return new Step(key, count, total == 0 ? null : Math.round(count * 1000.0 / total) / 10.0);
    }

    private Map<Long, List<TalentApplicationEvent>> eventsByApplication(Long org, List<TalentApplication> mine) {
        Map<Long, List<TalentApplicationEvent>> out = new HashMap<>();
        List<Long> ids = mine.stream().map(TalentApplication::getId).toList();
        for (int i = 0; i < ids.size(); i += 500) {
            for (TalentApplicationEvent e : events.findByOrgIdAndApplicationIdInOrderByOccurredAtAsc(org, ids.subList(i, Math.min(i + 500, ids.size())))) {
                boolean stageEvent = "CREATED".equals(e.getEventType()) || "STAGE_CHANGE".equals(e.getEventType());
                if (stageEvent && e.getToStage() != null) out.computeIfAbsent(e.getApplicationId(), k -> new ArrayList<>()).add(e);
            }
        }
        return out;
    }

    private Map<Long, ClientRequirement> requirementsOf(Long org, List<TalentApplication> apps) {
        List<Long> ids = apps.stream().map(TalentApplication::getRequirementId).distinct().toList();
        return requirements.findByOrgIdAndIdIn(org, ids).stream().filter(r -> org.equals(r.getOrgId())).collect(Collectors.toMap(ClientRequirement::getId, Function.identity()));
    }

    private Map<Long, ClientAccount> clientsOf(Long org, List<TalentApplication> apps) {
        Set<Long> ids = apps.stream().map(TalentApplication::getClientId).collect(Collectors.toSet());
        return clients.findByOrgIdAndIdIn(org, ids).stream().filter(c -> org.equals(c.getOrgId())).collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
    }

    private static String companyName(TalentApplication a, Map<Long, ClientAccount> clientById) {
        String n = companyName(a, clientById, true);
        return n == null ? "" : n;
    }

    private static String companyName(TalentApplication a, Map<Long, ClientAccount> clientById, boolean nullable) {
        ClientAccount cl = clientById.get(a.getClientId());
        return cl == null ? null : cl.getName();
    }

    private Row row(TalentApplication a, Map<Long, ClientRequirement> reqs, Map<Long, ClientAccount> clientById) {
        ClientRequirement r = reqs.get(a.getRequirementId());
        return new Row(
            a.getId(), a.getCode(), a.getRequirementId(), r == null ? null : r.getTitle(), companyName(a, clientById, true), a.getAppliedOn(), a.getSourceLabel(),
            a.getStage(), a.getClosedReason(), a.getNextAction(), a.getNextActionDue()
        );
    }

    /** The stage an application had at {@code t}: the {@code to_stage} of its latest event up to t; null when it did not exist yet. */
    static String stageAt(TalentApplication a, List<TalentApplicationEvent> evs, Instant t) {
        if (a.getCreatedAt().isAfter(t)) return null;
        if (evs == null || evs.isEmpty()) return a.getStage();
        String stage = null;
        for (TalentApplicationEvent e : evs) {
            if (!e.getOccurredAt().isAfter(t)) stage = e.getToStage();
        }
        return stage != null ? stage : evs.get(0).getToStage();
    }

    /** Value now (current stage), the value 30 days ago (stage events; creation time for the total) and a weekly sparkline of the same rule. */
    static Tile tile(List<TalentApplication> mine, Map<Long, List<TalentApplicationEvent>> evs, Instant now, BiPredicate<TalentApplication, String> counts) {
        long value = mine.stream().filter(a -> counts.test(a, a.getStage())).count();
        long previous = countAt(mine, evs, now.minus(Duration.ofDays(30)), counts);
        Double delta = previous == 0 ? null : Math.round(((value - previous) * 1000.0) / previous) / 10.0;
        List<Long> spark = new ArrayList<>();
        for (int w = WEEKS - 1; w >= 0; w--) spark.add(countAt(mine, evs, now.minus(Duration.ofDays(7L * w)), counts));
        return new Tile(value, previous, delta, spark, false);
    }

    private static long countAt(List<TalentApplication> mine, Map<Long, List<TalentApplicationEvent>> evs, Instant t, BiPredicate<TalentApplication, String> counts) {
        long n = 0;
        for (TalentApplication a : mine) {
            String s = stageAt(a, evs.get(a.getId()), t);
            if (s != null && counts.test(a, s)) n++;
        }
        return n;
    }
}
