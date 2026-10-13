package com.dossier.api.service.ent.mkt.talent;

import com.dossier.api.domain.ent.mkt.MktSavedView;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentInterview;
import com.dossier.api.repository.ent.mkt.MktSavedViewRepository;
import com.dossier.api.repository.ent.mkt.MktTalentApplicationRepository;
import com.dossier.api.repository.ent.mkt.MktTalentClientRepository;
import com.dossier.api.repository.ent.mkt.MktTalentConsultantRepository;
import com.dossier.api.repository.ent.mkt.MktTalentInterviewRepository;
import com.dossier.api.repository.ent.mkt.MktTalentJobRepository;
import com.dossier.api.repository.ent.mkt.MktTalentMatchRepository;
import com.dossier.api.repository.ent.mkt.MktTalentResumeRepository;
import com.dossier.api.repository.ent.mkt.MktTalentSkillRepository;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.*;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Marketing "My Assigned Talent". Everything is computed from real rows of the consultants the caller may see
 * ({@link MktScope}: ASSIGNED = the marketer's or backup's consultants, ORG = all); a consultant outside that set is a 404.
 *
 * <p>Definitions (see docs/enterprise-v2/page-mkt-talent.md):
 * <ul>
 *   <li><b>Available Now</b>: availability_status AVAILABLE.</li>
 *   <li><b>In Interview</b>: a SCHEDULED interview from now on, or an open application at stage INTERVIEWING.</li>
 *   <li><b>Needs Update</b>: no resume, or the newest resume was last updated more than {@value #STALE_DAYS} days ago.</li>
 *   <li><b>Pending Approval</b>: at least one resume with approval PENDING.</li>
 *   <li><b>Assigned jobs</b>: requirement_match rows ASSIGNED; <b>Active apps</b>: applications not CLOSED.</li>
 * </ul>
 * E1: this service only reads, plus the caller's own saved views. Nothing here submits anything for a consultant.
 */
@Service
public class MktTalentService {

    public static final String PERM_VIEW = "consultants.view";
    public static final String PERM_EDIT = "consultants.edit";
    public static final int STALE_DAYS = 90;
    public static final int DEFAULT_SIZE = 8;
    public static final int MAX_SIZE = 100;
    public static final int CARD_ROWS = 4;
    public static final int MAX_VIEWS = 20;
    static final int SPARK_WEEKS = 8;
    static final Set<String> STATUSES = Set.of("AVAILABLE_NOW", "IN_INTERVIEW", "NEEDS_UPDATE", "PENDING_APPROVAL");
    static final Set<String> BANDS = Set.of("0-2", "3-5", "6-8", "9+");
    static final Set<String> AVAILABILITY = Set.of("AVAILABLE_NOW", "IN_INTERVIEW", "SOON", "LATER", "ON_PROJECT", "UNAVAILABLE");

    /** The list filters. Blank = no filter. {@code sort}: name, experience, location, apps, jobs, availability; a leading '-' is descending. */
    public record ListQuery(String q, String status, String skill, String location, String experience, String availability, String sort, int page, int size) {
        public static ListQuery defaults() {
            return new ListQuery(null, null, null, null, null, null, null, 0, DEFAULT_SIZE);
        }
    }

    /** One consultant with the facts the filters and the tiles need. */
    record Fact(ConsultantProfile c, Row row, List<String> skills, boolean availableNow, boolean inInterview, boolean needsUpdate, boolean pending, Instant pendingSince) {}

    private final MktScope scope;
    private final MktTalentConsultantRepository consultants;
    private final MktTalentSkillRepository skills;
    private final MktTalentResumeRepository resumes;
    private final MktTalentApplicationRepository applications;
    private final MktTalentInterviewRepository interviews;
    private final MktTalentMatchRepository matches;
    private final MktTalentJobRepository jobs;
    private final MktTalentClientRepository clients;
    private final MktSavedViewRepository savedViews;

    public MktTalentService(
        MktScope scope, MktTalentConsultantRepository consultants, MktTalentSkillRepository skills, MktTalentResumeRepository resumes,
        MktTalentApplicationRepository applications, MktTalentInterviewRepository interviews, MktTalentMatchRepository matches,
        MktTalentJobRepository jobs, MktTalentClientRepository clients, MktSavedViewRepository savedViews
    ) {
        this.scope = scope;
        this.consultants = consultants;
        this.skills = skills;
        this.resumes = resumes;
        this.applications = applications;
        this.interviews = interviews;
        this.matches = matches;
        this.jobs = jobs;
        this.clients = clients;
        this.savedViews = savedViews;
    }

    // ---- the board ---------------------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Response list(OrgMembership me, ListQuery query) {
        return list(me, query, Instant.now());
    }

    @Transactional(readOnly = true)
    Response list(OrgMembership me, ListQuery query, Instant now) {
        MktScope.View view = scope.resolve(me, PERM_VIEW);
        List<ConsultantProfile> visible = visibleConsultants(view);
        List<Fact> facts = buildFacts(view.orgId(), visible, now);

        Counts counts = new Counts(
            facts.size(),
            facts.stream().filter(Fact::availableNow).count(),
            facts.stream().filter(Fact::inInterview).count(),
            facts.stream().filter(Fact::needsUpdate).count(),
            facts.stream().filter(Fact::pending).count()
        );
        List<Kpi> kpis = kpis(view.orgId(), facts, now);
        Facets facets = facets(facts);

        List<Fact> filtered = facts.stream().filter(f -> matches(f, query)).sorted(comparator(query.sort())).toList();
        int size = query.size() <= 0 ? DEFAULT_SIZE : Math.min(query.size(), MAX_SIZE);
        int page = Math.max(0, query.page());
        int from = (int) Math.min((long) page * size, filtered.size());
        List<Row> items = filtered.subList(from, Math.min(from + size, filtered.size())).stream().map(Fact::row).toList();

        Cards cards = new Cards(
            facts.stream().filter(Fact::availableNow).limit(CARD_ROWS).map(Fact::row).toList(),
            facts.stream().filter(Fact::needsUpdate).limit(CARD_ROWS).map(Fact::row).toList(),
            facts.stream().filter(Fact::inInterview).limit(CARD_ROWS).map(Fact::row).toList()
        );
        List<MktTalentDtos.View> views = savedViews.findByOrgIdAndMemberIdAndPageKeyOrderByNameAsc(view.orgId(), me.memberId(), MktSavedView.PAGE_TALENT).stream().map(MktTalentService::toView).toList();
        boolean canAdd = me.scopeFor(PERM_EDIT).isPresent();
        return new Response(kpis, counts, facets, items, filtered.size(), page, size, cards, views, canAdd);
    }

    private List<ConsultantProfile> visibleConsultants(MktScope.View view) {
        if (view.all()) return consultants.findActiveForOrg(view.orgId());
        if (view.consultantIds().isEmpty()) return List.of();
        return consultants.findActiveByIds(view.orgId(), view.consultantIds());
    }

    /** Builds every consultant's facts from a handful of batch queries (no per-row query). */
    List<Fact> buildFacts(Long orgId, List<ConsultantProfile> cons, Instant now) {
        if (cons.isEmpty()) return List.of();
        List<Long> ids = cons.stream().map(ConsultantProfile::getId).toList();
        Map<Long, List<ConsultantSkill>> skillsOf = skills.findForConsultants(orgId, ids).stream().collect(Collectors.groupingBy(ConsultantSkill::getConsultantId));
        Map<Long, List<OrgResume>> resumesOf = resumes.findForConsultants(orgId, ids).stream().collect(Collectors.groupingBy(OrgResume::getConsultantId));
        Map<Long, List<TalentApplication>> appsOf = applications.findOpenForConsultants(orgId, ids).stream().collect(Collectors.groupingBy(TalentApplication::getConsultantId));
        Map<Long, List<TalentInterview>> interviewsOf = interviews.findLiveSince(orgId, ids, now.minus(SPARK_WEEKS * 7L, ChronoUnit.DAYS)).stream().collect(Collectors.groupingBy(TalentInterview::getConsultantId));
        Map<Long, Long> jobsOf = matches.findAssignedForConsultants(orgId, ids).stream().collect(Collectors.groupingBy(RequirementMatch::getConsultantId, Collectors.counting()));
        LocalDate today = now.atZone(ZoneOffset.UTC).toLocalDate();

        List<Fact> out = new ArrayList<>(cons.size());
        for (ConsultantProfile c : cons) {
            List<ConsultantSkill> sk = skillsOf.getOrDefault(c.getId(), List.of()).stream().sorted(Comparator.comparing(ConsultantSkill::getSortOrder)).toList();
            List<OrgResume> rs = resumesOf.getOrDefault(c.getId(), List.of());
            List<TalentApplication> apps = appsOf.getOrDefault(c.getId(), List.of());
            List<TalentInterview> ivs = interviewsOf.getOrDefault(c.getId(), List.of());

            boolean upcoming = ivs.stream().anyMatch(i -> "SCHEDULED".equals(i.getStatus()) && !i.getScheduledAt().isBefore(now));
            boolean interviewingApp = apps.stream().anyMatch(a -> "INTERVIEWING".equals(a.getStage()));
            boolean inInterview = upcoming || interviewingApp;

            Instant latest = rs.stream().map(OrgResume::getUpdatedAt).max(Comparator.naturalOrder()).orElse(null);
            boolean needsUpdate = latest == null || latest.isBefore(now.minus(STALE_DAYS, ChronoUnit.DAYS));
            Instant pendingSince = rs.stream().filter(r -> "PENDING".equals(r.getApprovalStatus())).map(OrgResume::getCreatedAt).min(Comparator.naturalOrder()).orElse(null);
            boolean pending = pendingSince != null;
            ResumeStatus resume = needsUpdate ? new ResumeStatus("NEEDS_UPDATE", "Needs Update") : pending ? new ResumeStatus("PENDING_APPROVAL", "Pending Approval") : new ResumeStatus("UP_TO_DATE", "Up to date");

            Availability availability = availability(c.getAvailabilityStatus(), c.getAvailableFrom(), inInterview, today);
            List<String> skillNames = sk.stream().map(ConsultantSkill::getSkill).toList();
            Row row = new Row(
                c.getId(), c.getDisplayName(), null, c.getJobTitle(), primarySkill(sk), c.getYearsExperience(), c.getLocationLabel(),
                availability, resume, apps.size(), jobsOf.getOrDefault(c.getId(), 0L).intValue()
            );
            out.add(new Fact(c, row, skillNames, "AVAILABLE".equals(c.getAvailabilityStatus()), inInterview, needsUpdate, pending, pendingSince));
        }
        return out;
    }

    static String primarySkill(List<ConsultantSkill> sorted) {
        List<String> primaries = sorted.stream().filter(ConsultantSkill::isPrimarySkill).limit(2).map(ConsultantSkill::getSkill).toList();
        if (!primaries.isEmpty()) return String.join(" / ", primaries);
        return sorted.isEmpty() ? "" : sorted.get(0).getSkill();
    }

    /** The availability column: the board's "Available Now", "1 week", "2 weeks", "1 month", "In Interview". */
    static Availability availability(String status, LocalDate availableFrom, boolean inInterview, LocalDate today) {
        if ("AVAILABLE".equals(status)) return new Availability("AVAILABLE_NOW", "Available Now", "green");
        if (inInterview) return new Availability("IN_INTERVIEW", "In Interview", "violet");
        if (availableFrom != null) {
            long days = ChronoUnit.DAYS.between(today, availableFrom);
            return new Availability(days <= 30 ? "SOON" : "LATER", relative(days), "blue");
        }
        if ("NOTICE".equals(status)) return new Availability("SOON", "Soon", "blue");
        if ("ON_PROJECT".equals(status)) return new Availability("ON_PROJECT", "On Project", "amber");
        return new Availability("UNAVAILABLE", "Unavailable", "grey");
    }

    static String relative(long days) {
        if (days <= 0) return "Soon";
        if (days <= 10) return "1 week";
        if (days <= 21) return "2 weeks";
        if (days <= 45) return "1 month";
        return Math.round(days / 30.0) + " months";
    }

    // ---- KPI tiles -----------------------------------------------------------------------------------------------------------------

    private List<Kpi> kpis(Long orgId, List<Fact> facts, Instant now) {
        Instant monthAgo = now.minus(30, ChronoUnit.DAYS);
        List<Fact> avail = facts.stream().filter(Fact::availableNow).toList();
        List<Fact> needs = facts.stream().filter(Fact::needsUpdate).toList();
        List<Fact> pend = facts.stream().filter(Fact::pending).toList();
        List<Fact> inIv = facts.stream().filter(Fact::inInterview).toList();

        // "last month" cuts (no history tables): people who had joined before T-30; for interviews the 14-day window that ended 30 days ago.
        long prevAssigned = facts.stream().filter(f -> f.c().getCreatedAt().isBefore(monthAgo)).count();
        long prevAvail = avail.stream().filter(f -> f.c().getCreatedAt().isBefore(monthAgo)).count();
        long prevNeeds = needs.stream().filter(f -> f.c().getCreatedAt().isBefore(monthAgo)).count();
        long prevPending = pend.stream().filter(f -> f.pendingSince().isBefore(monthAgo)).count();

        Map<Long, List<Instant>> liveIv = liveInterviewTimes(orgId, facts, now);
        long prevInterview = liveIv.values().stream().filter(ts -> ts.stream().anyMatch(t -> !t.isBefore(monthAgo) && t.isBefore(now.minus(16, ChronoUnit.DAYS)))).count();

        return List.of(
            new Kpi("assigned", facts.size(), delta(facts.size(), prevAssigned), cumulative(facts.stream().map(f -> f.c().getCreatedAt()).toList(), now)),
            new Kpi("availableNow", avail.size(), delta(avail.size(), prevAvail), cumulative(avail.stream().map(f -> f.c().getCreatedAt()).toList(), now)),
            new Kpi("needUpdates", needs.size(), delta(needs.size(), prevNeeds), cumulative(needs.stream().map(f -> f.c().getCreatedAt()).toList(), now)),
            new Kpi("activeInterviews", inIv.size(), delta(inIv.size(), prevInterview), weeklyConsultants(liveIv, now)),
            new Kpi("pendingApprovals", pend.size(), delta(pend.size(), prevPending), cumulative(pend.stream().map(Fact::pendingSince).toList(), now))
        );
    }

    private Map<Long, List<Instant>> liveInterviewTimes(Long orgId, List<Fact> facts, Instant now) {
        if (facts.isEmpty()) return Map.of();
        List<Long> ids = facts.stream().map(f -> f.c().getId()).toList();
        Map<Long, List<Instant>> out = new HashMap<>();
        for (TalentInterview i : interviews.findLiveSince(orgId, ids, now.minus(SPARK_WEEKS * 7L, ChronoUnit.DAYS))) out.computeIfAbsent(i.getConsultantId(), k -> new ArrayList<>()).add(i.getScheduledAt());
        return out;
    }

    static Double delta(long current, long previous) {
        if (previous <= 0) return null;
        return Math.round((current - previous) * 1000.0 / previous) / 10.0;
    }

    /** Eight weekly points: how many of the items had entered the set by the end of each of the last eight weeks (the last point is "now"). */
    static List<Long> cumulative(List<Instant> stamps, Instant now) {
        List<Long> out = new ArrayList<>(SPARK_WEEKS);
        for (int i = 0; i < SPARK_WEEKS; i++) {
            Instant end = now.minus(Duration.ofDays(7L * (SPARK_WEEKS - 1 - i)));
            out.add(stamps.stream().filter(t -> !t.isAfter(end)).count());
        }
        return out;
    }

    /** Eight weekly points: consultants with a live interview in that week; the last week reaches 14 days ahead (the upcoming ones). */
    static List<Long> weeklyConsultants(Map<Long, List<Instant>> byConsultant, Instant now) {
        List<Long> out = new ArrayList<>(SPARK_WEEKS);
        for (int i = 0; i < SPARK_WEEKS; i++) {
            Instant end = i == SPARK_WEEKS - 1 ? now.plus(14, ChronoUnit.DAYS) : now.minus(Duration.ofDays(7L * (SPARK_WEEKS - 1 - i)));
            Instant start = i == SPARK_WEEKS - 1 ? now.minus(7, ChronoUnit.DAYS) : end.minus(7, ChronoUnit.DAYS);
            out.add(byConsultant.values().stream().filter(ts -> ts.stream().anyMatch(t -> t.isAfter(start) && !t.isAfter(end))).count());
        }
        return out;
    }

    private static Facets facets(List<Fact> facts) {
        Set<String> sk = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        Set<String> loc = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Fact f : facts) {
            sk.addAll(f.skills());
            if (f.row().location() != null && !f.row().location().isBlank()) loc.add(f.row().location());
        }
        return new Facets(new ArrayList<>(sk), new ArrayList<>(loc));
    }

    // ---- filters and sort ----------------------------------------------------------------------------------------------------------

    static boolean matches(Fact f, ListQuery q) {
        Row r = f.row();
        String status = norm(q.status());
        if (status != null) {
            boolean ok = switch (status) {
                case "AVAILABLE_NOW" -> f.availableNow();
                case "IN_INTERVIEW" -> f.inInterview();
                case "NEEDS_UPDATE" -> f.needsUpdate();
                case "PENDING_APPROVAL" -> f.pending();
                default -> true;
            };
            if (!ok) return false;
        }
        String skill = q.skill() == null ? null : q.skill().trim();
        if (skill != null && !skill.isEmpty() && f.skills().stream().noneMatch(s -> s.equalsIgnoreCase(skill))) return false;
        String loc = q.location() == null ? null : q.location().trim();
        if (loc != null && !loc.isEmpty() && (r.location() == null || !r.location().equalsIgnoreCase(loc))) return false;
        String band = norm(q.experience());
        if (band != null && !inBand(r.yearsExperience(), band)) return false;
        String av = norm(q.availability());
        if (av != null && !av.equals(r.availability().code())) return false;
        String text = q.q() == null ? "" : q.q().trim().toLowerCase(Locale.ROOT);
        if (!text.isEmpty()) {
            boolean hit = contains(r.name(), text) || contains(r.title(), text) || contains(r.location(), text) || f.skills().stream().anyMatch(s -> contains(s, text));
            if (!hit) return false;
        }
        return true;
    }

    static boolean inBand(Integer years, String band) {
        if (years == null) return false;
        return switch (band) {
            case "0-2" -> years <= 2;
            case "3-5" -> years >= 3 && years <= 5;
            case "6-8" -> years >= 6 && years <= 8;
            case "9+" -> years >= 9;
            default -> true;
        };
    }

    private static boolean contains(String hay, String needleLower) {
        return hay != null && hay.toLowerCase(Locale.ROOT).contains(needleLower);
    }

    private static String norm(String s) {
        return s == null || s.isBlank() ? null : s.trim().toUpperCase(Locale.ROOT);
    }

    static Comparator<Fact> comparator(String sort) {
        boolean desc = sort != null && sort.startsWith("-");
        String key = sort == null ? "name" : sort.replaceFirst("^[-+]", "").toLowerCase(Locale.ROOT);
        Comparator<Fact> byName = Comparator.comparing(f -> f.row().name(), String.CASE_INSENSITIVE_ORDER);
        Comparator<Fact> primary = switch (key) {
            case "experience" -> Comparator.comparing(f -> f.row().yearsExperience() == null ? -1 : f.row().yearsExperience());
            case "location" -> Comparator.comparing(f -> f.row().location() == null ? "" : f.row().location().toLowerCase(Locale.ROOT));
            case "apps" -> Comparator.comparingInt(f -> f.row().activeApps());
            case "jobs" -> Comparator.comparingInt(f -> f.row().assignedJobs());
            case "availability" -> Comparator.comparingInt(f -> availabilityRank(f.row().availability().code()));
            default -> byName;
        };
        if (desc) primary = primary.reversed();
        return primary == byName ? primary : primary.thenComparing(byName);
    }

    private static int availabilityRank(String code) {
        return switch (code) {
            case "AVAILABLE_NOW" -> 0;
            case "IN_INTERVIEW" -> 1;
            case "SOON" -> 2;
            case "LATER" -> 3;
            case "ON_PROJECT" -> 4;
            default -> 5;
        };
    }

    // ---- the consultant drawer -----------------------------------------------------------------------------------------------------

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long consultantId) {
        return detail(me, consultantId, Instant.now());
    }

    @Transactional(readOnly = true)
    Detail detail(OrgMembership me, Long consultantId, Instant now) {
        MktScope.View view = scope.resolve(me, PERM_VIEW);
        scope.require(view, consultantId);
        Long orgId = view.orgId();
        ConsultantProfile c = consultants.findActiveById(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        Fact fact = buildFacts(orgId, List.of(c), now).get(0);

        List<TalentApplication> apps = applications.findForConsultant(orgId, consultantId).stream().filter(a -> !"CLOSED".equals(a.getStage())).limit(8).toList();
        List<TalentInterview> ivs = interviews.findUpcomingForConsultant(orgId, consultantId, now).stream().limit(5).toList();
        List<RequirementMatch> assigned = matches.findAssignedForConsultant(orgId, consultantId).stream().limit(8).toList();

        Set<Long> jobIds = new LinkedHashSet<>();
        apps.forEach(a -> jobIds.add(a.getRequirementId()));
        assigned.forEach(m -> jobIds.add(m.getRequirementId()));
        Map<Long, ClientRequirement> jobById = jobIds.isEmpty() ? Map.of() : jobs.findByIds(orgId, jobIds).stream().collect(Collectors.toMap(ClientRequirement::getId, j -> j));
        Set<Long> clientIds = new HashSet<>();
        apps.forEach(a -> clientIds.add(a.getClientId()));
        ivs.forEach(i -> clientIds.add(i.getClientId()));
        jobById.values().forEach(j -> clientIds.add(j.getClientId()));
        Map<Long, String> clientName = clientIds.isEmpty() ? Map.of() : clients.findByIds(orgId, clientIds).stream().collect(Collectors.toMap(ClientAccount::getId, ClientAccount::getName));

        List<DetailResume> rs = resumes.findForConsultant(orgId, consultantId).stream().limit(6)
            .map(r -> new DetailResume(r.getId(), r.getName(), r.getVersionNo(), r.isPrimaryForOrg(), r.getApprovalStatus(), r.getUpdatedAt())).toList();
        List<DetailApplication> da = apps.stream().map(a -> new DetailApplication(
            a.getCode(), jobById.containsKey(a.getRequirementId()) ? jobById.get(a.getRequirementId()).getTitle() : "", clientName.getOrDefault(a.getClientId(), ""), a.getStage(), a.getNextAction())).toList();
        List<DetailInterview> di = ivs.stream().map(i -> new DetailInterview(i.getScheduledAt(), i.getRoundLabel(), clientName.getOrDefault(i.getClientId(), ""), i.getDurationMinutes())).toList();
        List<DetailJob> dj = assigned.stream().map(m -> {
            ClientRequirement j = jobById.get(m.getRequirementId());
            return new DetailJob(m.getRequirementId(), j == null ? "" : j.getTitle(), j == null ? "" : clientName.getOrDefault(j.getClientId(), ""), m.getScore());
        }).toList();

        // Consent level SUMMARY: the summary fields only. No e-mail, phone, birth date or document number is ever returned.
        return new Detail(
            c.getId(), c.getDisplayName(), null, c.getJobTitle(), c.getHeadline(), c.getYearsExperience(), c.getLocationLabel(), c.getWorkMode(),
            fact.row().availability(), fact.row().resume(), c.getProfileCompleteness() == null ? 0 : c.getProfileCompleteness(), fact.skills(), rs, da, di, dj, "SUMMARY"
        );
    }

    // ---- saved views (the caller's own) --------------------------------------------------------------------------------------------

    @Transactional
    public MktTalentDtos.View saveView(OrgMembership me, SaveViewRequest req) {
        MktScope.View view = scope.resolve(me, PERM_VIEW);
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty() || name.length() > 60) throw invalid("name", "Give the view a name of 1 to 60 characters.");
        String q = clean(req.q(), 120, "q");
        String skill = clean(req.skill(), 60, "skill");
        String location = clean(req.location(), 120, "location");
        SensitiveContent.check("name", "name", name);
        if (q != null) SensitiveContent.check("q", "q", q);
        String status = allowed(req.status(), STATUSES, "status");
        String experience = allowed(req.experience(), BANDS, "experience");
        String availability = allowed(req.availability(), AVAILABILITY, "availability");

        MktSavedView row = savedViews.findByOrgIdAndMemberIdAndPageKeyAndName(view.orgId(), me.memberId(), MktSavedView.PAGE_TALENT, name).orElse(null);
        if (row == null) {
            if (savedViews.countByOrgIdAndMemberIdAndPageKey(view.orgId(), me.memberId(), MktSavedView.PAGE_TALENT) >= MAX_VIEWS) {
                throw new OrgException(422, OrgException.CODE_ORG_LIMIT_REACHED, "You can keep up to " + MAX_VIEWS + " saved views. Delete one first.", Map.of("field", "name"));
            }
            row = new MktSavedView();
            row.setOrgId(view.orgId());
            row.setMemberId(me.memberId());
            row.setPageKey(MktSavedView.PAGE_TALENT);
            row.setName(name);
        }
        row.setQueryText(q);
        row.setStatusFilter(status);
        row.setSkillFilter(skill);
        row.setLocationFilter(location);
        row.setExperienceFilter(experience);
        row.setAvailabilityFilter(availability);
        return toView(savedViews.save(row));
    }

    @Transactional
    public void deleteView(OrgMembership me, Long viewId) {
        MktScope.View view = scope.resolve(me, PERM_VIEW);
        MktSavedView row = savedViews.findByOrgIdAndMemberIdAndId(view.orgId(), me.memberId(), viewId).orElseThrow(OrgNotFoundException::new);
        savedViews.delete(row);
    }

    static MktTalentDtos.View toView(MktSavedView v) {
        return new MktTalentDtos.View(v.getId(), v.getName(), new Filters(v.getQueryText(), v.getStatusFilter(), v.getSkillFilter(), v.getLocationFilter(), v.getExperienceFilter(), v.getAvailabilityFilter()));
    }

    private static String clean(String s, int max, String field) {
        if (s == null || s.isBlank()) return null;
        String t = s.trim();
        if (t.length() > max) throw invalid(field, "Too long.");
        return t;
    }

    private static String allowed(String s, Set<String> allowed, String field) {
        String t = norm(s);
        if (t == null) return null;
        if (!allowed.contains(t)) throw invalid(field, "Not a valid " + field + ".");
        return t;
    }

    private static OrgException invalid(String field, String message) {
        return new OrgException(422, OrgException.CODE_ORG_INVALID, message, Map.of("field", field));
    }
}
