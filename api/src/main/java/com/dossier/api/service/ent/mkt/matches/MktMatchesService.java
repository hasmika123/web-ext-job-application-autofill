package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.mkt.MktMatchApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktMatchClientRepository;
import com.dossier.api.repository.ent.mkt.MktMatchConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktMatchRepository;
import com.dossier.api.repository.ent.mkt.MktMatchRequirementRepository;
import com.dossier.api.repository.ent.mkt.MktMatchResumeRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.MktScope.View;
import com.dossier.api.service.ent.mkt.matches.MktMatchRules.ClientHistory;
import com.dossier.api.service.ent.mkt.matches.MktMatchRules.Fit;
import com.dossier.api.service.ent.mkt.matches.MktMatchRules.ResumeNeed;
import com.dossier.api.service.ent.mkt.matches.MktMatchRules.SkillOverlap;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Availability;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Compare;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Detail;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Filters;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Insight;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Job;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Kpi;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Option;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Person;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Response;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.ResumeUpdate;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Row;
import com.dossier.api.service.ent.mkt.matches.MktMatchesDto.Tick;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
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
import java.util.TreeSet;
import java.util.function.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Job Matches (Marketing workspace): the marketer's view of consultant-to-job matches ({@code requirement_match}) for the consultants
 * they are assigned to. Formulas are in {@link MktMatchRules}. Everything is filtered by the caller's {@link View}; a consultant outside it
 * is the generic 404. E1: <b>Assign</b> only records that the marketer put the match forward ({@code ASSIGNED}, who and when, one audit row);
 * it never submits anything for a consultant. Dismiss records that a suggestion was rejected.
 */
@Service
public class MktMatchesService {

    /** Page gate: run matches. */
    public static final String PAGE_KEY = "matches.run";
    /** Write gate of Assign: put an opportunity forward for a consultant. */
    public static final String ASSIGN_KEY = "opportunities.manage";

    /** Request parameters of the list; {@code score} is {@code high} (>= 85), {@code mid} (70-84) or {@code low} (< 70). */
    public record Query(int page, int size, String q, Long consultantId, String skill, Long clientId, String score, String sort, Long selected) {}

    private static final List<String> LIVE = List.of("SUGGESTED", "ASSIGNED");

    private final MktScope scope;
    private final MktMatchRepository matches;
    private final MktMatchConsultantRepository consultants;
    private final MktMatchRequirementRepository requirements;
    private final MktMatchClientRepository clients;
    private final MktMatchResumeRepository resumes;
    private final MktMatchApplicationRepository applications;
    private final ConsultantSkillRepository consultantSkills;
    private final RequirementSkillRepository requirementSkills;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public MktMatchesService(
        MktScope scope,
        MktMatchRepository matches,
        MktMatchConsultantRepository consultants,
        MktMatchRequirementRepository requirements,
        MktMatchClientRepository clients,
        MktMatchResumeRepository resumes,
        MktMatchApplicationRepository applications,
        ConsultantSkillRepository consultantSkills,
        RequirementSkillRepository requirementSkills,
        OrgAuditService audit
    ) {
        this(scope, matches, consultants, requirements, clients, resumes, applications, consultantSkills, requirementSkills, audit, Clock.systemUTC());
    }

    MktMatchesService(
        MktScope scope,
        MktMatchRepository matches,
        MktMatchConsultantRepository consultants,
        MktMatchRequirementRepository requirements,
        MktMatchClientRepository clients,
        MktMatchResumeRepository resumes,
        MktMatchApplicationRepository applications,
        ConsultantSkillRepository consultantSkills,
        RequirementSkillRepository requirementSkills,
        OrgAuditService audit,
        Clock clock
    ) {
        this.scope = scope;
        this.matches = matches;
        this.consultants = consultants;
        this.requirements = requirements;
        this.clients = clients;
        this.resumes = resumes;
        this.applications = applications;
        this.consultantSkills = consultantSkills;
        this.requirementSkills = requirementSkills;
        this.audit = audit;
        this.clock = clock;
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public Response list(OrgMembership me, Query q) {
        View view = scope.resolve(me, PAGE_KEY);
        Instant now = clock.instant();
        Long orgId = me.orgId();
        List<RequirementMatch> live = matches.findLive(orgId, LIVE).stream().filter(m -> view.sees(m.getConsultantId())).toList();
        Ctx ctx = load(orgId, live);
        Map<Long, RequirementMatch> byId = new HashMap<>();
        List<Row> all = new ArrayList<>();
        for (RequirementMatch m : live) {
            Row r = row(m, ctx, now);
            if (r != null) {
                all.add(r);
                byId.put(m.getId(), m);
            }
        }

        List<Row> filtered = all.stream().filter(filter(q)).sorted(comparator(q.sort())).toList();
        int size = Math.max(1, Math.min(MktMatchRules.MAX_PAGE_SIZE, q.size() <= 0 ? MktMatchRules.DEFAULT_PAGE_SIZE : q.size()));
        int page = Math.max(0, q.page());
        int from = (int) Math.min((long) page * size, filtered.size());
        List<Row> items = filtered.subList(from, Math.min(from + size, filtered.size()));

        List<Row> top = all.stream().filter(r -> "SUGGESTED".equals(r.status())).sorted(comparator("-score")).limit(MktMatchRules.TOP_TODAY).toList();

        Row selected = null;
        if (q.selected() != null) selected = all.stream().filter(r -> r.id().equals(q.selected())).findFirst().orElse(null);
        if (selected == null && !items.isEmpty()) selected = items.get(0);
        Detail explanation = selected == null ? null : detail(byId.get(selected.id()), selected, ctx, now);

        return new Response(kpis(all, now), filters(all), items, filtered.size(), page, size, top, explanation, MktMatchRules.HIGH_CONFIDENCE_MIN, MktMatchRules.STALE_DAYS);
    }

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long matchId) {
        View view = scope.resolve(me, PAGE_KEY);
        return detailOf(me.orgId(), view, matchId);
    }

    @Transactional(readOnly = true)
    public Compare compare(OrgMembership me, Long a, Long b) {
        View view = scope.resolve(me, PAGE_KEY);
        if (a == null || b == null || a.equals(b)) throw OrgException.invalid("b", "pick two different matches");
        return new Compare(detailOf(me.orgId(), view, a), detailOf(me.orgId(), view, b));
    }

    private Detail detailOf(Long orgId, View view, Long matchId) {
        RequirementMatch m = matches.findByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, m.getConsultantId());
        Ctx ctx = load(orgId, List.of(m));
        Instant now = clock.instant();
        Row r = row(m, ctx, now);
        if (r == null) throw new OrgNotFoundException();
        return detail(m, r, ctx, now);
    }

    // --------------------------------------------------------------- writes (records only, E1)

    /** SUGGESTED to ASSIGNED: the marketer puts this consultant forward for the job. Idempotent for an already ASSIGNED match. */
    @Transactional
    public Row assign(OrgMembership me, Long matchId) {
        View page = scope.resolve(me, PAGE_KEY);
        View write = scope.resolve(me, ASSIGN_KEY);
        RequirementMatch m = matches.findByOrgIdAndId(me.orgId(), matchId).orElseThrow(OrgNotFoundException::new);
        scope.require(page, m.getConsultantId());
        scope.require(write, m.getConsultantId());
        if ("ASSIGNED".equals(m.getStatus())) return rowOf(me.orgId(), m);
        if (!"SUGGESTED".equals(m.getStatus())) throw conflict("MATCH_STATE", "Only a suggested match can be assigned", m.getStatus());
        ClientRequirement req = requirements.findByOrgIdAndId(me.orgId(), m.getRequirementId()).orElseThrow(OrgNotFoundException::new);
        if (!"OPEN".equals(req.getStatus())) throw conflict("REQUIREMENT_CLOSED", "This job is no longer open", req.getStatus());
        m.setStatus("ASSIGNED");
        m.setAssignedByMemberId(me.memberId());
        m.setAssignedAt(clock.instant());
        matches.save(m);
        audit.record(me, "MKT_MATCH_ASSIGN", "MATCH", null, String.valueOf(m.getId()), "consultantId=" + m.getConsultantId() + ";requirementId=" + m.getRequirementId() + ";score=" + m.getScore());
        return rowOf(me.orgId(), m);
    }

    /** SUGGESTED to DISMISSED (the suggestion is not a fit). Idempotent for a dismissed match; an assigned one stays assigned. */
    @Transactional
    public Row dismiss(OrgMembership me, Long matchId) {
        View page = scope.resolve(me, PAGE_KEY);
        RequirementMatch m = matches.findByOrgIdAndId(me.orgId(), matchId).orElseThrow(OrgNotFoundException::new);
        scope.require(page, m.getConsultantId());
        if ("DISMISSED".equals(m.getStatus())) return rowOf(me.orgId(), m);
        if (!"SUGGESTED".equals(m.getStatus())) throw conflict("MATCH_STATE", "Only a suggested match can be dismissed", m.getStatus());
        m.setStatus("DISMISSED");
        matches.save(m);
        audit.record(me, "MKT_MATCH_DISMISS", "MATCH", null, String.valueOf(m.getId()), "consultantId=" + m.getConsultantId() + ";requirementId=" + m.getRequirementId());
        return rowOf(me.orgId(), m);
    }

    private static OrgException conflict(String code, String message, String status) {
        return new OrgException(409, code, message, Map.of("status", status == null ? "" : status));
    }

    private Row rowOf(Long orgId, RequirementMatch m) {
        Row r = row(m, load(orgId, List.of(m)), clock.instant());
        if (r == null) throw new OrgNotFoundException();
        return r;
    }

    // ----------------------------------------------------------- data loading

    private record Ctx(
        Map<Long, ConsultantProfile> consultants,
        Map<Long, ClientRequirement> requirements,
        Map<Long, ClientAccount> clients,
        Map<Long, List<String>> consultantSkills,
        Map<Long, String> primarySkill,
        Map<Long, List<String>> requirementSkills,
        Map<Long, List<OrgResume>> resumes,
        Map<Long, List<TalentApplication>> applications
    ) {}

    private Ctx load(Long orgId, Collection<RequirementMatch> ms) {
        Set<Long> consultantIds = new HashSet<>();
        Set<Long> reqIds = new HashSet<>();
        for (RequirementMatch m : ms) {
            consultantIds.add(m.getConsultantId());
            reqIds.add(m.getRequirementId());
        }
        Map<Long, ConsultantProfile> cs = new HashMap<>();
        Map<Long, ClientRequirement> rs = new HashMap<>();
        Map<Long, ClientAccount> cl = new HashMap<>();
        Map<Long, List<String>> cSkills = new HashMap<>();
        Map<Long, String> primary = new HashMap<>();
        Map<Long, List<String>> rSkills = new HashMap<>();
        Map<Long, List<OrgResume>> rv = new HashMap<>();
        Map<Long, List<TalentApplication>> apps = new HashMap<>();
        if (!ms.isEmpty()) {
            consultants.findByOrgIdAndIdIn(orgId, consultantIds).forEach(c -> cs.put(c.getId(), c));
            requirements.findByOrgIdAndIdIn(orgId, reqIds).forEach(r -> rs.put(r.getId(), r));
            Set<Long> clientIds = new HashSet<>();
            rs.values().forEach(r -> clientIds.add(r.getClientId()));
            if (!clientIds.isEmpty()) clients.findByOrgIdAndIdIn(orgId, clientIds).forEach(c -> cl.put(c.getId(), c));
            List<ConsultantSkill> skills = new ArrayList<>(consultantSkills.findByOrgIdAndConsultantIdIn(orgId, consultantIds));
            skills.sort(Comparator.comparing((ConsultantSkill s) -> !s.isPrimarySkill()).thenComparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()));
            for (ConsultantSkill s : skills) {
                cSkills.computeIfAbsent(s.getConsultantId(), k -> new ArrayList<>()).add(s.getSkill());
                primary.putIfAbsent(s.getConsultantId(), s.getSkill());
            }
            List<RequirementSkill> rsk = new ArrayList<>(requirementSkills.findByOrgIdAndRequirementIdIn(orgId, reqIds));
            rsk.sort(Comparator.comparing(s -> s.getSortOrder() == null ? 0 : s.getSortOrder()));
            for (RequirementSkill s : rsk) rSkills.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s.getSkill());
            resumes.findByOrgIdAndConsultantIdIn(orgId, consultantIds).forEach(r -> rv.computeIfAbsent(r.getConsultantId(), k -> new ArrayList<>()).add(r));
            applications.findByOrgIdAndConsultantIdIn(orgId, consultantIds).forEach(a -> apps.computeIfAbsent(a.getConsultantId(), k -> new ArrayList<>()).add(a));
        }
        return new Ctx(cs, rs, cl, cSkills, primary, rSkills, rv, apps);
    }

    // -------------------------------------------------------------- row / detail

    /** Null when the consultant or the job of the match no longer exists. */
    private Row row(RequirementMatch m, Ctx ctx, Instant now) {
        ConsultantProfile c = ctx.consultants().get(m.getConsultantId());
        ClientRequirement r = ctx.requirements().get(m.getRequirementId());
        if (c == null || r == null) return null;
        ClientAccount client = ctx.clients().get(r.getClientId());
        List<String> have = ctx.consultantSkills().getOrDefault(c.getId(), List.of());
        SkillOverlap overlap = MktMatchRules.skillOverlap(ctx.requirementSkills().getOrDefault(r.getId(), List.of()), have);
        Fit fit = MktMatchRules.availabilityFit(c.getAvailabilityStatus(), c.getAvailableFrom(), LocalDate.ofInstant(now, ZoneOffset.UTC));
        ResumeNeed need = MktMatchRules.resumeNeed(ctx.resumes().getOrDefault(c.getId(), List.of()), overlap.matched(), now);
        int score = m.getScore() == null ? 0 : m.getScore();
        return new Row(
            m.getId(), c.getId(), c.getDisplayName(), null, c.getJobTitle(), ctx.primarySkill().get(c.getId()), r.getId(), r.getTitle(), r.getClientId(),
            client == null ? "" : client.getName(), score, m.getStatus(), MktMatchRules.isStale(m.getStatus(), m.getCreatedAt(), now),
            MktMatchRules.isHighConfidence(score), new Availability(fit.key(), fit.label(), fit.tone(), fit.pct()), new ResumeUpdate(need.needed(), need.reasons()), m.getCreatedAt()
        );
    }

    private Detail detail(RequirementMatch m, Row row, Ctx ctx, Instant now) {
        ConsultantProfile c = ctx.consultants().get(m.getConsultantId());
        ClientRequirement r = ctx.requirements().get(m.getRequirementId());
        LocalDate today = LocalDate.ofInstant(now, ZoneOffset.UTC);
        List<String> have = ctx.consultantSkills().getOrDefault(c.getId(), List.of());
        List<String> required = ctx.requirementSkills().getOrDefault(r.getId(), List.of());
        SkillOverlap overlap = MktMatchRules.skillOverlap(required, have);
        Fit fit = MktMatchRules.availabilityFit(c.getAvailabilityStatus(), c.getAvailableFrom(), today);
        Integer expPct = MktMatchRules.experiencePct(c.getYearsExperience(), r.getExperienceLevel());
        int needYears = MktMatchRules.yearsNeeded(r.getExperienceLevel());
        int loc = MktMatchRules.locationFit(r.getLocation(), r.getWorkMode(), c.getLocationLabel(), c.getWorkMode());
        List<TalentApplication> sameClient = ctx.applications().getOrDefault(c.getId(), List.of()).stream().filter(a -> r.getClientId().equals(a.getClientId())).toList();
        ClientHistory history = MktMatchRules.clientHistory(sameClient);

        List<Tick> ticks = new ArrayList<>();
        Integer skillPct = overlap.pct();
        if (skillPct != null) ticks.add(new Tick("skills", skillPct >= 70, overlap.matched().size() + " of " + overlap.required().size() + " required skills match"));
        if (expPct != null) {
            boolean ok = (c.getYearsExperience() == null ? 0 : c.getYearsExperience()) >= needYears;
            ticks.add(new Tick("experience", ok, ok ? needYears + "+ years of relevant experience" : "Needs " + needYears + "+ years (has " + (c.getYearsExperience() == null ? 0 : c.getYearsExperience()) + ")"));
        }
        boolean availOk = fit.pct() >= MktMatchRules.GOOD.pct();
        ticks.add(new Tick("availability", availOk, availabilityText(c, fit, today)));
        boolean locOk = loc >= 75;
        String where = "REMOTE".equals(r.getWorkMode()) ? "Remote role" : locOk ? "Work location matches (" + r.getLocation() + ")" : "Location differs (" + nullToDash(c.getLocationLabel()) + " vs " + nullToDash(r.getLocation()) + ")";
        ticks.add(new Tick("location", locOk, where));
        if (history.pct() != null) {
            boolean ok = history.pct() >= 60;
            ticks.add(new Tick("client", ok, (ok ? "Strong client fit based on past applications (" : "Weak client history (") + history.progressed() + " of " + history.total() + " progressed)"));
        }

        List<Insight> insights = List.of(
            new Insight("skills", "Skills Match", skillPct),
            new Insight("experience", "Experience Level", expPct),
            new Insight("availability", "Availability Fit", fit.pct()),
            new Insight("client", "Client History", history.pct()),
            new Insight("location", "Location Fit", loc)
        );

        List<String> chips = new ArrayList<>(overlap.matched());
        for (String s : have) if (chips.stream().noneMatch(x -> MktMatchRules.norm(x).equals(MktMatchRules.norm(s)))) chips.add(s);
        Person person = new Person(c.getId(), c.getDisplayName(), c.getJobTitle(), null, chips.stream().limit(4).toList());
        Job job = new Job(r.getId(), r.getTitle(), row.client(), r.getLocation(), required.stream().limit(4).toList());
        return new Detail(row, person, job, ticks, insights, overlap.missing(), m.getReason(), m.getAssignedAt());
    }

    private static String nullToDash(String s) {
        return s == null || s.isBlank() ? "-" : s;
    }

    private static String availabilityText(ConsultantProfile c, Fit fit, LocalDate today) {
        if ("AVAILABLE".equals(c.getAvailabilityStatus())) return "Available to start now";
        if (c.getAvailableFrom() == null) return "No start date known";
        long days = ChronoUnit.DAYS.between(today, c.getAvailableFrom());
        if (days <= 0) return "Available to start now";
        long weeks = Math.max(1, (days + 6) / 7);
        return (fit.pct() >= MktMatchRules.GOOD.pct() ? "Available to start within " : "Available in about ") + weeks + (weeks == 1 ? " week" : " weeks");
    }

    // ---------------------------------------------------------- filters, order, KPIs

    private static Predicate<Row> filter(Query q) {
        String needle = q.q() == null ? "" : q.q().trim().toLowerCase(Locale.ROOT);
        return r -> {
            if (q.consultantId() != null && !q.consultantId().equals(r.consultantId())) return false;
            if (q.clientId() != null && !q.clientId().equals(r.clientId())) return false;
            if (q.skill() != null && !q.skill().isBlank() && !MktMatchRules.norm(q.skill()).equals(MktMatchRules.norm(r.primarySkill()))) return false;
            if (q.score() != null) {
                switch (q.score()) {
                    case "high" -> { if (r.score() < MktMatchRules.HIGH_CONFIDENCE_MIN) return false; }
                    case "mid" -> { if (r.score() >= MktMatchRules.HIGH_CONFIDENCE_MIN || r.score() < 70) return false; }
                    case "low" -> { if (r.score() >= 70) return false; }
                    default -> { }
                }
            }
            if (!needle.isEmpty()) {
                String hay = (r.consultantName() + " " + r.jobTitle() + " " + r.client() + " " + nullToEmpty(r.primarySkill())).toLowerCase(Locale.ROOT);
                if (!hay.contains(needle)) return false;
            }
            return true;
        };
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    /** {@code sort}: score | consultant | job | client | created, a leading {@code -} = descending; default {@code -score}. */
    static Comparator<Row> comparator(String sort) {
        String s = sort == null || sort.isBlank() ? "-score" : sort.trim();
        boolean desc = s.startsWith("-");
        String key = desc ? s.substring(1) : s;
        Comparator<Row> c = switch (key) {
            case "consultant" -> Comparator.comparing(r -> r.consultantName().toLowerCase(Locale.ROOT));
            case "job" -> Comparator.comparing(r -> r.jobTitle().toLowerCase(Locale.ROOT));
            case "client" -> Comparator.comparing(r -> r.client().toLowerCase(Locale.ROOT));
            case "created" -> Comparator.comparing(Row::createdAt, Comparator.nullsFirst(Comparator.naturalOrder()));
            default -> Comparator.comparingInt(Row::score);
        };
        if (desc) c = c.reversed();
        return c.thenComparing(Row::id);
    }

    private static List<Kpi> kpis(List<Row> rows, Instant now) {
        Instant monthAgo = now.minus(Duration.ofDays(30));
        Instant staleMonthAgo = now.minus(Duration.ofDays(30 + MktMatchRules.STALE_DAYS));
        Predicate<Row> any = r -> true;
        Predicate<Row> high = r -> r.highConfidence();
        Predicate<Row> ready = r -> "SUGGESTED".equals(r.status()) && MktMatchRules.isReady(r.availability().key(), r.resumeUpdate().needed());
        Predicate<Row> stale = Row::stale;
        return List.of(
            kpi("matched", rows, any, any, monthAgo, now),
            kpi("highConfidence", rows, high, high, monthAgo, now),
            kpi("ready", rows, ready, ready, monthAgo, now),
            kpi("stale", rows, stale, r -> "SUGGESTED".equals(r.status()), staleMonthAgo, now)
        );
    }

    /** Value = rows matching {@code now}; previous = rows matching {@code then} created before {@code cutoff}. */
    private static Kpi kpi(String key, List<Row> rows, Predicate<Row> nowP, Predicate<Row> thenP, Instant cutoff, Instant now) {
        long cur = rows.stream().filter(nowP).count();
        long prev = rows.stream().filter(thenP).filter(r -> r.createdAt() != null && r.createdAt().isBefore(cutoff)).count();
        Double delta = prev > 0 ? Math.round((cur - prev) * 1000.0 / prev) / 10.0 : null;
        List<Long> spark = new ArrayList<>();
        for (int w = MktMatchRules.SPARK_WEEKS - 1; w >= 0; w--) {
            Instant end = now.minus(Duration.ofDays(7L * w));
            Instant start = end.minus(Duration.ofDays(7));
            spark.add(rows.stream().filter(nowP).filter(r -> r.createdAt() != null && r.createdAt().isAfter(start) && !r.createdAt().isAfter(end)).count());
        }
        return new Kpi(key, cur, delta, spark);
    }

    private static Filters filters(List<Row> all) {
        Map<Long, String> cs = new LinkedHashMap<>();
        Map<Long, String> cl = new LinkedHashMap<>();
        Set<String> skills = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        all.stream().sorted(Comparator.comparing(r -> r.consultantName().toLowerCase(Locale.ROOT))).forEach(r -> cs.putIfAbsent(r.consultantId(), r.consultantName()));
        all.stream().sorted(Comparator.comparing(r -> r.client().toLowerCase(Locale.ROOT))).forEach(r -> cl.putIfAbsent(r.clientId(), r.client()));
        all.forEach(r -> { if (r.primarySkill() != null) skills.add(r.primarySkill()); });
        return new Filters(
            cs.entrySet().stream().map(e -> new Option(String.valueOf(e.getKey()), e.getValue())).toList(),
            List.copyOf(skills),
            cl.entrySet().stream().map(e -> new Option(String.valueOf(e.getKey()), e.getValue())).toList(),
            List.of(
                new Option("high", "High confidence (" + MktMatchRules.HIGH_CONFIDENCE_MIN + "%+)"),
                new Option("mid", "70% - " + (MktMatchRules.HIGH_CONFIDENCE_MIN - 1) + "%"),
                new Option("low", "Below 70%")
            )
        );
    }
}
