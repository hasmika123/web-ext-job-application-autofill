package com.dossier.api.service.ent.mkt.jobs;

import com.dossier.api.domain.ent.mkt.MktJobMeta;
import com.dossier.api.domain.ent.mkt.MktSavedSearch;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.repository.ent.mkt.MktJobMatchRepository;
import com.dossier.api.repository.ent.mkt.MktJobMetaRepository;
import com.dossier.api.repository.ent.mkt.MktSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.service.ent.jobs.JobDetailCap;
import com.dossier.api.service.ent.jobs.JobDetailMapper;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO.*;
import com.dossier.api.service.ent.mkt.jobs.MktJobsLogic.JobView;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Instant;
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
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Job Discovery (Marketing workspace, `/w/marketing/jobs`). One call returns the whole board: KPI tiles, the job table with the board's
 * filters, Trending Skills, Top Clients Hiring, Recent Job Alerts, the caller's Saved Searches and the Watched Job Streams.
 *
 * <p>Gate: {@code matches.run} through {@link MktScope}. Jobs are the organization's open client requirements; what depends on a
 * CONSULTANT (High-Match Openings, Jobs Assigned, the match list, the assignment picker) only counts the consultants the caller may see
 * ({@code view.sees}). Assign needs {@code opportunities.manage}, writes only a match row in ASSIGNED (E1: it never submits an
 * application for anyone) and answers 404 for a consultant outside the caller's scope. Source, priority and visa come from
 * {@code mkt_job_meta}; the "N new" of a saved search is counted live from {@code last_seen_at}.
 *
 * <p>Scale note: the list is filtered in memory over the organization's requirements (a staffing firm has hundreds, not millions); the
 * shared tables are read through their existing org-scoped methods and never edited.
 */
@Service
public class MktJobsService {

    public static final String KEY_VIEW = "matches.run";
    public static final String KEY_ASSIGN = "opportunities.manage";
    public static final String AUDIT_ASSIGN = "MKT_JOB_ASSIGN";
    public static final String AUDIT_SEARCH_SAVE = "MKT_SAVED_SEARCH_CREATE";
    public static final String AUDIT_SEARCH_DELETE = "MKT_SAVED_SEARCH_DELETE";
    public static final String TARGET = "REQUIREMENT";
    public static final int MAX_PAGE_SIZE = 100;
    public static final int DEFAULT_PAGE_SIZE = 8;
    public static final int HIGH_MATCH_SCORE = 90;
    public static final int MAX_SAVED_SEARCHES = 50;
    /** Trending Skills, Top Clients and Recent Alerts return this many; the board shows five and "View all" opens the rest. */
    public static final int CARD_MAX = 10;
    static final long DAY = 86_400L;
    static final long WEEK = 7 * DAY;
    private static final List<String> WORK_TYPES = List.of("ON_SITE", "HYBRID", "REMOTE");

    private final MktScope scope;
    private final OpportunityAssignmentService assignment;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository accounts;
    private final RequirementSkillRepository requirementSkills;
    private final ConsultantProfileRepository consultants;
    private final ConsultantSkillRepository consultantSkills;
    private final MktJobMetaRepository metas;
    private final MktSavedSearchRepository searches;
    private final MktJobMatchRepository matches;
    private final OrgAuditService audit;
    private final ObjectMapper mapper;
    private final JobDetailCap detailCap;
    private final Clock clock;

    @Autowired
    public MktJobsService(
        MktScope scope,
        OpportunityAssignmentService assignment,
        ClientRequirementRepository requirements,
        ClientAccountRepository accounts,
        RequirementSkillRepository requirementSkills,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository consultantSkills,
        MktJobMetaRepository metas,
        MktSavedSearchRepository searches,
        MktJobMatchRepository matches,
        OrgAuditService audit,
        ObjectMapper mapper,
        JobDetailCap detailCap
    ) {
        this(scope, assignment, requirements, accounts, requirementSkills, consultants, consultantSkills, metas, searches, matches, audit, mapper, detailCap, Clock.systemUTC());
    }

    MktJobsService(
        MktScope scope,
        OpportunityAssignmentService assignment,
        ClientRequirementRepository requirements,
        ClientAccountRepository accounts,
        RequirementSkillRepository requirementSkills,
        ConsultantProfileRepository consultants,
        ConsultantSkillRepository consultantSkills,
        MktJobMetaRepository metas,
        MktSavedSearchRepository searches,
        MktJobMatchRepository matches,
        OrgAuditService audit,
        ObjectMapper mapper,
        JobDetailCap detailCap,
        Clock clock
    ) {
        this.scope = scope;
        this.assignment = assignment;
        this.requirements = requirements;
        this.accounts = accounts;
        this.requirementSkills = requirementSkills;
        this.consultants = consultants;
        this.consultantSkills = consultantSkills;
        this.metas = metas;
        this.searches = searches;
        this.matches = matches;
        this.audit = audit;
        this.mapper = mapper;
        this.detailCap = detailCap;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ the board

    @Transactional(readOnly = true)
    public Response list(OrgMembership me, Query query) {
        MktScope.View view = scope.resolve(me, KEY_VIEW);
        Long orgId = me.orgId();
        Instant now = clock.instant();
        Data d = load(orgId);
        List<JobView> open = d.views.stream().filter(v -> "OPEN".equals(v.r().getStatus())).toList();

        Criteria criteria = new Criteria(query.q(), query.skills(), query.location(), query.workType(), query.visa(), query.source(), query.rateMin(), query.rateMax());
        List<JobView> filtered = open.stream().filter(v -> MktJobsLogic.matches(v, criteria)).sorted(MktJobsLogic.comparator(query.sort())).toList();
        int size = query.size() <= 0 ? DEFAULT_PAGE_SIZE : Math.min(query.size(), MAX_PAGE_SIZE);
        int page = Math.max(0, query.page());
        int from = (int) Math.min((long) page * size, filtered.size());
        String cap = detailCap.capFor(orgId);
        List<Job> items = filtered.subList(from, Math.min(filtered.size(), from + size)).stream().map(v -> toJob(v, d, cap)).toList();

        List<MktSavedSearch> mine = searches.findByOrgIdAndOwnerMemberIdOrderByCreatedAtDesc(orgId, me.memberId());
        List<SavedSearch> savedCards = new ArrayList<>();
        List<Alert> alerts = new ArrayList<>();
        for (MktSavedSearch s : mine) {
            Criteria c = parse(s.getCriteria());
            Instant since = s.getLastSeenAt() != null ? s.getLastSeenAt() : s.getCreatedAt();
            List<JobView> news = open.stream().filter(v -> v.r().getPostedAt() != null && v.r().getPostedAt().isAfter(since) && MktJobsLogic.matches(v, c)).toList();
            savedCards.add(new SavedSearch(s.getId(), s.getName(), c, news.size()));
            if (!news.isEmpty()) {
                Instant latest = news.stream().map(v -> v.r().getPostedAt()).max(Comparator.naturalOrder()).orElse(since);
                alerts.add(new Alert("search-" + s.getId(), "SEARCH", news.size() + " new " + (news.size() == 1 ? "role matches" : "roles match") + " your saved search \"" + s.getName() + "\"", latest, null, null));
            }
        }
        alerts.addAll(clientAlerts(open, d, now));
        alerts.sort(Comparator.comparing(Alert::at, Comparator.nullsLast(Comparator.reverseOrder())));

        return new Response(
            kpis(view, d, open, mine, now),
            items,
            filtered.size(),
            page,
            size,
            me.canKey(KEY_ASSIGN),
            facets(open),
            trendingSkills(d, open, now),
            topClients(d, open, now),
            alerts.stream().limit(CARD_MAX).toList(),
            savedCards,
            streams(d, open, now)
        );
    }

    // ------------------------------------------------------------------ one job

    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long jobId) {
        MktScope.View view = scope.resolve(me, KEY_VIEW);
        Long orgId = me.orgId();
        Data d = load(orgId);
        JobView v = d.views.stream().filter(x -> x.r().getId().equals(jobId)).findFirst().orElseThrow(OrgNotFoundException::new);
        Map<Long, ConsultantProfile> people = consultants.findByOrgId(orgId).stream().collect(Collectors.toMap(ConsultantProfile::getId, c -> c, (a, b) -> a));
        List<MatchRow> rows = new ArrayList<>();
        for (RequirementMatch m : matches.findByOrgIdAndRequirementIdOrderByScoreDesc(orgId, jobId)) {
            ConsultantProfile c = people.get(m.getConsultantId());
            if (c == null || !view.sees(m.getConsultantId()) || "DISMISSED".equals(m.getStatus())) continue;
            rows.add(new MatchRow(c.getId(), c.getDisplayName(), m.getScore(), m.getStatus()));
            if (rows.size() == 5) break;
        }
        ClientRequirement r = v.r();
        // The one display mapper decides what this page may show (doc 60 section 10): the posting's text only when the effective level is FULL. A job whose
        // STORED level is MINIMAL holds no posting text at all, only the marketer's own summary (description_text), which stays available to the marketer.
        String cap = detailCap.capFor(orgId);
        JobDetailMapper.View shown = JobDetailMapper.view(r, v.clientName(), v.skills(), cap);
        boolean full = JobDetailMapper.FULL.equals(shown.detailLevel());
        String description = full ? r.getDescriptionText() : null;
        String summaryNote = !full && JobDetailMapper.MINIMAL.equals(r.getDetailLevel()) ? r.getDescriptionText() : null;
        return new Detail(toJob(v, d, cap), description, r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(), rows, summaryNote);
    }

    // ------------------------------------------------------------------ assign

    /** The consultants the caller may assign to this job, best match first. Needs {@code opportunities.manage}. */
    @Transactional(readOnly = true)
    public List<Candidate> candidates(OrgMembership me, Long jobId, String q) {
        MktScope.View view = scope.resolve(me, KEY_ASSIGN);
        Long orgId = me.orgId();
        requirements.findByOrgIdAndId(orgId, jobId).orElseThrow(OrgNotFoundException::new);
        Map<Long, RequirementMatch> byConsultant = new HashMap<>();
        for (RequirementMatch m : matches.findByOrgIdAndRequirementIdOrderByScoreDesc(orgId, jobId)) byConsultant.put(m.getConsultantId(), m);
        String needle = q == null ? "" : q.trim().toLowerCase(Locale.ROOT);
        List<Candidate> out = new ArrayList<>();
        for (ConsultantProfile c : consultants.findByOrgId(orgId)) {
            if (!"ACTIVE".equals(c.getStatus()) || !view.sees(c.getId())) continue;
            String hay = (c.getDisplayName() + " " + (c.getJobTitle() == null ? "" : c.getJobTitle())).toLowerCase(Locale.ROOT);
            if (!needle.isEmpty() && !hay.contains(needle)) continue;
            RequirementMatch m = byConsultant.get(c.getId());
            out.add(new Candidate(c.getId(), c.getDisplayName(), c.getJobTitle(), c.getAvailabilityStatus(), m == null ? null : m.getScore(), m == null ? null : m.getStatus(), OpportunityAssignmentService.pausedReason(c), c.getMemberId()));
        }
        out.sort(Comparator.comparing(Candidate::score, Comparator.nullsLast(Comparator.<Integer>reverseOrder())).thenComparing(Candidate::name, String.CASE_INSENSITIVE_ORDER));
        return out.stream().limit(MAX_PAGE_SIZE).toList();
    }

    /**
     * Assign a consultant to a job: the match row becomes (or is created as) ASSIGNED. A record only: no application, no submission, nothing
     * sent to a client. Idempotent. A consultant outside the caller's scope, a missing job or consultant: 404; a job that is not OPEN: 409.
     */
    @Transactional
    public AssignResult assign(OrgMembership me, Long jobId, Long consultantId) {
        MktScope.View view = scope.resolve(me, KEY_ASSIGN);
        Long orgId = me.orgId();
        if (consultantId == null) throw invalid("consultantId", "Choose a consultant.");
        scope.require(view, consultantId);
        // The gates and the pair rules (open job, active consultant, approved resume, reopening, the opportunity overlay) live in one place.
        OpportunityAssignmentService.Result assigned = assignment.assign(view, me, jobId, consultantId,
            OpportunityAssignmentService.Options.none()
                .withNewMatch(() -> overlapScore(orgId, jobId, consultantId), "Assigned by a marketer", "MANUAL")
                .withAudit(new OpportunityAssignmentService.Audit(AUDIT_ASSIGN, TARGET, String.valueOf(jobId),
                    r -> "{\"consultantId\":" + consultantId + ",\"created\":" + r.created() + "}")));
        // an inactive consultant is not found here, as before; a consultant whose marketing is paused (in scope, so no secret) gets a clear 409 the page words kindly
        if (OpportunityAssignmentService.CONSULTANT_PAUSED.equals(assigned.reason())) {
            throw OrgException.coded(409, OpportunityAssignmentService.CONSULTANT_PAUSED, "This consultant is on a project and their marketing is paused, so nothing can be assigned.", Map.of());
        }
        if (assigned.refused()) throw new OrgNotFoundException();
        return new AssignResult(assigned.matchId(), jobId, consultantId, "ASSIGNED", assigned.score(), assigned.created());
    }

    private int overlapScore(Long orgId, Long jobId, Long consultantId) {
        Set<String> need = requirementSkills.findByOrgId(orgId).stream().filter(s -> jobId.equals(s.getRequirementId())).map(s -> s.getSkill().trim().toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        if (need.isEmpty()) return 0;
        Set<String> have = new HashSet<>();
        for (ConsultantSkill s : consultantSkills.findByOrgIdAndConsultantIdIn(orgId, List.of(consultantId))) have.add(s.getSkill().trim().toLowerCase(Locale.ROOT));
        long hit = need.stream().filter(have::contains).count();
        return (int) Math.round(hit * 100d / need.size());
    }

    // ------------------------------------------------------------------ saved searches

    @Transactional
    public SavedSearch createSavedSearch(OrgMembership me, SavedSearchRequest req) {
        scope.resolve(me, KEY_VIEW);
        Long orgId = me.orgId();
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty()) throw invalid("name", "Give the search a name.");
        if (name.length() > 80) throw invalid("name", "The name is at most 80 characters.");
        Criteria c = clean(req.criteria());
        if (isBlank(c)) throw invalid("criteria", "Choose at least one filter to save.");
        String json;
        try {
            json = mapper.writeValueAsString(c);
            SensitiveContent.check("name", "name", name);
            JsonNode node = mapper.readTree(json);
            SensitiveContent.check("criteria", node);
        } catch (JsonProcessingException e) {
            throw invalid("criteria", "The filters could not be saved.");
        }
        if (json.length() > 2000) throw invalid("criteria", "The filters are too long to save.");
        if (searches.countByOrgIdAndOwnerMemberId(orgId, me.memberId()) >= MAX_SAVED_SEARCHES) {
            throw new OrgException(422, OrgException.CODE_ORG_LIMIT_REACHED, "You can keep up to " + MAX_SAVED_SEARCHES + " saved searches.", Map.of("limit", "savedSearches", "max", MAX_SAVED_SEARCHES));
        }
        MktSavedSearch s = new MktSavedSearch();
        s.setOrgId(orgId);
        s.setOwnerMemberId(me.memberId());
        s.setName(name);
        s.setCriteria(json);
        Instant now = clock.instant();
        s.setCreatedAt(now);
        s.setLastSeenAt(now);
        s = searches.save(s);
        audit.record(me, AUDIT_SEARCH_SAVE, "SAVED_SEARCH", null, String.valueOf(s.getId()), "{\"name\":" + quote(name) + "}");
        return new SavedSearch(s.getId(), s.getName(), c, 0);
    }

    /** The caller looked at this search: "N new" starts counting again from now. Another member's search is a 404. */
    @Transactional
    public void markSeen(OrgMembership me, Long searchId) {
        scope.resolve(me, KEY_VIEW);
        MktSavedSearch s = searches.findByOrgIdAndOwnerMemberIdAndId(me.orgId(), me.memberId(), searchId).orElseThrow(OrgNotFoundException::new);
        s.setLastSeenAt(clock.instant());
        searches.save(s);
    }

    @Transactional
    public void deleteSavedSearch(OrgMembership me, Long searchId) {
        scope.resolve(me, KEY_VIEW);
        long n = searches.deleteByOrgIdAndOwnerMemberIdAndId(me.orgId(), me.memberId(), searchId);
        if (n == 0) throw new OrgNotFoundException();
        audit.record(me, AUDIT_SEARCH_DELETE, "SAVED_SEARCH", null, String.valueOf(searchId), null);
    }

    // ------------------------------------------------------------------ data

    private record Data(List<JobView> views, Map<Long, ClientAccount> clients, List<ClientRequirement> all, Map<Long, List<String>> skills) {}

    private Data load(Long orgId) {
        List<ClientRequirement> all = requirements.findByOrgId(orgId);
        Map<Long, ClientAccount> clients = new HashMap<>();
        for (ClientAccount a : accounts.findByOrgId(orgId)) clients.put(a.getId(), a);
        Map<Long, MktJobMeta> meta = new HashMap<>();
        for (MktJobMeta m : metas.findByOrgId(orgId)) meta.put(m.getRequirementId(), m);
        Map<Long, List<RequirementSkill>> raw = new HashMap<>();
        for (RequirementSkill s : requirementSkills.findByOrgId(orgId)) raw.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s);
        Map<Long, List<String>> skills = new HashMap<>();
        raw.forEach((id, list) -> skills.put(id, list.stream().sorted(Comparator.comparing(RequirementSkill::getSortOrder, Comparator.nullsLast(Comparator.naturalOrder()))).map(RequirementSkill::getSkill).toList()));
        List<JobView> views = new ArrayList<>();
        for (ClientRequirement r : all) {
            ClientAccount c = clients.get(r.getClientId());
            MktJobMeta m = meta.get(r.getId());
            views.add(new JobView(r, c == null ? "" : c.getName(), m == null ? MktJobsLogic.DEFAULT_SOURCE : m.getSourceLabel(), m == null ? MktJobsLogic.DEFAULT_PRIORITY : MktJobsLogic.priority(m.getPriority()), m == null ? null : m.getVisaLabel(), skills.getOrDefault(r.getId(), List.of())));
        }
        return new Data(views, clients, all, skills);
    }

    private static Job toJob(JobView v, Data d, String cap) {
        ClientRequirement r = v.r();
        ClientAccount c = d.clients.get(r.getClientId());
        return new Job(
            r.getId(),
            r.getTitle(),
            new Client(r.getClientId(), v.clientName(), null),
            r.getLocation(),
            r.getWorkMode(),
            MktJobsLogic.rateLabel(r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency()),
            new Rate(r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency()),
            v.source(),
            r.getPostedAt(),
            v.priority(),
            v.visa(),
            v.skills(),
            r.getPositions(),
            r.getStatus(),
            JobDetailMapper.effectiveLevel(r.getDetailLevel(), cap)
        );
    }

    // ------------------------------------------------------------------ tiles and cards

    private Kpis kpis(MktScope.View view, Data d, List<JobView> open, List<MktSavedSearch> mine, Instant now) {
        // New Openings Today: open jobs posted in the last 24 h; vs the 24 h before; sparkline = last 8 days.
        List<Instant> posted = open.stream().map(v -> v.r().getPostedAt()).toList();
        long today = posted.stream().filter(t -> t != null && !t.isBefore(now.minusSeconds(DAY))).count();
        long yesterday = posted.stream().filter(t -> t != null && !t.isBefore(now.minusSeconds(2 * DAY)) && t.isBefore(now.minusSeconds(DAY))).count();
        Tile newToday = new Tile(today, MktJobsLogic.pct(today, yesterday), MktJobsLogic.buckets(posted, now, DAY, 8));

        // High-Match Openings: open jobs with a not-dismissed match >= 90 for a consultant the caller sees; vs the same set posted a week or more ago.
        Map<Long, JobView> openById = new HashMap<>();
        for (JobView v : open) openById.put(v.r().getId(), v);
        Set<Long> high = new HashSet<>();
        for (RequirementMatch m : matches.findByOrgIdAndScoreGreaterThanEqual(me(view), HIGH_MATCH_SCORE)) {
            if (!"DISMISSED".equals(m.getStatus()) && view.sees(m.getConsultantId()) && openById.containsKey(m.getRequirementId())) high.add(m.getRequirementId());
        }
        List<Instant> highPosted = high.stream().map(id -> openById.get(id).r().getPostedAt()).toList();
        long highPrev = highPosted.stream().filter(t -> t != null && !t.isAfter(now.minusSeconds(WEEK))).count();
        Tile highMatch = new Tile(high.size(), MktJobsLogic.pct(high.size(), highPrev), MktJobsLogic.buckets(highPosted, now, WEEK, 8));

        // Jobs Assigned: ASSIGNED match rows for consultants the caller sees; vs a week ago; sparkline = running total at the end of each of the last 8 weeks.
        Set<Long> jobIds = d.all.stream().map(ClientRequirement::getId).collect(Collectors.toSet());
        List<Instant> assignedAt = new ArrayList<>();
        for (RequirementMatch m : matches.findByOrgIdAndStatus(me(view), "ASSIGNED")) {
            if (view.sees(m.getConsultantId()) && jobIds.contains(m.getRequirementId())) assignedAt.add(m.getAssignedAt() != null ? m.getAssignedAt() : m.getCreatedAt());
        }
        long assignedNow = assignedAt.size();
        long assignedPrev = assignedAt.stream().filter(t -> t != null && !t.isAfter(now.minusSeconds(WEEK))).count();
        Tile assigned = new Tile(assignedNow, MktJobsLogic.pct(assignedNow, assignedPrev), MktJobsLogic.cumulative(assignedAt, now, WEEK, 8));

        // Saved Searches: the caller's own; vs a month ago; sparkline = running total by week.
        List<Instant> created = mine.stream().map(MktSavedSearch::getCreatedAt).toList();
        long prevMonth = created.stream().filter(t -> t != null && t.isBefore(now.minus(30, ChronoUnit.DAYS))).count();
        Tile saved = new Tile(mine.size(), MktJobsLogic.pct(mine.size(), prevMonth), MktJobsLogic.cumulative(created, now, WEEK, 8));
        return new Kpis(newToday, highMatch, assigned, saved);
    }

    private static Long me(MktScope.View view) {
        return view.orgId();
    }

    private List<TrendingSkill> trendingSkills(Data d, List<JobView> open, Instant now) {
        class Agg {
            String name;
            int openings;
            long recent;
            long before;
        }
        Map<String, Agg> by = new LinkedHashMap<>();
        Instant t30 = now.minus(30, ChronoUnit.DAYS);
        Instant t60 = now.minus(60, ChronoUnit.DAYS);
        Set<Long> openIds = open.stream().map(v -> v.r().getId()).collect(Collectors.toSet());
        for (JobView v : d.views) {
            Instant at = v.r().getPostedAt();
            for (String skill : v.skills()) {
                String key = skill.trim().toLowerCase(Locale.ROOT);
                Agg a = by.computeIfAbsent(key, k -> {
                    Agg n = new Agg();
                    n.name = skill.trim();
                    return n;
                });
                if (openIds.contains(v.r().getId())) a.openings++;
                if (at != null && !at.isBefore(t30)) a.recent++;
                else if (at != null && !at.isBefore(t60)) a.before++;
            }
        }
        List<Agg> top = by.values().stream().filter(a -> a.openings > 0).sorted(Comparator.<Agg>comparingInt(a -> -a.openings).thenComparing(a -> a.name.toLowerCase(Locale.ROOT))).limit(CARD_MAX).toList();
        int max = top.isEmpty() ? 1 : top.get(0).openings;
        List<TrendingSkill> out = new ArrayList<>();
        for (int i = 0; i < top.size(); i++) {
            Agg a = top.get(i);
            out.add(new TrendingSkill(i + 1, a.name, a.openings, MktJobsLogic.pct(a.recent, a.before), (int) Math.round(a.openings * 100d / max)));
        }
        return out;
    }

    private List<TopClient> topClients(Data d, List<JobView> open, Instant now) {
        Map<Long, List<JobView>> byClient = open.stream().collect(Collectors.groupingBy(v -> v.r().getClientId()));
        Instant t30 = now.minus(30, ChronoUnit.DAYS);
        return byClient.entrySet().stream()
            .sorted(Comparator.<Map.Entry<Long, List<JobView>>>comparingInt(e -> -e.getValue().size()).thenComparing(e -> clientName(d, e.getKey()).toLowerCase(Locale.ROOT)))
            .limit(CARD_MAX)
            .map(e -> {
                long previous = d.views.stream().filter(v -> v.r().getClientId().equals(e.getKey()) && wasOpenAt(v.r(), t30)).count();
                return new TopClient(e.getKey(), clientName(d, e.getKey()), null, e.getValue().size(), topSkills(e.getValue(), 3), MktJobsLogic.pct(e.getValue().size(), previous));
            })
            .toList();
    }

    private static boolean wasOpenAt(ClientRequirement r, Instant at) {
        if (r.getPostedAt() == null || r.getPostedAt().isAfter(at)) return false;
        if ("OPEN".equals(r.getStatus())) return true;
        return ("FILLED".equals(r.getStatus()) || "CLOSED".equals(r.getStatus())) && r.getClosedAt() != null && r.getClosedAt().isAfter(at);
    }

    private static List<String> topSkills(List<JobView> jobs, int n) {
        Map<String, Integer> count = new LinkedHashMap<>();
        Map<String, String> display = new HashMap<>();
        for (JobView v : jobs) {
            for (String s : v.skills()) {
                String k = s.trim().toLowerCase(Locale.ROOT);
                display.putIfAbsent(k, s.trim());
                count.merge(k, 1, Integer::sum);
            }
        }
        return count.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).limit(n).map(e -> display.get(e.getKey())).toList();
    }

    private static String clientName(Data d, Long id) {
        ClientAccount c = d.clients.get(id);
        return c == null ? "" : c.getName();
    }

    private List<Alert> clientAlerts(List<JobView> open, Data d, Instant now) {
        Map<Long, List<JobView>> byClient = open.stream().filter(v -> v.r().getPostedAt() != null && !v.r().getPostedAt().isBefore(now.minusSeconds(WEEK))).collect(Collectors.groupingBy(v -> v.r().getClientId()));
        List<Alert> out = new ArrayList<>();
        for (Map.Entry<Long, List<JobView>> e : byClient.entrySet()) {
            int n = e.getValue().size();
            Instant latest = e.getValue().stream().map(v -> v.r().getPostedAt()).max(Comparator.naturalOrder()).orElse(now);
            String name = clientName(d, e.getKey());
            out.add(new Alert("client-" + e.getKey(), "CLIENT", name + " posted " + n + " new " + (n == 1 ? "role" : "roles"), latest, e.getKey(), null));
        }
        return out;
    }

    private List<Stream> streams(Data d, List<JobView> open, Instant now) {
        Map<Long, List<JobView>> byClient = open.stream().collect(Collectors.groupingBy(v -> v.r().getClientId()));
        return byClient.entrySet().stream()
            .sorted(Comparator.<Map.Entry<Long, List<JobView>>>comparingInt(e -> -e.getValue().size()).thenComparing(e -> clientName(d, e.getKey()).toLowerCase(Locale.ROOT)))
            .limit(5)
            .map(e -> {
                ClientAccount c = d.clients.get(e.getKey());
                String industry = c == null || c.getIndustry() == null || c.getIndustry().isBlank() ? "All Openings" : c.getIndustry();
                int fresh = (int) e.getValue().stream().filter(v -> v.r().getPostedAt() != null && !v.r().getPostedAt().isBefore(now.minusSeconds(WEEK))).count();
                String status = c == null || "ACTIVE".equals(c.getStatus()) ? "Active" : titleCase(c.getStatus());
                return new Stream(e.getKey(), clientName(d, e.getKey()), industry, null, fresh, status);
            })
            .toList();
    }

    private static Facets facets(List<JobView> open) {
        Map<String, Integer> skillCount = new LinkedHashMap<>();
        Map<String, String> display = new HashMap<>();
        Set<String> locations = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        Set<String> visas = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        Set<String> sources = new java.util.TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (JobView v : open) {
            for (String s : v.skills()) {
                String k = s.trim().toLowerCase(Locale.ROOT);
                display.putIfAbsent(k, s.trim());
                skillCount.merge(k, 1, Integer::sum);
            }
            if (v.r().getLocation() != null && !v.r().getLocation().isBlank()) locations.add(v.r().getLocation().trim());
            if (v.visa() != null && !v.visa().isBlank()) visas.add(v.visa());
            if (v.source() != null && !v.source().isBlank()) sources.add(v.source());
        }
        List<String> skills = skillCount.entrySet().stream().sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey())).limit(60).map(e -> display.get(e.getKey())).toList();
        return new Facets(skills, List.copyOf(locations), WORK_TYPES, List.copyOf(visas), List.copyOf(sources));
    }

    // ------------------------------------------------------------------ criteria

    private Criteria parse(String json) {
        try {
            Criteria c = mapper.readValue(json, Criteria.class);
            return clean(c);
        } catch (Exception e) {
            return new Criteria(null, List.of(), null, null, null, null, null, null);
        }
    }

    /** Trim, bound and drop what the filters cannot hold; the saved form never grows past its column. */
    static Criteria clean(Criteria c) {
        if (c == null) return new Criteria(null, List.of(), null, null, null, null, null, null);
        List<String> skills = c.skills() == null ? List.of() : c.skills().stream().filter(s -> s != null && !s.isBlank()).map(s -> cut(s.trim(), 60)).distinct().limit(10).toList();
        String workType = c.workType() == null ? null : c.workType().trim().toUpperCase(Locale.ROOT);
        if (workType != null && !WORK_TYPES.contains(workType)) workType = null;
        return new Criteria(blankNull(c.q(), 200), skills, blankNull(c.location(), 100), workType, blankNull(c.visa(), 40), blankNull(c.source(), 40), rate(c.rateMin()), rate(c.rateMax()));
    }

    private static Integer rate(Integer v) {
        return v == null || v < 0 || v > 10_000 ? null : v;
    }

    private static String blankNull(String s, int max) {
        return s == null || s.isBlank() ? null : cut(s.trim(), max);
    }

    private static String cut(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static boolean isBlank(Criteria c) {
        return c.q() == null && c.skills().isEmpty() && c.location() == null && c.workType() == null && c.visa() == null && c.source() == null && c.rateMin() == null && c.rateMax() == null;
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    private static String titleCase(String s) {
        if (s == null || s.isEmpty()) return "";
        String lower = s.toLowerCase(Locale.ROOT).replace('_', ' ');
        return Character.toUpperCase(lower.charAt(0)) + lower.substring(1);
    }

    private static OrgException invalid(String field, String message) {
        return new OrgException(422, OrgException.CODE_ORG_INVALID, message, Map.of("field", field));
    }
}
