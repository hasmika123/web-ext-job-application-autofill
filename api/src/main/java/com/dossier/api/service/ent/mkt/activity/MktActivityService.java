package com.dossier.api.service.ent.mkt.activity;

import com.dossier.api.domain.User;
import com.dossier.api.domain.ent.mkt.MktActivity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.MarketerAssignment;
import com.dossier.api.domain.enumeration.ShareScope;
import com.dossier.api.domain.org.OrgMember;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.mkt.MktActivityApplicationFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityAssignmentRepository;
import com.dossier.api.repository.ent.mkt.MktActivityClientRepository;
import com.dossier.api.repository.ent.mkt.MktActivityConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktActivityFollowupFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityInterviewFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityOpportunityFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityPlacementFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityRepository;
import com.dossier.api.repository.ent.mkt.MktActivityResumeFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivitySubmissionFeedRepository;
import com.dossier.api.repository.ent.mkt.MktActivityUpcomingInterviewRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.ActionResult;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Choice;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Client;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.CreateRequest;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Kpi;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Option;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Options;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Page;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Person;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Query;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Row;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Summary;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.SummaryRow;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.Upcoming;
import com.dossier.api.service.ent.mkt.activity.MktActivityDto.View;
import com.dossier.api.service.ent.mkt.activity.MktActivityTypes.Group;
import com.dossier.api.service.ent.mkt.activity.MktActivityTypes.Type;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
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
import java.time.format.DateTimeParseException;
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
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing workspace Activities page: ONE unified, read-mostly feed of what the marketer's side did, normalised from the existing records
 * ({@code mkt_resume_event}, {@code mkt_opportunity_event}, {@code mkt_submission_event}, {@code mkt_followup_event}, {@code mkt_interview_event},
 * {@code talent_application_event}, {@code talent_placement}) plus the page's own manual "Log Activity" rows ({@code mkt_activity}). Nothing of the sources is
 * written or edited here. {@code mkt_stream_*} rows are NOT feed lines: they are system job alerts, not something a marketer did.
 *
 * <p><b>Access.</b> Read = {@code pipeline.view} (ASSIGNED: every query is filtered to the consultants the caller may see, an id outside the set is the generic
 * 404). Write ("Log Activity", status change) = {@code followups.manage}: logging an activity is the marketer recording their own contact work, the same key that
 * guards recording a follow-up; a read-only viewer (Executive Viewer holds pipeline.view only) sees the feed and gets {@code canLog=false}. E1: a manual row only
 * RECORDS; it submits nothing, mails nothing, signs in as nobody. Free text is PII-scanned; every write is audited.
 *
 * <p><b>Consent.</b> Application and placement lines are consultant data: an application line of a consultant whose seat shared nothing is left out, one that
 * shared a summary only shows the stage movement (no job, no client) and placements are left out, exactly as the Applications page does. The marketer's own work
 * lines (resume, opportunity, submission, follow-up, interview) are not consent-gated, as on their own pages.
 *
 * <p><b>Numbers.</b> Everything is computed from rows over the chosen date range with the SAME normalised list: the table total, the KPI tiles (a tile is the
 * count of its group in the range, ignoring only the Type filter) and the summary (its own range, scope-only). A tile's delta compares the last 7 days of the
 * range (capped at now) with the 7 days before; its sparkline is the last 8 weekly buckets. A delta with nothing to compare to is null. Each source is read
 * newest-first and capped at {@link #SOURCE_CAP} rows per request.
 */
@Service
public class MktActivityService {

    public static final String PERMISSION = "pipeline.view";
    public static final String WRITE_PERMISSION = "followups.manage";
    public static final int DEFAULT_SIZE = 10;
    public static final int MAX_SIZE = 100;
    public static final int SOURCE_CAP = 2000;
    public static final int UPCOMING_DAYS = 14;
    public static final int UPCOMING_CAP = 20;
    public static final int OPTION_CAP = 200;
    static final int MAX_SPAN_DAYS = 366;
    static final int SPARK_WEEKS = 8;
    static final String AUDIT_CREATE = "MARKETER_ACTIVITY_CREATE";
    static final String AUDIT_STATUS = "MARKETER_ACTIVITY_STATUS";
    static final String TARGET = "ACTIVITY";
    private static final List<Long> NO_IDS = List.of(-1L);

    static final List<Choice> SUMMARY_RANGES = List.of(
        new Choice("THIS_MONTH", "This Month"), new Choice("LAST_MONTH", "Last Month"), new Choice("LAST_7_DAYS", "Last 7 Days"), new Choice("LAST_30_DAYS", "Last 30 Days")
    );
    /** The summary rows of the board, in order; Opportunities is appended only when it has something to show. */
    static final List<Group> SUMMARY_ORDER = List.of(Group.RESUME, Group.SUBMISSION, Group.FOLLOWUP, Group.INTERVIEW, Group.APPLICATION, Group.OFFER, Group.PLACEMENT);

    private final MktScope scope;
    private final MktActivityRepository manual;
    private final MktActivityResumeFeedRepository resumeFeed;
    private final MktActivityOpportunityFeedRepository opportunityFeed;
    private final MktActivitySubmissionFeedRepository submissionFeed;
    private final MktActivityFollowupFeedRepository followupFeed;
    private final MktActivityInterviewFeedRepository interviewFeed;
    private final MktActivityApplicationFeedRepository applicationFeed;
    private final MktActivityPlacementFeedRepository placementFeed;
    private final MktActivityUpcomingInterviewRepository upcomingInterviews;
    private final MktActivityConsultantRepository consultants;
    private final MktActivityClientRepository clients;
    private final MktActivityAssignmentRepository assignments;
    private final OrgMemberRepository members;
    private final UserRepository users;
    private final DataShareService shares;
    private final MktFollowupService followups;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktActivityService(
        MktScope scope, MktActivityRepository manual, MktActivityResumeFeedRepository resumeFeed, MktActivityOpportunityFeedRepository opportunityFeed,
        MktActivitySubmissionFeedRepository submissionFeed, MktActivityFollowupFeedRepository followupFeed, MktActivityInterviewFeedRepository interviewFeed,
        MktActivityApplicationFeedRepository applicationFeed, MktActivityPlacementFeedRepository placementFeed, MktActivityUpcomingInterviewRepository upcomingInterviews,
        MktActivityConsultantRepository consultants, MktActivityClientRepository clients, MktActivityAssignmentRepository assignments, OrgMemberRepository members,
        UserRepository users, DataShareService shares, MktFollowupService followups, OrgAuditService audit
    ) {
        this(scope, manual, resumeFeed, opportunityFeed, submissionFeed, followupFeed, interviewFeed, applicationFeed, placementFeed, upcomingInterviews, consultants, clients,
            assignments, members, users, shares, followups, audit, Clock.systemUTC());
    }

    MktActivityService(
        MktScope scope, MktActivityRepository manual, MktActivityResumeFeedRepository resumeFeed, MktActivityOpportunityFeedRepository opportunityFeed,
        MktActivitySubmissionFeedRepository submissionFeed, MktActivityFollowupFeedRepository followupFeed, MktActivityInterviewFeedRepository interviewFeed,
        MktActivityApplicationFeedRepository applicationFeed, MktActivityPlacementFeedRepository placementFeed, MktActivityUpcomingInterviewRepository upcomingInterviews,
        MktActivityConsultantRepository consultants, MktActivityClientRepository clients, MktActivityAssignmentRepository assignments, OrgMemberRepository members,
        UserRepository users, DataShareService shares, MktFollowupService followups, OrgAuditService audit, Clock clock
    ) {
        this.scope = scope;
        this.manual = manual;
        this.resumeFeed = resumeFeed;
        this.opportunityFeed = opportunityFeed;
        this.submissionFeed = submissionFeed;
        this.followupFeed = followupFeed;
        this.interviewFeed = interviewFeed;
        this.applicationFeed = applicationFeed;
        this.placementFeed = placementFeed;
        this.upcomingInterviews = upcomingInterviews;
        this.consultants = consultants;
        this.clients = clients;
        this.assignments = assignments;
        this.members = members;
        this.users = users;
        this.shares = shares;
        this.followups = followups;
        this.audit = audit;
        this.clock = clock;
    }

    /** One normalised feed line before names are attached. {@code stage} marks an application stage movement (the only application line a summary-only consent shows). */
    record Item(
        String id, String source, Type type, String title, String subtitle, Instant at, Long actorId, Long consultantId, Long clientId, String clientLabel, String tag,
        String status, boolean manual, boolean stage
    ) {}

    /** A half-open instant range plus its yyyy-MM-dd labels. */
    record Range(Instant from, Instant to, String fromDay, String toDay) {}

    // ---- the page --------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public View view(OrgMembership me, Query q) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();
        Range range = range(q.from(), q.to(), now);
        String summaryKey = summaryRangeKey(q.summaryRange());
        Range summaryRange = summaryRange(summaryKey, now);
        Instant effEnd = range.to().isAfter(now) ? now : range.to();
        Instant sparkFrom = effEnd.minus(7L * SPARK_WEEKS, ChronoUnit.DAYS);
        Instant fetchFrom = min(min(range.from(), summaryRange.from()), sparkFrom);
        Instant fetchTo = max(range.to(), summaryRange.to());

        List<Item> all = load(v, fetchFrom, fetchTo);
        Names names = names(v.orgId(), all);

        // table: every filter; tiles: every filter but the Type one
        Group typeFilter = Group.parse(q.type()).orElse(null);
        Predicate<Item> common = common(q, names);
        List<Item> inRange = all.stream().filter(i -> within(i.at(), range.from(), range.to())).toList();
        List<Item> forTiles = inRange.stream().filter(common).toList();
        List<Item> rows = forTiles.stream().filter(i -> typeFilter == null || i.type().group == typeFilter).toList();
        rows = sort(rows, q.sort());

        int size = size(q.size());
        int page = Math.max(0, q.page());
        int from = Math.min(rows.size(), page * size);
        List<Item> shown = rows.subList(from, Math.min(rows.size(), from + size));
        List<Row> out = shown.stream().map(i -> row(i, names)).toList();

        List<Kpi> kpis = kpis(forTiles, all.stream().filter(common).toList(), effEnd);
        Summary summary = summary(all, summaryKey, summaryRange);
        List<Upcoming> upcoming = upcoming(v, now);
        return new View(
            now, range.fromDay(), range.toDay(), canLog(me), kpis, new Page(out, rows.size(), page, size), summary, upcoming.subList(0, Math.min(upcoming.size(), UPCOMING_CAP)),
            upcoming.size(), options(v, inRange, names)
        );
    }

    private boolean canLog(OrgMembership me) {
        try {
            scope.resolve(me, WRITE_PERMISSION);
            return true;
        } catch (OrgNotFoundException e) {
            return false;
        }
    }

    // ---- writes (record only) --------------------------------------------------------------------------------------------

    @Transactional
    public ActionResult create(OrgMembership me, CreateRequest req) {
        MktScope.View v = scope.resolve(me, WRITE_PERMISSION);
        Long orgId = v.orgId();
        scope.require(v, req.consultantId());
        ConsultantProfile consultant = consultants.findByOrgIdAndIdIn(orgId, List.of(req.consultantId())).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        ClientAccount client = req.clientAccountId() == null ? null : clients.findByOrgIdAndId(orgId, req.clientAccountId()).orElseThrow(OrgNotFoundException::new);
        Type type = Type.parse(req.type()).filter(t -> t.manual).orElseThrow(() -> OrgException.invalid("type", "must be one of " + Type.manualTypes().stream().map(Enum::name).collect(Collectors.joining(", "))));
        String title = text("title", req.title(), 160, true);
        String detail = text("detail", req.detail(), 200, false);
        String tags = tags(req.tags());
        Instant now = clock.instant();
        Instant at = req.occurredAt() == null ? now : req.occurredAt();
        if (at.isBefore(now.minus(3 * 366L, ChronoUnit.DAYS)) || at.isAfter(now.plus(366, ChronoUnit.DAYS))) throw OrgException.invalid("occurredAt", "must be within the last three years and the next year");
        String status = req.status() == null || req.status().isBlank() ? (at.isAfter(now) ? MktActivity.SCHEDULED : MktActivity.COMPLETED) : oneOf("status", req.status(), MktActivity.STATUSES);
        if (MktActivity.COMPLETED.equals(status) && at.isAfter(now.plus(5, ChronoUnit.MINUTES))) throw OrgException.invalid("status", "a completed activity cannot be in the future");

        MktActivity a = new MktActivity();
        a.setOrgId(orgId);
        a.setConsultantId(consultant.getId());
        a.setClientAccountId(client == null ? null : client.getId());
        a.setActivityType(type.name());
        a.setTitle(title);
        a.setDetail(detail);
        a.setTags(tags);
        a.setStatus(status);
        a.setOccurredAt(at);
        a.setActorMemberId(me.memberId());
        a.setCreatedAt(now);
        manual.save(a);
        audit.record(me, AUDIT_CREATE, TARGET, null, String.valueOf(a.getId()), "consultant=" + consultant.getId() + " type=" + type.name() + " status=" + status);
        Item item = item(a);
        return new ActionResult(row(item, names(orgId, List.of(item))));
    }

    /** Marks one of the caller's manual rows COMPLETED, SCHEDULED or CANCELLED. Source-derived lines are not editable (404). */
    @Transactional
    public ActionResult updateStatus(OrgMembership me, Long id, String status) {
        MktScope.View v = scope.resolve(me, WRITE_PERMISSION);
        MktActivity a = manual.findByOrgIdAndId(v.orgId(), id).orElseThrow(OrgNotFoundException::new);
        scope.require(v, a.getConsultantId());
        String next = oneOf("status", status, MktActivity.STATUSES);
        if (!next.equals(a.getStatus())) {
            String prev = a.getStatus();
            a.setStatus(next);
            manual.save(a);
            audit.record(me, AUDIT_STATUS, TARGET, null, String.valueOf(a.getId()), prev + " -> " + next);
        }
        Item item = item(a);
        return new ActionResult(row(item, names(v.orgId(), List.of(item))));
    }

    // ---- loading and normalising ---------------------------------------------------------------------------------------------

    /** Every feed line of every source in {@code [from, to)} for the consultants the caller may see, consent applied, unsorted. */
    List<Item> load(MktScope.View v, Instant from, Instant to) {
        Long org = v.orgId();
        boolean all = v.all();
        Collection<Long> ids = ids(v);
        PageRequest cap = PageRequest.of(0, SOURCE_CAP);
        List<Item> out = new ArrayList<>();

        for (Object[] r : resumeFeed.feed(org, all, ids, from, to, cap)) {
            Type t = MktActivityTypes.resume((String) r[1]);
            if (t == null) continue;
            String detail = clean((String) r[3]);
            String sub = detail != null ? detail : r[2] != null && (t == Type.RESUME_UPDATED || t == Type.RESUME_ADDED) ? "Resume version " + r[2] : t.phrase;
            out.add(feed("RESUME", (Long) r[0], t, sub, (Instant) r[6], (Long) r[5], (Long) r[4], null, null, null));
        }
        for (Object[] r : opportunityFeed.feed(org, all, ids, from, to, cap)) {
            Type t = MktActivityTypes.opportunity((String) r[1]);
            if (t == null) continue;
            out.add(feed("OPPORTUNITY", (Long) r[0], t, with(t.phrase, (String) r[5]), (Instant) r[7], (Long) r[6], (Long) r[3], (Long) r[4], null, null));
        }
        for (Object[] r : submissionFeed.feed(org, all, ids, from, to, cap)) {
            Type t = MktActivityTypes.submission((String) r[1], (String) r[3]);
            if (t == null) continue;
            String detail = clean((String) r[4]);
            out.add(feed("SUBMISSION", (Long) r[0], t, detail != null ? detail : with(t.phrase, (String) r[7]), (Instant) r[9], (Long) r[8], (Long) r[5], (Long) r[6], null, null));
        }
        for (Object[] r : followupFeed.feed(org, all, ids, from, to, cap)) {
            Type t = MktActivityTypes.followup((String) r[1], (String) r[2]);
            if (t == null) continue;
            String note = clean((String) r[2]);
            boolean statusNote = note != null && note.contains("->");
            String sub = note != null && !statusNote ? note : with(t.phrase, (String) r[5]);
            out.add(feed("FOLLOWUP", (Long) r[0], t, sub, (Instant) r[9], (Long) r[8], (Long) r[3], (Long) r[4], clean((String) r[6]), null));
        }
        for (Object[] r : interviewFeed.feed(org, all, ids, from, to, cap)) {
            Type t = MktActivityTypes.interview((String) r[1]);
            if (t == null) continue;
            String detail = clean((String) r[2]);
            String round = clean((String) r[5]);
            out.add(feed("INTERVIEW", (Long) r[0], t, detail != null ? detail : t.phrase, (Instant) r[7], (Long) r[6], (Long) r[3], (Long) r[4], null, round));
        }

        // consultant data below: application events and placements go through the consultant's consent
        List<Object[]> appRows = applicationFeed.feed(org, all, ids, from, to, cap);
        LocalDate fromDay = LocalDate.ofInstant(from, ZoneOffset.UTC);
        LocalDate toDay = LocalDate.ofInstant(to, ZoneOffset.UTC).plusDays(1);
        List<Object[]> placementRows = placementFeed.feed(org, all, ids, fromDay, toDay, cap);
        Set<Long> consentIds = new LinkedHashSet<>();
        for (Object[] r : appRows) consentIds.add((Long) r[4]);
        for (Object[] r : placementRows) consentIds.add((Long) r[3]);
        Map<Long, ShareScope> consent = consents(org, consentIds);

        for (Object[] r : appRows) {
            Type t = MktActivityTypes.application((String) r[1], (String) r[2]);
            if (t == null) continue;
            ShareScope s = consent.getOrDefault((Long) r[4], ShareScope.NONE);
            boolean stage = "STAGE_CHANGE".equals(r[1]);
            if (s == ShareScope.NONE || (s != ShareScope.FULL && !stage)) continue; // below FULL only stage movements are shared
            boolean full = s == ShareScope.FULL;
            String stageWord = MktActivityTypes.stageLabel((String) r[2]);
            String sub = t == Type.APPLICATION_MOVED && stageWord != null ? "Moved to " + stageWord.toLowerCase(Locale.ROOT) + " stage" : t.phrase;
            Item i = feed("APPLICATION", (Long) r[0], t, full ? with(sub, (String) r[6]) : sub, (Instant) r[8], (Long) r[7], (Long) r[4], full ? (Long) r[5] : null, null, null);
            out.add(new Item(i.id(), i.source(), i.type(), t == Type.APPLICATION_MOVED && stageWord != null ? "Application Moved to " + stageWord : i.title(), i.subtitle(), i.at(), i.actorId(),
                i.consultantId(), i.clientId(), i.clientLabel(), i.tag(), i.status(), false, stage));
        }
        Set<Long> placementConsultants = new LinkedHashSet<>();
        for (Object[] r : placementRows) if (consent.get((Long) r[3]) == ShareScope.FULL) placementConsultants.add((Long) r[3]);
        Map<Long, Long> marketerOf = new HashMap<>();
        if (!placementConsultants.isEmpty()) for (MarketerAssignment a : assignments.findByOrgIdAndConsultantIdIn(org, placementConsultants)) marketerOf.put(a.getConsultantId(), a.getMarketerMemberId());
        for (Object[] r : placementRows) {
            if (consent.get((Long) r[3]) != ShareScope.FULL) continue;
            Instant at = ((LocalDate) r[5]).atStartOfDay().toInstant(ZoneOffset.UTC);
            String tag = "ACTIVE".equals(r[2]) ? "Active" : "Ended";
            Item i = feed("PLACEMENT", (Long) r[0], Type.PLACEMENT_CONFIRMED, with(Type.PLACEMENT_CONFIRMED.phrase, (String) r[1]), at, marketerOf.get((Long) r[3]), (Long) r[3], (Long) r[4], null, null);
            out.add(new Item(i.id(), i.source(), i.type(), i.title(), i.subtitle(), i.at(), i.actorId(), i.consultantId(), i.clientId(), i.clientLabel(), tag, i.status(), false, false));
        }

        for (MktActivity a : manual.findBetween(org, all, ids, from, to, cap)) out.add(item(a));
        return out.stream().filter(i -> within(i.at(), from, to)).toList();
    }

    /** A source line: the type decides the title, group and default tag; {@code round} replaces the default tag when it names the interview round. */
    private static Item feed(String source, Long id, Type t, String subtitle, Instant at, Long actor, Long consultant, Long client, String clientLabel, String round) {
        return new Item(source + ":" + id, source, t, t.title, subtitle, at, actor, consultant, client, clientLabel, round != null ? round : t.tag, MktActivity.COMPLETED, false, false);
    }

    private static Item item(MktActivity a) {
        Type t = Type.parse(a.getActivityType()).orElse(Type.APPLICATION_NOTE);
        String tag = firstTag(a.getTags());
        return new Item("MANUAL:" + a.getId(), "MANUAL", t, a.getTitle(), a.getDetail() != null && !a.getDetail().isBlank() ? a.getDetail() : t.phrase, a.getOccurredAt(), a.getActorMemberId(),
            a.getConsultantId(), a.getClientAccountId(), null, tag != null ? tag : t.tag, a.getStatus(), true, false);
    }

    private Map<Long, ShareScope> consents(Long orgId, Collection<Long> consultantIds) {
        if (consultantIds.isEmpty()) return Map.of();
        Map<Long, ShareScope> out = new HashMap<>();
        for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, consultantIds)) {
            if (c.getMemberId() == null) out.put(c.getId(), ShareScope.FULL); // an org-managed profile has nobody to ask
            else {
                ShareScope s = shares.scopeOf(orgId, c.getMemberId());
                out.put(c.getId(), s == null ? ShareScope.NONE : s);
            }
        }
        return out;
    }

    // ---- filters, ordering ---------------------------------------------------------------------------------------------------

    private Predicate<Item> common(Query q, Names names) {
        String needle = q.q() == null || q.q().isBlank() ? null : q.q().strip().toLowerCase(Locale.ROOT);
        String status = q.status() == null || q.status().isBlank() ? null : q.status().strip().toUpperCase(Locale.ROOT);
        return i -> (q.consultantId() == null || q.consultantId().equals(i.consultantId()))
            && (q.clientId() == null || q.clientId().equals(i.clientId()))
            && (q.ownerId() == null || q.ownerId().equals(i.actorId()))
            && (status == null || status.equals(i.status()))
            && (needle == null || matches(i, needle, names));
    }

    private static boolean matches(Item i, String needle, Names n) {
        return contains(i.title(), needle) || contains(i.subtitle(), needle) || contains(i.tag(), needle) || contains(i.type().group.label, needle)
            || contains(n.consultantName(i.consultantId()), needle) || contains(n.clientName(i), needle) || contains(n.personName(i.actorId()), needle);
    }

    private static boolean contains(String hay, String needle) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needle);
    }

    static List<Item> sort(List<Item> rows, String sort) {
        boolean oldest = sort != null && sort.strip().toLowerCase(Locale.ROOT).startsWith("oldest");
        Comparator<Item> byTime = Comparator.comparing(Item::at).thenComparing(Item::id);
        List<Item> out = new ArrayList<>(rows);
        out.sort(oldest ? byTime : byTime.reversed());
        return out;
    }

    // ---- KPI tiles, summary ----------------------------------------------------------------------------------------------------

    /** Total + Resume Updates + New Submissions + Client Follow-ups + Interviews Coordinated. {@code inRange} counts; {@code allFiltered} (the whole fetch) feeds the weekly buckets. */
    private List<Kpi> kpis(List<Item> inRange, List<Item> allFiltered, Instant effEnd) {
        List<Kpi> out = new ArrayList<>();
        out.add(kpi("total", inRange, allFiltered, effEnd, null));
        out.add(kpi("resume", inRange, allFiltered, effEnd, Group.RESUME));
        out.add(kpi("submission", inRange, allFiltered, effEnd, Group.SUBMISSION));
        out.add(kpi("followup", inRange, allFiltered, effEnd, Group.FOLLOWUP));
        out.add(kpi("interview", inRange, allFiltered, effEnd, Group.INTERVIEW));
        return out;
    }

    private Kpi kpi(String key, List<Item> inRange, List<Item> allFiltered, Instant effEnd, Group g) {
        Predicate<Item> of = i -> g == null || i.type().group.summaryGroup() == g;
        long value = inRange.stream().filter(of).count();
        List<Long> spark = new ArrayList<>();
        for (int w = SPARK_WEEKS - 1; w >= 0; w--) {
            Instant to = effEnd.minus(7L * w, ChronoUnit.DAYS);
            Instant from = to.minus(7, ChronoUnit.DAYS);
            spark.add(allFiltered.stream().filter(of).filter(i -> within(i.at(), from, to)).count());
        }
        long last = spark.get(SPARK_WEEKS - 1);
        long prev = spark.get(SPARK_WEEKS - 2);
        return new Kpi(key, value, pct(last, prev), spark);
    }

    private Summary summary(List<Item> all, String key, Range r) {
        List<Item> in = all.stream().filter(i -> within(i.at(), r.from(), r.to())).toList();
        Map<Group, Long> counts = new LinkedHashMap<>();
        for (Item i : in) counts.merge(i.type().group.summaryGroup(), 1L, Long::sum);
        long total = in.size();
        List<SummaryRow> rows = new ArrayList<>();
        List<Group> order = new ArrayList<>(SUMMARY_ORDER);
        if (counts.getOrDefault(Group.OPPORTUNITY, 0L) > 0) order.add(Group.OPPORTUNITY);
        for (Group g : order) {
            long n = counts.getOrDefault(g, 0L);
            rows.add(new SummaryRow(g.name(), g.summaryLabel, n, total == 0 ? 0 : Math.round(n * 1000.0 / total) / 10.0));
        }
        return new Summary(key, r.fromDay(), r.toDay(), total, rows);
    }

    /** Percent change, null when there is no previous value to compare to. */
    static Double pct(long current, long previous) {
        return previous <= 0 ? null : Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    // ---- upcoming ----------------------------------------------------------------------------------------------------------------

    /** Open follow-ups (today and later, next {@value #UPCOMING_DAYS} days), SCHEDULED interviews and planned manual rows, soonest first. Overdue items are NOT upcoming. */
    private List<Upcoming> upcoming(MktScope.View v, Instant now) {
        Instant end = now.plus(UPCOMING_DAYS, ChronoUnit.DAYS);
        List<Upcoming> out = new ArrayList<>();
        List<MktFollowupDto.Row> due = new ArrayList<>(followups.today(v));
        due.addAll(followups.upcoming(v));
        for (MktFollowupDto.Row f : due) {
            if (f.dueAt() == null || f.dueAt().isBefore(now) || !f.dueAt().isBefore(end) || !v.sees(f.consultantId())) continue;
            String title = f.counterpart() == null || f.counterpart().isBlank() ? f.title() : f.title() + ": " + f.counterpart();
            out.add(new Upcoming("FOLLOWUP:" + f.id(), "FOLLOWUP", followupIcon(f.channel()), title, f.consultantName(), f.dueAt()));
        }
        List<Object[]> interviews = upcomingInterviews.upcoming(v.orgId(), v.all(), ids(v), now, end, PageRequest.of(0, UPCOMING_CAP));
        List<MktActivity> planned = manual.findPlanned(v.orgId(), v.all(), ids(v), now, end, PageRequest.of(0, UPCOMING_CAP));
        Set<Long> consultantIds = new LinkedHashSet<>();
        Set<Long> clientIds = new LinkedHashSet<>();
        for (Object[] r : interviews) {
            consultantIds.add((Long) r[2]);
            if (r[3] != null) clientIds.add((Long) r[3]);
        }
        for (MktActivity a : planned) consultantIds.add(a.getConsultantId());
        Map<Long, String> consultantNames = consultantNames(v.orgId(), consultantIds);
        Map<Long, String> clientNames = clientNames(v.orgId(), clientIds);
        for (Object[] r : interviews) {
            if (!v.sees((Long) r[2])) continue;
            String client = r[3] == null ? null : clientNames.get((Long) r[3]);
            String round = clean((String) r[4]);
            String title = "Interview" + (client == null ? "" : ": " + client) + (round == null ? "" : " (" + round + ")");
            out.add(new Upcoming("INTERVIEW:" + r[0], "INTERVIEW", "calendar", title, consultantNames.getOrDefault((Long) r[2], ""), (Instant) r[1]));
        }
        for (MktActivity a : planned) {
            Type t = Type.parse(a.getActivityType()).orElse(Type.APPLICATION_NOTE);
            out.add(new Upcoming("MANUAL:" + a.getId(), "MANUAL", t.group.icon, a.getTitle(), consultantNames.getOrDefault(a.getConsultantId(), ""), a.getOccurredAt()));
        }
        out.sort(Comparator.comparing(Upcoming::at).thenComparing(Upcoming::id));
        return out;
    }

    private static String followupIcon(String channel) {
        if (channel == null) return "calendar";
        return switch (channel) {
            case "PHONE" -> "phone";
            case "EMAIL" -> "mail";
            case "TEAMS", "CHAT" -> "message";
            default -> "calendar";
        };
    }

    // ---- names, options ----------------------------------------------------------------------------------------------------------

    /** Display names of everything the rows mention, resolved in bulk (org-scoped). */
    record Names(Map<Long, ConsultantProfile> consultants, Map<Long, ClientAccount> clients, Map<Long, Person> people) {
        String consultantName(Long id) {
            ConsultantProfile c = id == null ? null : consultants.get(id);
            return c == null ? null : c.getDisplayName();
        }

        String clientName(Item i) {
            ClientAccount c = i.clientId() == null ? null : clients.get(i.clientId());
            return c != null ? c.getName() : i.clientLabel();
        }

        String personName(Long id) {
            Person p = id == null ? null : people.get(id);
            return p == null ? null : p.name();
        }
    }

    private Names names(Long orgId, List<Item> items) {
        Set<Long> cons = new LinkedHashSet<>();
        Set<Long> cli = new LinkedHashSet<>();
        Set<Long> actors = new LinkedHashSet<>();
        for (Item i : items) {
            if (i.consultantId() != null) cons.add(i.consultantId());
            if (i.clientId() != null) cli.add(i.clientId());
            if (i.actorId() != null) actors.add(i.actorId());
        }
        Map<Long, ConsultantProfile> cm = new HashMap<>();
        if (!cons.isEmpty()) for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, cons)) cm.put(c.getId(), c);
        Map<Long, ClientAccount> am = new HashMap<>();
        if (!cli.isEmpty()) for (ClientAccount c : clients.findByOrgIdAndIdIn(orgId, cli)) am.put(c.getId(), c);
        return new Names(cm, am, people(orgId, actors));
    }

    private Map<Long, String> consultantNames(Long orgId, Collection<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        if (!ids.isEmpty()) for (ConsultantProfile c : consultants.findByOrgIdAndIdIn(orgId, ids)) out.put(c.getId(), c.getDisplayName());
        return out;
    }

    private Map<Long, String> clientNames(Long orgId, Collection<Long> ids) {
        Map<Long, String> out = new HashMap<>();
        if (!ids.isEmpty()) for (ClientAccount c : clients.findByOrgIdAndIdIn(orgId, ids)) out.put(c.getId(), c.getName());
        return out;
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

    private Row row(Item i, Names n) {
        ConsultantProfile c = i.consultantId() == null ? null : n.consultants().get(i.consultantId());
        Person actor = i.actorId() == null ? null : n.people().get(i.actorId());
        ClientAccount ca = i.clientId() == null ? null : n.clients().get(i.clientId());
        Client client = ca != null ? new Client(ca.getId(), ca.getName()) : i.clientLabel() != null && i.clientId() == null ? new Client(null, i.clientLabel()) : null;
        Group g = i.type().group;
        return new Row(
            i.id(), i.source(), i.type().name(), g.name(), g.label, i.title(), i.subtitle(), i.at(), actor, c == null ? null : new Person(c.getId(), c.getDisplayName(), null), client,
            i.tag(), i.status(), i.manual()
        );
    }

    private Options options(MktScope.View v, List<Item> inRange, Names n) {
        List<Option> cons = consultants.findVisible(v.orgId(), v.all(), ids(v), PageRequest.of(0, OPTION_CAP)).stream().map(c -> new Option(c.getId(), c.getDisplayName())).toList();
        List<Option> cli = clients.findAllByName(v.orgId(), PageRequest.of(0, OPTION_CAP)).stream().map(c -> new Option(c.getId(), c.getName())).toList();
        Map<Long, Option> owners = new LinkedHashMap<>();
        for (Item i : inRange) {
            Person p = i.actorId() == null ? null : n.people().get(i.actorId());
            if (p != null) owners.putIfAbsent(p.id(), new Option(p.id(), p.name()));
        }
        List<Option> ownerList = owners.values().stream().sorted(Comparator.comparing(Option::name, String.CASE_INSENSITIVE_ORDER)).toList();
        List<Choice> types = java.util.Arrays.stream(Group.values()).map(g -> new Choice(g.name(), g.label)).toList();
        List<Choice> manualTypes = Type.manualTypes().stream().map(t -> new Choice(t.name(), t.title)).toList();
        List<Choice> statuses = List.of(new Choice("COMPLETED", "Completed"), new Choice("SCHEDULED", "Scheduled"), new Choice("CANCELLED", "Cancelled"));
        return new Options(cons, cli, ownerList, types, manualTypes, statuses, SUMMARY_RANGES);
    }

    // ---- ranges and small helpers -----------------------------------------------------------------------------------------------

    /** The board's date range: yyyy-MM-dd (UTC, both ends inclusive); default the current UTC month. */
    static Range range(String from, String to, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate f = from == null || from.isBlank() ? today.withDayOfMonth(1) : day("from", from);
        LocalDate t = to == null || to.isBlank() ? (from == null || from.isBlank() ? today.withDayOfMonth(today.lengthOfMonth()) : f.withDayOfMonth(f.lengthOfMonth())) : day("to", to);
        if (t.isBefore(f)) throw OrgException.invalid("to", "must not be before from");
        if (ChronoUnit.DAYS.between(f, t) >= MAX_SPAN_DAYS) throw OrgException.invalid("to", "the range can span at most " + MAX_SPAN_DAYS + " days");
        return new Range(f.atStartOfDay().toInstant(ZoneOffset.UTC), t.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC), f.toString(), t.toString());
    }

    private static LocalDate day(String field, String raw) {
        try {
            return LocalDate.parse(raw.strip());
        } catch (DateTimeParseException e) {
            throw OrgException.invalid(field, "must be a date (yyyy-MM-dd)");
        }
    }

    static String summaryRangeKey(String raw) {
        if (raw == null || raw.isBlank()) return "THIS_MONTH";
        String k = raw.strip().toUpperCase(Locale.ROOT);
        return SUMMARY_RANGES.stream().anyMatch(c -> c.key().equals(k)) ? k : "THIS_MONTH";
    }

    static Range summaryRange(String key, Instant now) {
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        LocalDate f;
        LocalDate t;
        switch (key) {
            case "LAST_MONTH" -> {
                f = today.withDayOfMonth(1).minusMonths(1);
                t = f.withDayOfMonth(f.lengthOfMonth());
            }
            case "LAST_7_DAYS" -> {
                f = today.minusDays(6);
                t = today;
            }
            case "LAST_30_DAYS" -> {
                f = today.minusDays(29);
                t = today;
            }
            default -> {
                f = today.withDayOfMonth(1);
                t = today.withDayOfMonth(today.lengthOfMonth());
            }
        }
        return new Range(f.atStartOfDay().toInstant(ZoneOffset.UTC), t.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC), f.toString(), t.toString());
    }

    private static boolean within(Instant at, Instant from, Instant to) {
        return at != null && !at.isBefore(from) && at.isBefore(to);
    }

    private static Instant min(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    private static Instant max(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    private static int size(int size) {
        return size <= 0 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
    }

    private static Collection<Long> ids(MktScope.View v) {
        return v.all() || v.consultantIds().isEmpty() ? NO_IDS : v.consultantIds();
    }

    private static String clean(String s) {
        if (s == null) return null;
        String t = s.strip();
        return t.isEmpty() ? null : (t.length() > 120 ? t.substring(0, 117) + "..." : t);
    }

    /** "phrase - context" when there is a context (job title, follow-up title), else the phrase. */
    private static String with(String phrase, String context) {
        String c = clean(context);
        return c == null ? phrase : phrase + " - " + c;
    }

    private static String firstTag(String csv) {
        if (csv == null) return null;
        for (String t : csv.split(",")) if (!t.isBlank()) return t.strip();
        return null;
    }

    /** At most 5 short labels, comma separated; each is plain text and PII-scanned. */
    static String tags(String raw) {
        if (raw == null || raw.isBlank()) return null;
        List<String> out = new ArrayList<>();
        for (String part : raw.split(",")) {
            String t = part.strip().replaceAll("\\s+", " ");
            if (t.isEmpty()) continue;
            if (t.length() > 24) throw OrgException.invalid("tags", "each tag is at most 24 characters");
            if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid("tags", "contains characters that are not allowed");
            SensitiveContent.check("tags", "tags", t);
            if (!out.contains(t)) out.add(t);
        }
        if (out.size() > 5) throw OrgException.invalid("tags", "at most 5 tags");
        return out.isEmpty() ? null : String.join(",", out);
    }

    /** Free text: trimmed, no control characters or angle brackets, length-capped, never a sensitive identifier. */
    static String text(String field, String raw, int max, boolean required) {
        String t = raw == null ? "" : raw.strip().replaceAll("\\s+", " ");
        if (t.isEmpty()) {
            if (required) throw OrgException.invalid(field, "is required");
            return null;
        }
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl) || t.indexOf('<') >= 0 || t.indexOf('>') >= 0) throw OrgException.invalid(field, "contains characters that are not allowed");
        SensitiveContent.check(field, field, t);
        return t;
    }

    private static String oneOf(String field, String raw, List<String> allowed) {
        String v = raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
        if (!allowed.contains(v)) throw OrgException.invalid(field, "must be one of " + String.join(", ", allowed));
        return v;
    }
}
