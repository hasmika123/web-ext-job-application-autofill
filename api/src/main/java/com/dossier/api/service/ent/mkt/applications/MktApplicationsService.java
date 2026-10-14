package com.dossier.api.service.ent.mkt.applications;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.ent.talent.TalentApplicationNote;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationClientRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationEventRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationLookupRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationNoteRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktApplicationRequirementRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationStages.Group;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO.*;
import com.dossier.api.service.org.DataShareService;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing > Applications board (`/api/orgs/{orgId}/mkt/applications`). Everything is derived from existing rows
 * ({@code talent_application}, its events, requirement, client, consultant, assignment): no new table.
 *
 * <p><b>Scope and consent.</b> Reads need {@code member.view_summary} (the {@link MktScope} gate: generic 404 and the consultants the
 * caller may see) and {@code pipeline.view}. Per consultant the effective consent is read through {@link DataShareService}: a
 * consultant who is not a seat (an org-managed profile, {@code member_id} null) has no account to consent or to apply with, so it is
 * SUMMARY at most (doc 60 section 0.8: informational in Phase 1, never FULL by default; the day it gets a seat sharing starts at NONE);
 * a seat is FULL / SUMMARY / NONE by what they shared. SUMMARY shows the stage only (the employer, role, source, dates and next action
 * are null); NONE is left out of every list and count and only counted in {@code notShared}.
 *
 * <p><b>Stage ownership.</b> A row that carries a {@code personal_application_id} follows the consultant's OWN application (it is SYSTEM-owned,
 * {@code PipelineApplicationLinker}): a marketer's {@link #recordStage} answers 409 {@code STAGE_OWNED_BY_CONSULTANT}. Rows without a link
 * (the marketer's own records, including those of a profile without a seat) keep being recorded by the marketer.
 *
 * <p><b>Writes are records (E1).</b> A marketer adds a note, sets a next action and due date, marks a follow-up done
 * ({@code followups.manage}) and RECORDS a stage the consultant already reached ({@code submissions.record}). Nothing here submits
 * anything to a client or signs in as a consultant. Free text goes through the PII scanner; every write is audited and leaves an
 * event on the application's timeline.
 */
@Service
public class MktApplicationsService {

    static final String READ_KEY = "member.view_summary";
    static final String PIPELINE_KEY = "pipeline.view";
    static final String FOLLOWUPS_KEY = "followups.manage";
    static final String RECORD_KEY = "submissions.record";
    public static final String STAGE_OWNED_BY_CONSULTANT = "STAGE_OWNED_BY_CONSULTANT";
    static final int DEFAULT_SIZE = 8;
    static final int MAX_SIZE = 100;
    static final int LIST_LIMIT = 5;
    static final int SPARK_POINTS = 8;
    static final int NOTE_MAX = 1000;
    static final int ACTION_MAX = 120;

    private final MktScope scope;
    private final MktApplicationRepository apps;
    private final MktApplicationEventRepository events;
    private final MktApplicationNoteRepository notes;
    private final MktApplicationLookupRepository consultants;
    private final MktApplicationClientRepository clients;
    private final MktApplicationRequirementRepository requirements;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final DataShareService shares;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktApplicationsService(
        MktScope scope,
        MktApplicationRepository apps,
        MktApplicationEventRepository events,
        MktApplicationNoteRepository notes,
        MktApplicationLookupRepository consultants,
        MktApplicationClientRepository clients,
        MktApplicationRequirementRepository requirements,
        OrgMemberRepository members,
        UserRepository users,
        DataShareService shares,
        OrgAuditService audit
    ) {
        this(scope, apps, events, notes, consultants, clients, requirements, members, users, shares, audit, Clock.systemUTC());
    }

    MktApplicationsService(
        MktScope scope,
        MktApplicationRepository apps,
        MktApplicationEventRepository events,
        MktApplicationNoteRepository notes,
        MktApplicationLookupRepository consultants,
        MktApplicationClientRepository clients,
        MktApplicationRequirementRepository requirements,
        OrgMemberRepository members,
        UserRepository users,
        DataShareService shares,
        OrgAuditService audit,
        Clock clock
    ) {
        this.scope = scope;
        this.apps = apps;
        this.events = events;
        this.notes = notes;
        this.consultants = consultants;
        this.clients = clients;
        this.requirements = requirements;
        this.members = members;
        this.users = users;
        this.shares = shares;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- read ---------------------------------------------------------------------------------------------------------------

    /** One visible application with everything the board needs about it. {@code full} = the consultant shares detail. */
    private record A(TalentApplication app, ConsultantProfile consultant, boolean full, String role, String client, List<TalentApplicationEvent> history) {
        Group group() {
            return MktApplicationStages.of(app.getStage(), app.getClosedReason());
        }
    }

    private record Loaded(List<A> visible, int notShared, Map<Long, Person> people) {}

    @Transactional(readOnly = true)
    public Response get(OrgMembership me, Query q) {
        MktScope.View view = readGate(me, READ_KEY);
        Instant now = clock.instant();
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        Loaded l = load(view);

        // KPIs: the whole visible book, not narrowed by the tracker filters
        List<Kpi> kpis = List.of(
            kpi("active", l.visible(), now, g -> !MktApplicationStages.CLOSED.equals(g)),
            kpi("awaiting", l.visible(), now, g -> "UNDER_REVIEW".equals(g)),
            kpi("interviewing", l.visible(), now, g -> "INTERVIEWING".equals(g)),
            kpi("offers", l.visible(), now, g -> "OFFER".equals(g))
        );

        // Tracker: filters -> tab counts -> stage -> sort -> page
        LocalDate since = since(q.period(), today);
        String needle = q.q() == null ? "" : q.q().strip().toLowerCase(Locale.ROOT);
        List<A> filtered = l.visible().stream().filter(a -> matches(a, q, needle, since)).toList();
        Group stageFilter = q.stage() == null ? null : Group.ofKey(q.stage()).orElse(null);
        List<A> inStage = stageFilter == null ? filtered : filtered.stream().filter(a -> a.group() == stageFilter).toList();
        boolean asc = q.sort() != null && q.sort().toLowerCase(Locale.ROOT).endsWith(",asc");
        Comparator<A> byDate = Comparator.comparing((A a) -> a.app().getAppliedOn()).thenComparing(a -> a.app().getId());
        List<A> sorted = inStage.stream().sorted(asc ? byDate : byDate.reversed()).toList();
        int size = q.size() <= 0 ? DEFAULT_SIZE : Math.min(q.size(), MAX_SIZE);
        int page = Math.max(0, q.page());
        List<Row> items = sorted.stream().skip((long) page * size).limit(size).map(a -> row(a, l.people())).toList();
        Map<Group, Long> counts = filtered.stream().collect(Collectors.groupingBy(A::group, Collectors.counting()));
        List<Tab> tabs = new ArrayList<>();
        tabs.add(new Tab("all", "All Applications", filtered.size()));
        for (Group g : Group.values()) tabs.add(new Tab(g.key(), g.label(), counts.getOrDefault(g, 0L)));
        Tracker tracker = new Tracker(items, sorted.size(), page, size, tabs, filters(l.visible()), l.notShared());

        return new Response(
            kpis, tracker, funnel(l.visible(), q.funnelPeriod(), today), overdue(l, today), overdueTotal(l, today), updates(l),
            new Perms(me.canKey(FOLLOWUPS_KEY), me.canKey(RECORD_KEY))
        );
    }

    private MktScope.View readGate(OrgMembership me, String key) {
        MktScope.View view = scope.resolve(me, key);
        if (!me.canKey(PIPELINE_KEY)) throw new OrgNotFoundException();
        return view;
    }

    private Loaded load(MktScope.View view) {
        Long orgId = view.orgId();
        List<TalentApplication> rows = view.all()
            ? apps.findByOrgId(orgId)
            : view.consultantIds().isEmpty() ? List.of() : apps.findByOrgIdAndConsultantIdIn(orgId, view.consultantIds());
        rows = rows.stream().filter(a -> view.sees(a.getConsultantId())).toList();
        if (rows.isEmpty()) return new Loaded(List.of(), 0, Map.of());

        Map<Long, ConsultantProfile> byConsultant = new HashMap<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, rows.stream().map(TalentApplication::getConsultantId).collect(Collectors.toSet()))) byConsultant.put(c.getId(), c);
        Map<Long, ShareScope> consent = new HashMap<>();
        for (ConsultantProfile c : byConsultant.values()) consent.put(c.getId(), consentOf(orgId, c));

        List<TalentApplication> kept = rows.stream().filter(a -> byConsultant.containsKey(a.getConsultantId()) && consent.get(a.getConsultantId()) != ShareScope.NONE).toList();
        int notShared = (int) rows.stream().map(TalentApplication::getConsultantId).distinct().filter(id -> byConsultant.containsKey(id) && consent.get(id) == ShareScope.NONE).count();
        if (kept.isEmpty()) return new Loaded(List.of(), notShared, Map.of());

        Map<Long, ClientRequirement> reqs = new HashMap<>();
        for (ClientRequirement r : requirements.findByOrgIdAndIdIn(orgId, kept.stream().map(TalentApplication::getRequirementId).collect(Collectors.toSet()))) reqs.put(r.getId(), r);
        Map<Long, ClientAccount> accounts = new HashMap<>();
        for (ClientAccount c : clients.findByOrgIdAndIdIn(orgId, kept.stream().map(TalentApplication::getClientId).collect(Collectors.toSet()))) accounts.put(c.getId(), c);
        Map<Long, List<TalentApplicationEvent>> history = new HashMap<>();
        for (TalentApplicationEvent e : events.findByOrgIdAndApplicationIdIn(orgId, kept.stream().map(TalentApplication::getId).toList())) history.computeIfAbsent(e.getApplicationId(), k -> new ArrayList<>()).add(e);
        history.values().forEach(h -> h.sort(Comparator.comparing(TalentApplicationEvent::getOccurredAt).thenComparing(TalentApplicationEvent::getId, Comparator.nullsLast(Comparator.naturalOrder()))));

        List<A> visible = new ArrayList<>();
        Set<Long> memberIds = new HashSet<>();
        for (TalentApplication a : kept) {
            boolean full = consent.get(a.getConsultantId()) == ShareScope.FULL;
            ClientRequirement r = reqs.get(a.getRequirementId());
            ClientAccount c = accounts.get(a.getClientId());
            visible.add(new A(a, byConsultant.get(a.getConsultantId()), full, r == null ? null : r.getTitle(), c == null ? null : c.getName(), history.getOrDefault(a.getId(), List.of())));
            if (a.getMarketerMemberId() != null) memberIds.add(a.getMarketerMemberId());
        }
        return new Loaded(visible, notShared, people(orgId, memberIds));
    }

    /** SUMMARY for a profile without a seat (nobody to ask, nothing to carry over: doc 60 section 0.8); a seat's effective scope otherwise. */
    private ShareScope consentOf(Long orgId, ConsultantProfile c) {
        if (c.getMemberId() == null) return ShareScope.SUMMARY;
        ShareScope s = shares.scopeOf(orgId, c.getMemberId());
        return s == null ? ShareScope.NONE : s;
    }

    private Map<Long, Person> people(Long orgId, Set<Long> memberIds) {
        if (memberIds.isEmpty()) return Map.of();
        List<OrgMember> seats = members.findByOrgIdAndIdIn(orgId, memberIds);
        Map<Long, User> byUser = new HashMap<>();
        for (User u : users.findAllById(seats.stream().map(OrgMember::getUserId).filter(java.util.Objects::nonNull).toList())) byUser.put(u.getId(), u);
        Map<Long, Person> out = new HashMap<>();
        for (OrgMember s : seats) {
            User u = s.getUserId() == null ? null : byUser.get(s.getUserId());
            out.put(s.getId(), new Person(s.getId(), personName(u, s), u == null ? null : u.getImageUrl()));
        }
        return out;
    }

    static String personName(User u, OrgMember seat) {
        if (u != null) {
            String n = ((u.getFirstName() == null ? "" : u.getFirstName().strip()) + " " + (u.getLastName() == null ? "" : u.getLastName().strip())).strip();
            if (!n.isEmpty()) return n;
        }
        if (seat != null && seat.getDisplayLabel() != null && !seat.getDisplayLabel().isBlank()) return seat.getDisplayLabel().strip();
        return seat == null ? "Member" : "Member " + seat.getId();
    }

    private static Consultant consultantOf(A a) {
        return new Consultant(a.consultant().getId(), a.consultant().getDisplayName(), null, a.full() ? "FULL" : "SUMMARY");
    }

    private Row row(A a, Map<Long, Person> people) {
        TalentApplication t = a.app();
        Group g = a.group();
        Person owner = t.getMarketerMemberId() == null ? null : people.get(t.getMarketerMemberId());
        return new Row(
            t.getId(), a.full() ? t.getCode() : null, consultantOf(a), a.full() ? a.role() : null, a.full() ? a.client() : null, a.full() ? t.getSourceLabel() : null,
            a.full() ? t.getAppliedOn() : null, new StageRef(g.key(), g.label()), owner, a.full() ? t.getNextAction() : null, a.full() ? t.getNextActionDue() : null
        );
    }

    static LocalDate since(String period, LocalDate today) {
        if (period == null) return today.minusMonths(3);
        return switch (period) {
            case "1m" -> today.minusMonths(1);
            case "6m" -> today.minusMonths(6);
            case "12m" -> today.minusMonths(12);
            case "all" -> null;
            default -> today.minusMonths(3);
        };
    }

    private static boolean matches(A a, Query q, String needle, LocalDate since) {
        TalentApplication t = a.app();
        if (since != null && t.getAppliedOn().isBefore(since)) return false;
        if (q.consultantId() != null && !q.consultantId().equals(t.getConsultantId())) return false;
        if (q.clientId() != null && !(a.full() && q.clientId().equals(t.getClientId()))) return false;
        if (needle.isEmpty()) return true;
        if (lower(a.consultant().getDisplayName()).contains(needle)) return true;
        return a.full() && (lower(a.role()).contains(needle) || lower(a.client()).contains(needle) || lower(t.getSourceLabel()).contains(needle) || lower(t.getCode()).contains(needle));
    }

    private static String lower(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT);
    }

    private static Filters filters(List<A> visible) {
        Map<Long, String> people = new LinkedHashMap<>();
        Map<Long, String> accounts = new LinkedHashMap<>();
        for (A a : visible) {
            people.putIfAbsent(a.consultant().getId(), a.consultant().getDisplayName());
            if (a.full() && a.client() != null) accounts.putIfAbsent(a.app().getClientId(), a.client());
        }
        Comparator<Option> byName = Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER);
        return new Filters(
            people.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(byName).toList(),
            accounts.entrySet().stream().map(e -> new Option(e.getKey(), e.getValue())).sorted(byName).toList()
        );
    }

    // ---- KPIs ---------------------------------------------------------------------------------------------------------------

    /** The stored stage of {@code a} at {@code t} (the last stage-bearing event up to then); null when it did not exist yet. */
    static String stageAt(TalentApplication app, List<TalentApplicationEvent> history, Instant t, Instant now) {
        if (!t.isBefore(now)) return app.getStage();
        String stage = null;
        for (TalentApplicationEvent e : history) {
            if (e.getOccurredAt().isAfter(t)) break;
            if (e.getToStage() != null) stage = e.getToStage();
        }
        if (stage == null && history.isEmpty() && !app.getCreatedAt().isAfter(t)) return app.getStage();
        return stage;
    }

    private Kpi kpi(String key, List<A> visible, Instant now, Predicate<String> stage) {
        List<Long> spark = new ArrayList<>();
        for (int i = 0; i < SPARK_POINTS; i++) spark.add(countAt(visible, now.minus(7L * (SPARK_POINTS - 1 - i), ChronoUnit.DAYS), now, stage));
        long value = spark.get(SPARK_POINTS - 1);
        long previous = countAt(visible, now.minus(30, ChronoUnit.DAYS), now, stage);
        Double delta = previous == 0 ? null : Math.round((value - previous) * 1000.0 / previous) / 10.0;
        return new Kpi(key, value, delta, spark);
    }

    private static long countAt(List<A> visible, Instant t, Instant now, Predicate<String> stage) {
        long n = 0;
        for (A a : visible) {
            String s = stageAt(a.app(), a.history(), t, now);
            if (s != null && stage.test(s)) n++;
        }
        return n;
    }

    // ---- funnel, overdue, updates ---------------------------------------------------------------------------------------------

    private Funnel funnel(List<A> visible, String period, LocalDate today) {
        String p = period == null ? "3m" : period;
        LocalDate since = since(p, today);
        List<A> inPeriod = visible.stream().filter(a -> since == null || !a.app().getAppliedOn().isBefore(since)).toList();
        long total = inPeriod.size();
        long[] reached = new long[5];
        for (A a : inPeriod) {
            int rank = a.group().rank();
            for (TalentApplicationEvent e : a.history()) rank = Math.max(rank, MktApplicationStages.rankOfStage(e.getToStage()));
            for (int i = 0; i < 5; i++) if (rank >= i) reached[i]++;
        }
        String[] keys = { "applied", "awaiting", "interviewing", "offers", "hired" };
        String[] labels = { "Applied", "Awaiting Response", "Interviewing", "Offers", "Hired" };
        List<FunnelStageRow> rows = new ArrayList<>();
        for (int i = 0; i < 5; i++) rows.add(new FunnelStageRow(keys[i], labels[i], reached[i], total == 0 ? 0 : (int) Math.round(reached[i] * 100.0 / total)));
        return new Funnel(p, total, rows);
    }

    private static List<A> overdueRows(Loaded l, LocalDate today) {
        return l.visible().stream()
            .filter(a -> a.full() && !MktApplicationStages.CLOSED.equals(a.app().getStage()) && a.app().getNextAction() != null && a.app().getNextActionDue() != null && a.app().getNextActionDue().isBefore(today))
            .sorted(Comparator.comparing((A a) -> a.app().getNextActionDue()).thenComparing(a -> a.app().getId()))
            .toList();
    }

    private static long overdueTotal(Loaded l, LocalDate today) {
        return overdueRows(l, today).size();
    }

    private static List<Overdue> overdue(Loaded l, LocalDate today) {
        return overdueRows(l, today).stream().limit(LIST_LIMIT).map(a -> new Overdue(
            a.app().getId(), consultantOf(a), a.app().getNextAction(), join(a.client(), a.role()), ChronoUnit.DAYS.between(a.app().getNextActionDue(), today)
        )).toList();
    }

    private static String join(String client, String role) {
        if (client == null) return role == null ? "" : role;
        return role == null ? client : client + " - " + role;
    }

    private static List<Update> updates(Loaded l) {
        record E(A a, TalentApplicationEvent e) {}
        List<E> all = new ArrayList<>();
        for (A a : l.visible()) for (TalentApplicationEvent e : a.history()) all.add(new E(a, e));
        Comparator<E> newest = Comparator.comparing((E x) -> x.e().getOccurredAt()).thenComparing(x -> x.e().getId(), Comparator.nullsLast(Comparator.naturalOrder()));
        List<Update> out = new ArrayList<>();
        for (E x : all.stream().sorted(newest.reversed()).toList()) {
            if (out.size() >= LIST_LIMIT) break;
            TalentApplicationEvent e = x.e();
            boolean stageChange = "STAGE_CHANGE".equals(e.getEventType());
            if (!stageChange && !x.a().full()) continue; // below FULL only stage movements are shared
            Update u = switch (e.getEventType() == null ? "" : e.getEventType()) {
                case "STAGE_CHANGE" -> {
                    Group g = "CLOSED".equals(e.getToStage()) ? (x.a().group() == Group.HIRED ? Group.HIRED : Group.NOT_SELECTED) : MktApplicationStages.of(e.getToStage(), null);
                    yield new Update(e.getId(), x.a().app().getId(), consultantOf(x.a()), "moved to " + g.label(), x.a().full() ? join2(x.a().role(), x.a().client()) : null, e.getOccurredAt(), tone(g));
                }
                case "CREATED" -> new Update(e.getId(), x.a().app().getId(), consultantOf(x.a()), "application added", join2(x.a().role(), x.a().client()), e.getOccurredAt(), "blue");
                case "NOTE" -> new Update(e.getId(), x.a().app().getId(), consultantOf(x.a()), "note added", join2(x.a().role(), x.a().client()), e.getOccurredAt(), "violet");
                default -> null;
            };
            if (u != null) out.add(u);
        }
        return out;
    }

    private static String join2(String role, String client) {
        if (role == null) return client;
        return client == null ? role : role + " at " + client;
    }

    private static String tone(Group g) {
        return switch (g) {
            case APPLIED -> "blue";
            case AWAITING -> "violet";
            case INTERVIEWING -> "amber";
            case OFFER, HIRED -> "green";
            case NOT_SELECTED -> "red";
        };
    }

    // ---- writes (records only; E1) -------------------------------------------------------------------------------------------

    @Transactional
    public Row addNote(OrgMembership me, Long applicationId, NoteRequest req) {
        TalentApplication app = writable(me, FOLLOWUPS_KEY, applicationId);
        String body = req == null || req.body() == null ? "" : req.body().strip();
        if (body.isEmpty()) throw OrgException.invalid("body", "is required");
        if (body.length() > NOTE_MAX) throw OrgException.invalid("body", "is too long");
        SensitiveContent.check("body", "note", body);
        TalentApplicationNote n = new TalentApplicationNote();
        n.setOrgId(me.orgId());
        n.setApplicationId(app.getId());
        n.setAuthorMemberId(me.memberId());
        n.setBody(body);
        notes.save(n);
        event(me, app, "NOTE", null, null, "Note added");
        audit(me, "MKT_APPLICATION_NOTE", app, "note");
        return single(me, app);
    }

    @Transactional
    public Row setNextAction(OrgMembership me, Long applicationId, NextActionRequest req) {
        TalentApplication app = writable(me, FOLLOWUPS_KEY, applicationId);
        String action = req == null || req.nextAction() == null ? "" : req.nextAction().strip();
        if (action.length() > ACTION_MAX) throw OrgException.invalid("nextAction", "is too long");
        if (!action.isEmpty()) SensitiveContent.check("nextAction", "nextAction", action);
        if (action.isEmpty()) {
            app.setNextAction(null);
            app.setNextActionDue(null);
            event(me, app, "NOTE", null, null, "Next action cleared");
        } else {
            app.setNextAction(action);
            app.setNextActionDue(req.dueDate());
            event(me, app, "NOTE", null, null, "Next action set" + (req.dueDate() == null ? "" : " (due " + req.dueDate() + ")"));
        }
        apps.save(app);
        audit(me, "MKT_APPLICATION_NEXT_ACTION", app, "nextAction");
        return single(me, app);
    }

    @Transactional
    public Row markFollowUpDone(OrgMembership me, Long applicationId) {
        TalentApplication app = writable(me, FOLLOWUPS_KEY, applicationId);
        if (app.getNextAction() == null || app.getNextAction().isBlank()) throw OrgException.invalid("nextAction", "there is no follow-up to complete");
        String done = app.getNextAction();
        app.setNextAction(null);
        app.setNextActionDue(null);
        apps.save(app);
        event(me, app, "NOTE", null, null, "Follow-up done: " + (done.length() > 200 ? done.substring(0, 200) : done));
        audit(me, "MKT_APPLICATION_FOLLOWUP_DONE", app, "followUpDone");
        return single(me, app);
    }

    /**
     * RECORDS the stage the consultant's application is at (an event on its timeline). It never submits anything and never signs in as
     * the consultant: the consultant owns the real submission, this keeps the marketer's record in step with it.
     */
    @Transactional
    public Row recordStage(OrgMembership me, Long applicationId, StageRequest req) {
        TalentApplication app = writable(me, RECORD_KEY, applicationId);
        if (app.getPersonalApplicationId() != null) {
            // the row follows the consultant's own application (SYSTEM-owned): the consultant's record is the truth, a marketer never overwrites it
            throw OrgException.coded(409, STAGE_OWNED_BY_CONSULTANT, "This stage follows the consultant's own application and can not be recorded by a marketer.", java.util.Map.of());
        }
        Group g =req == null || req.stage() == null ? null : Group.ofKey(req.stage()).orElse(null);
        if (g == null) throw OrgException.invalid("stage", "is not a stage of the board");
        String reason = null;
        if (g == Group.HIRED) reason = "HIRED";
        if (g == Group.NOT_SELECTED) {
            reason = req.reason() == null || req.reason().isBlank() ? "REJECTED" : req.reason().strip().toUpperCase(Locale.ROOT);
            if (!MktApplicationStages.NOT_SELECTED_REASONS.contains(reason)) throw OrgException.invalid("reason", "is not one of REJECTED, NO_RESPONSE, WITHDRAWN");
        }
        if (MktApplicationStages.of(app.getStage(), app.getClosedReason()) == g && java.util.Objects.equals(reason, app.getClosedReason())) return single(me, app);
        String from = app.getStage();
        String to = MktApplicationStages.storedStage(g);
        app.setStage(to);
        app.setClosedReason(reason);
        app.setStageChangedAt(clock.instant());
        apps.save(app);
        event(me, app, "STAGE_CHANGE", from, to, "Recorded by the marketer" + (reason == null ? "" : " (" + reason + ")"));
        audit(me, "MKT_APPLICATION_STAGE_RECORDED", app, g.key());
        return single(me, app);
    }

    /** Gate + load for a write: the write key's own scope, an application of a consultant the caller may see and who shares detail (else 404). */
    private TalentApplication writable(OrgMembership me, String writeKey, Long applicationId) {
        MktScope.View view = readGate(me, writeKey);
        TalentApplication app = apps.findByOrgIdAndId(view.orgId(), applicationId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, app.getConsultantId());
        ConsultantProfile c = consultants.findByOrgIdAndIdIn(view.orgId(), List.of(app.getConsultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        // A seat must share FULL before the org writes on its records. A profile WITHOUT a seat has nobody to consent and nothing private to protect:
        // the marketer's own record of it stays writable (these rows never carry a personal application, so recordStage's ownership rule never bites).
        if (c.getMemberId() != null && consentOf(view.orgId(), c) != ShareScope.FULL) throw new OrgNotFoundException();
        return app;
    }

    private void event(OrgMembership me, TalentApplication app, String type, String from, String to, String detail) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(me.orgId());
        e.setApplicationId(app.getId());
        e.setEventType(type);
        e.setFromStage(from);
        e.setToStage(to);
        e.setActorMemberId(me.memberId());
        e.setDetail(detail != null && detail.length() > 300 ? detail.substring(0, 300) : detail);
        e.setOccurredAt(clock.instant());
        events.save(e);
    }

    private void audit(OrgMembership me, String action, TalentApplication app, String what) {
        this.audit.record(me, action, "APPLICATION", null, String.valueOf(app.getId()), "{\"code\":\"" + app.getCode() + "\",\"field\":\"" + what + "\"}");
    }

    /** The updated row (the caller proved FULL consent in {@link #writable}). */
    private Row single(OrgMembership me, TalentApplication app) {
        ConsultantProfile c = consultants.findByOrgIdAndIdIn(me.orgId(), List.of(app.getConsultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        ClientRequirement r = requirements.findByOrgIdAndIdIn(me.orgId(), List.of(app.getRequirementId())).stream().findFirst().orElse(null);
        ClientAccount k = clients.findByOrgIdAndIdIn(me.orgId(), List.of(app.getClientId())).stream().findFirst().orElse(null);
        Map<Long, Person> people = app.getMarketerMemberId() == null ? Map.of() : people(me.orgId(), Set.of(app.getMarketerMemberId()));
        return row(new A(app, c, true, r == null ? null : r.getTitle(), k == null ? null : k.getName(), List.of()), people);
    }
}
