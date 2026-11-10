package com.dossier.api.service.ent.mkt.home;

import com.dossier.api.repository.ent.mkt.MktHomeInterviewEventRepository;
import com.dossier.api.repository.ent.mkt.MktHomeInterviewRepository;
import com.dossier.api.repository.ent.mkt.MktHomeMatchRepository;
import com.dossier.api.repository.ent.mkt.MktHomeRequirementRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsDTO;
import com.dossier.api.service.ent.mkt.applications.MktApplicationsService;
import com.dossier.api.service.ent.mkt.followups.MktFollowupDto;
import com.dossier.api.service.ent.mkt.followups.MktFollowupService;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Activity;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Chip;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Interview;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Kpi;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Opening;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Pipeline;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.ResumeChip;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Stage;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Stream;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Talent;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.Task;
import com.dossier.api.service.ent.mkt.home.MktHomeDto.View;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsDto;
import com.dossier.api.service.ent.mkt.interviews.MktInterviewsService;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto;
import com.dossier.api.service.ent.mkt.matches.MktMatchesService;
import com.dossier.api.service.ent.mkt.resumes.MktResumesDto;
import com.dossier.api.service.ent.mkt.resumes.MktResumesService;
import com.dossier.api.service.ent.mkt.streams.MktStreamsDto;
import com.dossier.api.service.ent.mkt.streams.MktStreamsService;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsDto;
import com.dossier.api.service.ent.mkt.submissions.MktSubmissionsService;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos;
import com.dossier.api.service.ent.mkt.talent.MktTalentService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
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
import java.util.Optional;
import java.util.Set;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The Marketing Home board in one call. It owns no formulas of its own where a sibling page already has one: every card is drawn from the SAME service
 * as its page (Talent, Matches, Submissions, Interviews, Follow-ups, Applications, Streams, Resumes), so Home numbers equal the pages' numbers.
 *
 * <p>Access: the endpoint needs {@code consultants.view} (ASSIGNED scope: only the caller's consultants). Each section additionally needs the key of its source page;
 * a caller who lacks it gets that section empty (the sibling answers 404, which is caught here), never a number they could not see on the page. Every row that
 * names a consultant is filtered again with {@code view.sees(...)}. Only a few small reads are Home's own ({@code MktHome*Repository}): suggested-match counts,
 * job locations, the upcoming-interview window counts and interview events.
 *
 * <p>Definitions: Assigned = Talent page tile; Profiles Ready = assigned minus resumes needing an update (delta against four weeks ago, read from the weekly series);
 * New Job Matches = Matches page "matched" tile; Pending Submissions = Submissions page pending-approval tile; Upcoming Interviews = live interviews starting in
 * the next 7 days (delta against the 7 days before); Overdue Follow-ups = Follow-ups page "overdue" tile. Pipeline = Applications funnel (3 months) read
 * positionally as Review, Submitted, Interviewing, Offer, Placed; its delta compares the 3-month total with the 3 months before it. E1: read-only.
 */
@Service
public class MktHomeService {

    public static final String PERMISSION = "consultants.view";
    static final int TALENT_ROWS = 5;
    static final int STREAM_ROWS = 5;
    static final int OPENING_ROWS = 5;
    static final int TASK_ROWS = 5;
    static final int INTERVIEW_ROWS = 4;
    static final int ACTIVITY_ROWS = 5;
    static final String[] STAGE_KEYS = { "review", "submitted", "interviewing", "offer", "placed" };
    static final String[] STAGE_LABELS = { "Review", "Submitted", "Interviewing", "Offer", "Placed" };
    private static final List<Long> NO_IDS = List.of(-1L);
    private static final int WEEKS = 8;

    private final MktScope scope;
    private final MktTalentService talent;
    private final MktMatchesService matches;
    private final MktSubmissionsService submissions;
    private final MktInterviewsService interviews;
    private final MktFollowupService followups;
    private final MktApplicationsService applications;
    private final MktStreamsService streams;
    private final MktResumesService resumes;
    private final MktHomeInterviewRepository interviewCounts;
    private final MktHomeMatchRepository matchCounts;
    private final MktHomeRequirementRepository requirements;
    private final MktHomeInterviewEventRepository interviewEvents;
    private final Clock clock;

    @Autowired
    public MktHomeService(
        MktScope scope, MktTalentService talent, MktMatchesService matches, MktSubmissionsService submissions, MktInterviewsService interviews,
        MktFollowupService followups, MktApplicationsService applications, MktStreamsService streams, MktResumesService resumes,
        MktHomeInterviewRepository interviewCounts, MktHomeMatchRepository matchCounts, MktHomeRequirementRepository requirements,
        MktHomeInterviewEventRepository interviewEvents
    ) {
        this(scope, talent, matches, submissions, interviews, followups, applications, streams, resumes, interviewCounts, matchCounts, requirements, interviewEvents, Clock.systemUTC());
    }

    MktHomeService(
        MktScope scope, MktTalentService talent, MktMatchesService matches, MktSubmissionsService submissions, MktInterviewsService interviews,
        MktFollowupService followups, MktApplicationsService applications, MktStreamsService streams, MktResumesService resumes,
        MktHomeInterviewRepository interviewCounts, MktHomeMatchRepository matchCounts, MktHomeRequirementRepository requirements,
        MktHomeInterviewEventRepository interviewEvents, Clock clock
    ) {
        this.scope = scope;
        this.talent = talent;
        this.matches = matches;
        this.submissions = submissions;
        this.interviews = interviews;
        this.followups = followups;
        this.applications = applications;
        this.streams = streams;
        this.resumes = resumes;
        this.interviewCounts = interviewCounts;
        this.matchCounts = matchCounts;
        this.requirements = requirements;
        this.interviewEvents = interviewEvents;
        this.clock = clock;
    }

    @Transactional
    public View home(OrgMembership me) {
        MktScope.View v = scope.resolve(me, PERMISSION);
        Instant now = clock.instant();

        MktTalentDtos.Response t = talent.list(me, new MktTalentService.ListQuery(null, null, null, null, null, null, null, 0, TALENT_ROWS));
        Optional<MktFollowupDto.View> fu = guarded(() -> followups.view(me, MktFollowupDto.Window.THIS_WEEK, MktFollowupService.MAX_SIZE, null));
        Optional<MktMatchesDto.Response> mt = guarded(() -> matches.list(me, new MktMatchesService.Query(0, 100, null, null, null, null, null, "-score", null)));
        Optional<MktSubmissionsDto.BoardResponse> sb = guarded(() -> submissions.board(me, new MktSubmissionsDto.Query(null, null, null, null, null, null, null, null, null, 0, 1)));
        Optional<MktInterviewsDto.Overview> iv = guarded(() -> interviews.overview(me, new MktInterviewsDto.Query(null, null, null, null, null, null, null, 0, 0, 0)));
        Optional<MktStreamsDto.View> st = guarded(() -> streams.get(me, new MktStreamsService.Query(null, null, null, null, false, 0, STREAM_ROWS, null, 7)));
        Optional<MktResumesDto.Page> rs = guarded(() -> resumes.list(me, new MktResumesDto.Query(null, null, null, null, null, null, 0, 1)));
        Optional<MktApplicationsDTO.Response> quarter = guarded(() -> applications.get(me, appsQuery("3m")));
        Optional<MktApplicationsDTO.Response> half = quarter.isPresent() ? guarded(() -> applications.get(me, appsQuery("6m"))) : Optional.empty();

        List<Talent> talentRows = talentRows(v, t, fu, now);
        return new View(
            kpis(v, t, mt, sb, iv, fu, now), talentRows, streamRows(st), openings(v, mt), pipeline(quarter, half), tasks(v, fu), interviewRows(v, iv),
            activity(v, quarter, rs, now)
        );
    }

    private static MktApplicationsDTO.Query appsQuery(String funnelPeriod) {
        return new MktApplicationsDTO.Query(null, null, null, null, null, funnelPeriod, null, 0, 1);
    }

    /** A source the caller may not read (its page answers 404) is simply absent. */
    private static <T> Optional<T> guarded(Supplier<T> call) {
        try {
            return Optional.ofNullable(call.get());
        } catch (OrgNotFoundException e) {
            return Optional.empty();
        }
    }

    // ---- KPI tiles -------------------------------------------------------------------------------------------------------

    private List<Kpi> kpis(
        MktScope.View v, MktTalentDtos.Response t, Optional<MktMatchesDto.Response> mt, Optional<MktSubmissionsDto.BoardResponse> sb,
        Optional<MktInterviewsDto.Overview> iv, Optional<MktFollowupDto.View> fu, Instant now
    ) {
        MktTalentDtos.Kpi assigned = talentKpi(t, "assigned");
        MktTalentDtos.Kpi needs = talentKpi(t, "needUpdates");
        Kpi assignedKpi = assigned == null ? empty("assigned") : new Kpi("assigned", assigned.value(), assigned.deltaPct(), assigned.sparkline());

        Kpi ready = empty("profilesReady");
        if (assigned != null) {
            long needing = needs == null ? 0 : needs.value();
            List<Long> spark = new ArrayList<>();
            for (int i = 0; i < assigned.sparkline().size(); i++) {
                long n = needs == null || i >= needs.sparkline().size() ? 0 : needs.sparkline().get(i);
                spark.add(Math.max(0, assigned.sparkline().get(i) - n));
            }
            long value = Math.max(0, assigned.value() - needing);
            Double delta = spark.size() >= 5 ? pct(value, spark.get(spark.size() - 5)) : null;
            ready = new Kpi("profilesReady", value, delta, spark);
        }

        Kpi newMatches = mt.flatMap(m -> m.kpis().stream().filter(k -> "matched".equals(k.key())).findFirst())
            .map(k -> new Kpi("newMatches", k.value(), k.deltaPct(), k.sparkline())).orElse(empty("newMatches"));
        Kpi pending = sb.map(b -> new Kpi("pendingSubmissions", b.kpis().pendingApprovals().value(), b.kpis().pendingApprovals().deltaPct(), b.kpis().pendingApprovals().sparkline()))
            .orElse(empty("pendingSubmissions"));
        Kpi upcoming = iv.isPresent() ? upcomingInterviews(v, now) : empty("upcomingInterviews");
        Kpi overdue = fu.flatMap(f -> f.kpis().stream().filter(k -> "overdue".equals(k.key())).findFirst())
            .map(k -> new Kpi("overdueFollowups", k.value(), k.deltaPct(), k.sparkline())).orElse(empty("overdueFollowups"));
        return List.of(assignedKpi, ready, newMatches, pending, upcoming, overdue);
    }

    private static MktTalentDtos.Kpi talentKpi(MktTalentDtos.Response t, String key) {
        return t.kpis().stream().filter(k -> key.equals(k.key())).findFirst().orElse(null);
    }

    private static Kpi empty(String key) {
        return new Kpi(key, 0, null, List.of());
    }

    /** Live interviews starting in the next 7 days; eight weekly points ending with that window; delta against the 7 days before it. */
    private Kpi upcomingInterviews(MktScope.View v, Instant now) {
        List<Long> spark = new ArrayList<>(WEEKS);
        Instant horizon = now.plus(Duration.ofDays(7));
        for (int i = 0; i < WEEKS; i++) {
            Instant to = horizon.minus(Duration.ofDays(7L * (WEEKS - 1 - i)));
            Instant from = i == WEEKS - 1 ? now : to.minus(Duration.ofDays(7));
            spark.add(interviewCounts.countLiveBetween(v.orgId(), v.all(), ids(v), from, to));
        }
        long value = spark.get(WEEKS - 1);
        long before = interviewCounts.countLiveBetween(v.orgId(), v.all(), ids(v), now.minus(Duration.ofDays(7)), now);
        return new Kpi("upcomingInterviews", value, pct(value, before), spark);
    }

    static Double pct(long current, long previous) {
        return previous <= 0 ? null : Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    // ---- My Assigned Talent ------------------------------------------------------------------------------------------------

    private List<Talent> talentRows(MktScope.View v, MktTalentDtos.Response t, Optional<MktFollowupDto.View> fu, Instant now) {
        List<MktTalentDtos.Row> rows = t.items().stream().filter(r -> v.sees(r.id())).limit(TALENT_ROWS).toList();
        if (rows.isEmpty()) return List.of();
        List<Long> ids = rows.stream().map(MktTalentDtos.Row::id).toList();
        Map<Long, Integer> suggested = new HashMap<>();
        for (Object[] r : matchCounts.countSuggestedByConsultant(v.orgId(), ids)) suggested.put((Long) r[0], ((Number) r[1]).intValue());
        Set<Long> interviewing = new HashSet<>(interviewCounts.findConsultantIdsWithUpcoming(v.orgId(), v.all(), ids, now));
        Set<Long> due = new HashSet<>();
        fu.ifPresent(f -> {
            for (MktFollowupDto.Row r : f.today().items()) due.add(r.consultantId());
            for (MktFollowupDto.Row r : f.overdue().items()) due.add(r.consultantId());
        });
        List<Talent> out = new ArrayList<>();
        for (MktTalentDtos.Row r : rows) {
            boolean needsUpdate = "NEEDS_UPDATE".equals(r.resume().state());
            Chip next = MktHomeNextAction.of(new MktHomeNextAction.Facts(
                needsUpdate, "AVAILABLE_NOW".equals(r.availability().code()), r.assignedJobs(), suggested.getOrDefault(r.id(), 0), interviewing.contains(r.id()), due.contains(r.id())
            ));
            out.add(new Talent(
                r.id(), r.name(), r.avatarUrl(), r.primarySkill() == null ? "" : r.primarySkill(), new Chip(r.availability().label(), tone(r.availability().tone())),
                new ResumeChip(needsUpdate ? "Needs Update" : "Updated", needsUpdate ? "NEEDS_UPDATE" : "UPDATED"), r.activeApps(), next
            ));
        }
        return out;
    }

    /** The Talent page's tones are green, blue, violet, amber, grey; the board has no grey, so it reads as the neutral blue. */
    private static String tone(String t) {
        return "grey".equals(t) || t == null ? "blue" : t;
    }

    // ---- Job Stream Monitor ------------------------------------------------------------------------------------------------

    private List<Stream> streamRows(Optional<MktStreamsDto.View> st) {
        return st.map(s -> s.streams().items().stream().limit(STREAM_ROWS).map(r -> new Stream(r.sourceLabel(), title(r.status()), r.newOpenings(), r.lastSyncAt())).toList()).orElse(List.of());
    }

    static String title(String s) {
        if (s == null || s.isBlank()) return "";
        StringBuilder out = new StringBuilder();
        for (String w : s.strip().toLowerCase(Locale.ROOT).split("[_ ]+")) {
            if (w.isEmpty()) continue;
            if (out.length() > 0) out.append(' ');
            out.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return out.toString();
    }

    // ---- Top Openings -------------------------------------------------------------------------------------------------------

    /** Highest SUGGESTED match per job among the caller's consultants (a job appears once), best first. */
    private List<Opening> openings(MktScope.View v, Optional<MktMatchesDto.Response> mt) {
        if (mt.isEmpty()) return List.of();
        Map<Long, MktMatchesDto.Row> best = new LinkedHashMap<>();
        mt.get().items().stream()
            .filter(r -> "SUGGESTED".equals(r.status()) && v.sees(r.consultantId()))
            .sorted(Comparator.comparingInt(MktMatchesDto.Row::score).reversed().thenComparing(MktMatchesDto.Row::id))
            .forEach(r -> best.putIfAbsent(r.requirementId(), r));
        List<MktMatchesDto.Row> top = best.values().stream().limit(OPENING_ROWS).toList();
        if (top.isEmpty()) return List.of();
        Map<Long, String> where = new HashMap<>();
        for (Object[] r : requirements.findLocations(v.orgId(), top.stream().map(MktMatchesDto.Row::requirementId).toList())) where.put((Long) r[0], (String) r[1]);
        return top.stream().map(r -> new Opening(r.id(), r.jobTitle(), r.client(), where.getOrDefault(r.requirementId(), ""), r.score())).toList();
    }

    // ---- Submission Pipeline ------------------------------------------------------------------------------------------------

    private Pipeline pipeline(Optional<MktApplicationsDTO.Response> quarter, Optional<MktApplicationsDTO.Response> half) {
        if (quarter.isEmpty() || quarter.get().funnel() == null || quarter.get().funnel().total() <= 0) return null;
        MktApplicationsDTO.Funnel f = quarter.get().funnel();
        List<Stage> stages = new ArrayList<>();
        for (int i = 0; i < STAGE_KEYS.length && i < f.stages().size(); i++) {
            MktApplicationsDTO.FunnelStageRow s = f.stages().get(i);
            stages.add(new Stage(STAGE_KEYS[i], STAGE_LABELS[i], s.count(), s.pct()));
        }
        Double delta = null;
        if (half.isPresent() && half.get().funnel() != null) delta = pct(f.total(), half.get().funnel().total() - f.total());
        return new Pipeline(f.total(), delta, stages);
    }

    // ---- Today's follow-ups and tasks ---------------------------------------------------------------------------------------

    private List<Task> tasks(MktScope.View v, Optional<MktFollowupDto.View> fu) {
        return fu.map(f -> f.today().items().stream().filter(r -> v.sees(r.consultantId())).limit(TASK_ROWS)
            .map(r -> new Task(r.id(), r.title(), r.detail() == null || r.detail().isBlank() ? r.consultantName() : r.detail(), r.dueAt(), kind(r.channel()), "COMPLETED".equals(r.status()))).toList())
            .orElse(List.of());
    }

    static String kind(String channel) {
        if (channel == null) return "NOTE";
        return switch (channel) {
            case "PHONE" -> "CALL";
            case "EMAIL" -> "EMAIL";
            case "CHAT", "TEAMS" -> "CHAT";
            default -> "NOTE";
        };
    }

    // ---- Upcoming interviews ------------------------------------------------------------------------------------------------

    private List<Interview> interviewRows(MktScope.View v, Optional<MktInterviewsDto.Overview> iv) {
        return iv.map(o -> o.upcoming().stream().filter(r -> v.sees(r.consultantId())).limit(INTERVIEW_ROWS)
            .map(r -> new Interview(r.id(), r.startsAt(), r.consultant(), r.avatarUrl(), r.role() == null ? "" : r.role(), r.client() == null ? "" : r.client(),
                r.round() != null && !r.round().isBlank() ? r.round() : title(r.type()), title(r.status()))).toList())
            .orElse(List.of());
    }

    // ---- Recent activity -----------------------------------------------------------------------------------------------------

    private List<Activity> activity(MktScope.View v, Optional<MktApplicationsDTO.Response> apps, Optional<MktResumesDto.Page> rs, Instant now) {
        List<Activity> all = new ArrayList<>();
        apps.ifPresent(a -> {
            for (MktApplicationsDTO.Update u : a.updates()) {
                if (u.consultant() != null && !v.sees(u.consultant().id())) continue;
                all.add(new Activity(u.id() * 3, u.consultant() == null ? "" : u.consultant().name(), null, u.text(), u.detail(), u.at()));
            }
        });
        rs.ifPresent(r -> {
            for (MktResumesDto.Activity a : r.activity()) {
                if (!v.sees(a.consultantId())) continue;
                all.add(new Activity(a.id() * 3 + 1, a.consultantName(), a.avatarUrl(), a.text(), null, a.at()));
            }
        });
        for (Object[] e : interviewEvents.findRecent(v.orgId(), v.all(), ids(v), PageRequest.of(0, ACTIVITY_ROWS))) {
            if (!v.sees((Long) e[4])) continue;
            all.add(new Activity((Long) e[0] * 3 + 2, (String) e[5], null, interviewText((String) e[1]), (String) e[2], (Instant) e[3]));
        }
        all.sort(Comparator.comparing(Activity::at, Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(Activity::id));
        return all.stream().limit(ACTIVITY_ROWS).toList();
    }

    static String interviewText(String kind) {
        if (kind == null) return "interview updated";
        return switch (kind) {
            case "SLOT_CONFIRMED" -> "interview confirmed";
            case "RESCHEDULE_PROPOSED" -> "interview reschedule proposed";
            case "FEEDBACK_RECORDED" -> "interview feedback recorded";
            case "REMINDER_REQUESTED" -> "interview reminder requested";
            default -> "interview updated";
        };
    }

    private static Collection<Long> ids(MktScope.View v) {
        return v.all() || v.consultantIds().isEmpty() ? NO_IDS : v.consultantIds();
    }
}
