package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsSavedJob;
import com.dossier.api.domain.ent.consultantws.CwsSavedSearch;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.ConsultantSkill;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.domain.ent.talent.RequirementSkill;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.repository.ent.consultantws.CwsJobSearchRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedJobRepository;
import com.dossier.api.repository.ent.consultantws.CwsSavedSearchRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantSkillRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.repository.ent.talent.RequirementSkillRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationRepository;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Chip;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Detail;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Filters;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.FilterOptions;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Job;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Me;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Option;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.Overview;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.RecentSearch;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.SavedJobResult;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.SavedSearch;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.SearchResponse;
import com.dossier.api.service.ent.consultantws.JobDiscoveryDTO.TrendingSkill;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Job Discovery for the signed-in consultant (docs/enterprise-v2/page-consultant-job-discovery.md). The caller is resolved by
 * {@link ConsultantHomeService#requireSelf} (permission {@code opportunities.respond}, own {@code consultant_profile}; anyone else
 * and any other tenant gets the generic 404). The search runs in the database over OPEN jobs of the caller's organization only, with
 * a hard page-size cap; "Best match" and "Recommended" order a bounded candidate window (the newest {@link #CANDIDATE_WINDOW}
 * matching jobs) by the consultant's score in memory, because the score is not a column.
 */
@Service
public class JobDiscoveryService {

    public static final int MAX_PAGE_SIZE = 50;
    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int CANDIDATE_WINDOW = 500;
    public static final int MAX_SAVED_SEARCHES = 10;
    public static final int MAX_RECENT_SEARCHES = 5;
    public static final int FEATURED_DAYS = 7;
    /** A skill's demand change is only reported when the earlier 30 days had at least this many postings (otherwise it is noise). */
    public static final int MIN_PRIOR_POSTINGS = 3;
    /** Trending skills show only when there are at least this many open jobs and skills (honest empty otherwise). */
    public static final int MIN_OPEN_JOBS_FOR_TRENDING = 5;
    public static final int MIN_TRENDING_SKILLS = 3;
    private static final Instant ALL_TIME = Instant.parse("2000-01-01T00:00:00Z");

    private final ConsultantHomeService home;
    private final CwsJobSearchRepository jobs;
    private final RequirementSkillRepository reqSkills;
    private final ConsultantSkillRepository conSkills;
    private final ClientAccountRepository clients;
    private final RequirementMatchRepository matches;
    private final TalentApplicationRepository applications;
    private final CwsSavedJobRepository savedJobs;
    private final CwsSavedSearchRepository searches;
    private final ConsultantWsJobSourceReader sources;
    private final Clock clock;

    @Autowired
    public JobDiscoveryService(
        ConsultantHomeService home,
        CwsJobSearchRepository jobs,
        RequirementSkillRepository reqSkills,
        ConsultantSkillRepository conSkills,
        ClientAccountRepository clients,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        CwsSavedJobRepository savedJobs,
        CwsSavedSearchRepository searches,
        ConsultantWsJobSourceReader sources
    ) {
        this(home, jobs, reqSkills, conSkills, clients, matches, applications, savedJobs, searches, sources, Clock.systemUTC());
    }

    JobDiscoveryService(
        ConsultantHomeService home,
        CwsJobSearchRepository jobs,
        RequirementSkillRepository reqSkills,
        ConsultantSkillRepository conSkills,
        ClientAccountRepository clients,
        RequirementMatchRepository matches,
        TalentApplicationRepository applications,
        CwsSavedJobRepository savedJobs,
        CwsSavedSearchRepository searches,
        ConsultantWsJobSourceReader sources,
        Clock clock
    ) {
        this.home = home;
        this.jobs = jobs;
        this.reqSkills = reqSkills;
        this.conSkills = conSkills;
        this.clients = clients;
        this.matches = matches;
        this.applications = applications;
        this.savedJobs = savedJobs;
        this.searches = searches;
        this.sources = sources;
        this.clock = clock;
    }

    // ---- search -------------------------------------------------------------------------------------------------------------

    /** The normalised filters: lower-cased and LIKE-escaped text, "" / 0 meaning "no filter". */
    record Norm(String q, String loc, String workMode, String employment, String experience, long clientId, String industry, String skill, long minRate) {}

    static String like(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String s = raw.strip().toLowerCase(Locale.ROOT).replace("!", "!!").replace("%", "!%").replace("_", "!_");
        return "%" + s + "%";
    }

    private static String clean(String raw, String field, int max) {
        if (raw == null) return "";
        String t = raw.strip().replaceAll("\\s+", " ");
        if (t.length() > max) throw OrgException.invalid(field, "at most " + max + " characters");
        if (t.chars().anyMatch(Character::isISOControl)) throw OrgException.invalid(field, "contains characters that are not allowed");
        return t;
    }

    static Norm norm(Filters f) {
        Filters x = f == null ? new Filters(null, null, null, null, null, null, null, null, null) : f;
        String loc = clean(x.location(), "location", 120);
        String workMode = clean(x.workMode(), "workMode", 20).toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        // "Remote" typed into the location box means the work mode, not a city called Remote
        if (loc.equalsIgnoreCase("remote")) {
            loc = "";
            if (workMode.isEmpty()) workMode = "REMOTE";
        }
        return new Norm(
            like(clean(x.q(), "q", 120)),
            like(loc),
            workMode,
            clean(x.jobType(), "jobType", 20).toUpperCase(Locale.ROOT),
            clean(x.experience(), "experience", 20).toUpperCase(Locale.ROOT),
            x.clientId() == null || x.clientId() < 0 ? 0 : x.clientId(),
            clean(x.industry(), "industry", 80),
            clean(x.skill(), "skill", 80).toLowerCase(Locale.ROOT),
            x.minRateMinor() == null || x.minRateMinor() < 0 ? 0 : x.minRateMinor()
        );
    }

    private static Sort newest() {
        return Sort.by(Sort.Order.desc("postedAt"), Sort.Order.desc("id"));
    }

    /**
     * @param sort     match (default), newest or rate
     * @param minScore only jobs scoring at least this (the Recommended tab); 0 = everything
     */
    @Transactional(readOnly = true)
    public SearchResponse search(OrgMembership me, Filters filters, String sort, int page, int size, int minScore) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        Norm n = norm(filters);
        String order = "newest".equals(sort) || "rate".equals(sort) ? sort : "match";
        int pg = Math.max(0, page);
        int sz = size <= 0 ? DEFAULT_PAGE_SIZE : Math.min(size, MAX_PAGE_SIZE);
        int floor = Math.max(0, Math.min(100, minScore));
        Instant now = Instant.now(clock);

        List<ClientRequirement> rows;
        long total;
        Scoring scoring = scoring(c);
        if (!"match".equals(order) && floor == 0) {
            Sort s = "rate".equals(order) ? Sort.by(Sort.Order.desc("rateMaxMinor"), Sort.Order.desc("postedAt"), Sort.Order.desc("id")) : newest();
            Page<ClientRequirement> p = jobs.search(org, ALL_TIME, n.q(), n.loc(), n.workMode(), n.employment(), n.experience(), n.clientId(), n.industry(), n.skill(), n.minRate(), PageRequest.of(pg, sz, s));
            rows = p.getContent();
            total = p.getTotalElements();
            return new SearchResponse(org, total, pg, sz, order, cards(c, org, rows, scoring, now));
        }
        // best match / recommended: score a bounded window of the newest matching jobs, then order and page in memory
        Page<ClientRequirement> window = jobs.search(org, ALL_TIME, n.q(), n.loc(), n.workMode(), n.employment(), n.experience(), n.clientId(), n.industry(), n.skill(), n.minRate(), PageRequest.of(0, CANDIDATE_WINDOW, newest()));
        List<Job> all = cards(c, org, window.getContent(), scoring, now);
        List<Job> kept = all.stream().filter(j -> j.score() != null ? j.score() >= floor : floor == 0).collect(Collectors.toList());
        if ("rate".equals(order)) {
            kept.sort(Comparator.comparing((Job j) -> j.rateMaxMinor() == null ? 0L : j.rateMaxMinor()).reversed().thenComparing(Job::postedAt, Comparator.reverseOrder()));
        } else if ("newest".equals(order)) {
            kept.sort(Comparator.comparing(Job::postedAt, Comparator.reverseOrder()).thenComparing(Job::id, Comparator.reverseOrder()));
        } else {
            kept.sort(Comparator.comparing((Job j) -> j.score() == null ? -1 : j.score()).reversed().thenComparing(Job::postedAt, Comparator.reverseOrder()).thenComparing(Job::id, Comparator.reverseOrder()));
        }
        total = floor == 0 ? window.getTotalElements() : kept.size();
        int from = (int) Math.min((long) pg * sz, kept.size());
        int to = Math.min(from + sz, kept.size());
        return new SearchResponse(org, total, pg, sz, order, kept.subList(from, to));
    }

    /** The consultant's lower-cased skill set (the basis of the computed score). */
    private record Scoring(Set<String> mine) {}

    private Scoring scoring(ConsultantProfile c) {
        Set<String> mine = conSkills.findByOrgIdAndConsultantIdOrderBySortOrderAsc(c.getOrgId(), c.getId()).stream()
            .map(ConsultantSkill::getSkill).filter(Objects::nonNull).map(s -> s.toLowerCase(Locale.ROOT)).collect(Collectors.toSet());
        return new Scoring(mine);
    }

    private List<Job> cards(ConsultantProfile c, Long org, List<ClientRequirement> rows, Scoring scoring, Instant now) {
        if (rows.isEmpty()) return new ArrayList<>();
        List<Long> ids = rows.stream().map(ClientRequirement::getId).toList();
        Map<Long, List<String>> skillsByReq = new HashMap<>();
        for (int i = 0; i < ids.size(); i += 200) {
            for (RequirementSkill s : reqSkills.findByOrgIdAndRequirementIdIn(org, ids.subList(i, Math.min(i + 200, ids.size())))) {
                skillsByReq.computeIfAbsent(s.getRequirementId(), k -> new ArrayList<>()).add(s.getSkill());
            }
        }
        Set<Long> clientIds = rows.stream().map(ClientRequirement::getClientId).collect(Collectors.toSet());
        Map<Long, ClientAccount> clientById = clients.findAllById(clientIds).stream().filter(a -> org.equals(a.getOrgId())).collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        Map<Long, RequirementMatch> myMatch = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId()).stream().collect(Collectors.toMap(RequirementMatch::getRequirementId, Function.identity(), (a, b) -> a));
        Map<Long, TalentApplication> myApp = applications.findByOrgIdAndConsultantId(org, c.getId()).stream().collect(Collectors.toMap(TalentApplication::getRequirementId, Function.identity(), (a, b) -> a));
        Map<Long, ConsultantWsJobSourceReader.Info> sourceInfo = sources.load(org, ids);
        Set<Long> saved = savedJobs.findByOrgIdAndConsultantIdOrderByCreatedAtDesc(org, c.getId()).stream().map(CwsSavedJob::getRequirementId).collect(Collectors.toSet());
        Instant featuredSince = now.minus(Duration.ofDays(FEATURED_DAYS));
        List<Job> out = new ArrayList<>(rows.size());
        for (ClientRequirement r : rows) out.add(card(r, skillsByReq.getOrDefault(r.getId(), List.of()), clientById.get(r.getClientId()), myMatch.get(r.getId()), myApp.get(r.getId()), saved.contains(r.getId()), scoring, featuredSince, ConsultantWsJobSourceReader.orNone(sourceInfo, r.getId())));
        return out;
    }

    private static Job card(ClientRequirement r, List<String> skills, ClientAccount client, RequirementMatch match, TalentApplication app, boolean saved, Scoring scoring, Instant featuredSince, ConsultantWsJobSourceReader.Info src) {
        int total = skills.size();
        int have = (int) skills.stream().filter(s -> s != null && scoring.mine().contains(s.toLowerCase(Locale.ROOT))).count();
        Integer score = null;
        String source = null;
        if (match != null && match.getScore() != null) {
            score = Math.max(0, Math.min(100, match.getScore()));
            source = "MATCH";
        } else if (total > 0 && !scoring.mine().isEmpty()) {
            score = (int) Math.round(100.0 * have / total);
            source = "SKILLS";
        }
        String relation = app != null ? "APPLIED" : match != null && "ASSIGNED".equals(match.getStatus()) ? "ASSIGNED" : match != null ? "MATCHED" : "NONE";
        return new Job(
            r.getId(), r.getTitle(), r.getClientId(), client == null ? null : client.getName(), client == null ? null : client.getIndustry(), r.getLocation(), r.getWorkMode(),
            r.getEmploymentLabel(), r.getDurationLabel(), r.getExperienceLevel(), r.getRateMinMinor(), r.getRateMaxMinor(), r.getRateUnit(), r.getCurrency(), skills, r.getPostedAt(),
            r.getPostedAt() != null && !r.getPostedAt().isBefore(featuredSince), saved, score, source, have, total, relation, app == null ? null : app.getStage(),
            src.sourceUrl(), src.sourceName(), src.quickInfo(), src.sample()
        );
    }

    // ---- one job ------------------------------------------------------------------------------------------------------------

    /** A job's detail: the card (with the marketer's quick info and source link), the marketer's job notes and the open positions. An OPEN job of this organization; a closed one only when the consultant has a match or application on it. */
    @Transactional(readOnly = true)
    public Detail detail(OrgMembership me, Long requirementId) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        ClientRequirement r = visibleJob(c, org, requirementId);
        Job job = cards(c, org, List.of(r), scoring(c), Instant.now(clock)).get(0);
        int open = Math.max(0, (r.getPositions() == null ? 1 : r.getPositions()) - (r.getFilled() == null ? 0 : r.getFilled()));
        return new Detail(job, r.getDescriptionText(), open);
    }

    private ClientRequirement visibleJob(ConsultantProfile c, Long org, Long id) {
        if (id == null) throw new OrgNotFoundException();
        ClientRequirement r = jobs.byId(org, id).stream().findFirst().orElseThrow(OrgNotFoundException::new);
        if (!"OPEN".equals(r.getStatus())) {
            boolean related = matches.findByOrgIdAndConsultantIdOrderByScoreDesc(org, c.getId()).stream().anyMatch(m -> id.equals(m.getRequirementId()))
                || applications.findByOrgIdAndConsultantId(org, c.getId()).stream().anyMatch(a -> id.equals(a.getRequirementId()));
            if (!related) throw new OrgNotFoundException();
        }
        return r;
    }

    // ---- save a job ---------------------------------------------------------------------------------------------------------

    @Transactional
    public SavedJobResult saveJob(OrgMembership me, Long requirementId) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        visibleJob(c, org, requirementId);
        if (savedJobs.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), requirementId).isEmpty()) {
            CwsSavedJob row = new CwsSavedJob();
            row.setOrgId(org);
            row.setConsultantId(c.getId());
            row.setRequirementId(requirementId);
            row.setCreatedAt(Instant.now(clock));
            savedJobs.save(row);
        }
        return new SavedJobResult(requirementId, true);
    }

    @Transactional
    public SavedJobResult unsaveJob(OrgMembership me, Long requirementId) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        if (requirementId == null || jobs.byId(org, requirementId).isEmpty()) throw new OrgNotFoundException();
        savedJobs.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), requirementId).ifPresent(savedJobs::delete);
        return new SavedJobResult(requirementId, false);
    }

    // ---- saved and recent searches ------------------------------------------------------------------------------------------

    private static String orNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }

    /** Validates and PII-scans every free-text field of a search; throws 422 on a bad value. */
    private Filters cleanFilters(Filters f) {
        if (f == null) throw OrgException.invalid("filters", "required");
        String q = clean(f.q(), "q", 120);
        String location = clean(f.location(), "location", 120);
        String jobType = clean(f.jobType(), "jobType", 20);
        String workMode = clean(f.workMode(), "workMode", 20);
        String experience = clean(f.experience(), "experience", 20);
        String industry = clean(f.industry(), "industry", 80);
        String skill = clean(f.skill(), "skill", 80);
        for (String[] kv : new String[][] { { "q", q }, { "location", location }, { "jobType", jobType }, { "workMode", workMode }, { "experience", experience }, { "industry", industry }, { "skill", skill } }) {
            if (!kv[1].isEmpty()) SensitiveContent.check(kv[0], kv[0], kv[1]);
        }
        Long clientId = f.clientId() != null && f.clientId() > 0 ? f.clientId() : null;
        Long minRate = f.minRateMinor() != null && f.minRateMinor() > 0 ? f.minRateMinor() : null;
        return new Filters(orNull(q), orNull(location), orNull(jobType), orNull(workMode), orNull(experience), orNull(industry), orNull(skill), clientId, minRate);
    }

    private static boolean empty(Filters f) {
        return f.q() == null && f.location() == null && f.jobType() == null && f.workMode() == null && f.experience() == null && f.industry() == null && f.skill() == null && f.clientId() == null && f.minRateMinor() == null;
    }

    private static Filters filtersOf(CwsSavedSearch s) {
        return new Filters(s.getKeyword(), s.getLocation(), s.getJobType(), s.getWorkMode(), s.getExperience(), s.getIndustry(), s.getSkill(), s.getClientId(), s.getMinRateMinor());
    }

    private static void apply(CwsSavedSearch s, Filters f) {
        s.setKeyword(f.q());
        s.setLocation(f.location());
        s.setJobType(f.jobType());
        s.setWorkMode(f.workMode());
        s.setExperience(f.experience());
        s.setIndustry(f.industry());
        s.setSkill(f.skill());
        s.setClientId(f.clientId());
        s.setMinRateMinor(f.minRateMinor());
    }

    private long newResults(Long org, CwsSavedSearch s) {
        Norm n = norm(filtersOf(s));
        return jobs.countSearch(org, s.getLastUsedAt(), n.q(), n.loc(), n.workMode(), n.employment(), n.experience(), n.clientId(), n.industry(), n.skill(), n.minRate());
    }

    private SavedSearch savedOf(Long org, CwsSavedSearch s) {
        return new SavedSearch(s.getId(), s.getName(), filtersOf(s), newResults(org, s), s.getCreatedAt(), s.getLastUsedAt());
    }

    @Transactional
    public SavedSearch createSavedSearch(OrgMembership me, String name, Filters filters) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        String nm = clean(name, "name", 80);
        if (nm.isEmpty()) throw OrgException.invalid("name", "required");
        SensitiveContent.check("name", "name", nm);
        Filters f = cleanFilters(filters);
        if (empty(f)) throw OrgException.invalid("filters", "choose at least one filter or search term");
        List<CwsSavedSearch> mine = searches.findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(org, c.getId(), CwsSavedSearch.SAVED);
        if (mine.size() >= MAX_SAVED_SEARCHES) throw OrgException.limitReached("saved searches", MAX_SAVED_SEARCHES);
        if (mine.stream().anyMatch(s -> nm.equalsIgnoreCase(s.getName()))) throw OrgException.coded(409, "SAVED_SEARCH_EXISTS", "You already have a saved search with that name", Map.of());
        CwsSavedSearch row = new CwsSavedSearch();
        row.setOrgId(org);
        row.setConsultantId(c.getId());
        row.setKind(CwsSavedSearch.SAVED);
        row.setName(nm);
        apply(row, f);
        Instant now = Instant.now(clock);
        row.setCreatedAt(now);
        row.setLastUsedAt(now);
        searches.save(row);
        return savedOf(org, row);
    }

    @Transactional
    public void deleteSavedSearch(OrgMembership me, Long id) {
        ConsultantProfile c = home.requireSelf(me);
        CwsSavedSearch s = searches.findByOrgIdAndConsultantIdAndIdAndKind(c.getOrgId(), c.getId(), id, CwsSavedSearch.SAVED).orElseThrow(OrgNotFoundException::new);
        searches.delete(s);
    }

    /** Marks a saved search as seen: its "new results" counter restarts from now. */
    @Transactional
    public SavedSearch viewSavedSearch(OrgMembership me, Long id) {
        ConsultantProfile c = home.requireSelf(me);
        CwsSavedSearch s = searches.findByOrgIdAndConsultantIdAndIdAndKind(c.getOrgId(), c.getId(), id, CwsSavedSearch.SAVED).orElseThrow(OrgNotFoundException::new);
        s.setLastUsedAt(Instant.now(clock));
        searches.save(s);
        return savedOf(c.getOrgId(), s);
    }

    /** Remembers a search the consultant ran: the latest {@value #MAX_RECENT_SEARCHES}, the same search never twice (it moves to the top). */
    @Transactional
    public RecentSearch recordRecent(OrgMembership me, Filters filters) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        Filters f = cleanFilters(filters);
        if (empty(f)) throw OrgException.invalid("filters", "nothing to remember");
        Instant now = Instant.now(clock);
        List<CwsSavedSearch> recent = new ArrayList<>(searches.findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(org, c.getId(), CwsSavedSearch.RECENT));
        CwsSavedSearch hit = recent.stream().filter(s -> sameSearch(filtersOf(s), f)).findFirst().orElse(null);
        if (hit == null) {
            hit = new CwsSavedSearch();
            hit.setOrgId(org);
            hit.setConsultantId(c.getId());
            hit.setKind(CwsSavedSearch.RECENT);
            hit.setCreatedAt(now);
            apply(hit, f);
            recent.add(0, hit);
        }
        apply(hit, f); // the latest spelling wins ("Four" after "four")
        hit.setLastUsedAt(now);
        searches.save(hit);
        recent.sort(Comparator.comparing(CwsSavedSearch::getLastUsedAt).reversed());
        for (int i = MAX_RECENT_SEARCHES; i < recent.size(); i++) if (recent.get(i).getId() != null) searches.delete(recent.get(i));
        return new RecentSearch(hit.getId(), label(f), f, now);
    }

    private static boolean sameSearch(Filters a, Filters b) {
        return Objects.equals(key(a.q()), key(b.q())) && Objects.equals(key(a.location()), key(b.location())) && Objects.equals(key(a.jobType()), key(b.jobType()))
            && Objects.equals(key(a.workMode()), key(b.workMode())) && Objects.equals(key(a.experience()), key(b.experience())) && Objects.equals(key(a.industry()), key(b.industry()))
            && Objects.equals(key(a.skill()), key(b.skill())) && Objects.equals(a.clientId(), b.clientId()) && Objects.equals(a.minRateMinor(), b.minRateMinor());
    }

    private static String key(String s) {
        return s == null ? null : s.toLowerCase(Locale.ROOT);
    }

    /** "Data Engineer, Remote" style label of a search. */
    static String label(Filters f) {
        List<String> parts = new ArrayList<>();
        for (String s : new String[] { f.q(), f.skill(), f.location(), f.workMode() == null ? null : pretty(f.workMode()), f.jobType() == null ? null : pretty(f.jobType()), f.experience() == null ? null : pretty(f.experience()), f.industry() }) {
            if (s != null && !s.isBlank()) parts.add(s);
        }
        if (f.clientId() != null) parts.add("Client");
        if (f.minRateMinor() != null) parts.add("$" + (f.minRateMinor() / 100) + "+/hr");
        return parts.isEmpty() ? "All jobs" : String.join(", ", parts);
    }

    static String pretty(String enumName) {
        String t = enumName.toLowerCase(Locale.ROOT).replace('_', ' ');
        return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1);
    }

    // ---- overview (filters, chips, trending, saved and recent searches) -----------------------------------------------------

    @Transactional(readOnly = true)
    public Overview overview(OrgMembership me) {
        ConsultantProfile c = home.requireSelf(me);
        Long org = c.getOrgId();
        Instant now = Instant.now(clock);
        long open = jobs.countOpen(org);

        // filter options come from what is actually open
        List<Object[]> clientCounts = jobs.openClientCounts(org);
        Map<Long, ClientAccount> clientById = clients.findAllById(clientCounts.stream().map(o -> (Long) o[0]).toList()).stream().filter(a -> org.equals(a.getOrgId())).collect(Collectors.toMap(ClientAccount::getId, Function.identity()));
        List<Option> clientOptions = clientCounts.stream()
            .filter(o -> clientById.containsKey((Long) o[0]))
            .map(o -> new Option(String.valueOf(o[0]), clientById.get((Long) o[0]).getName(), ((Number) o[1]).longValue()))
            .sorted(Comparator.comparing(Option::label, String.CASE_INSENSITIVE_ORDER)).toList();
        Map<String, Long> industryCounts = new LinkedHashMap<>();
        for (Object[] o : clientCounts) {
            ClientAccount a = clientById.get((Long) o[0]);
            if (a != null && a.getIndustry() != null && !a.getIndustry().isBlank()) industryCounts.merge(a.getIndustry(), ((Number) o[1]).longValue(), Long::sum);
        }
        List<Option> industryOptions = industryCounts.entrySet().stream().sorted(Map.Entry.comparingByKey(String.CASE_INSENSITIVE_ORDER)).map(e -> new Option(e.getKey(), e.getKey(), e.getValue())).toList();
        Map<String, Long> workCounts = jobs.openWorkModeCounts(org).stream().collect(Collectors.toMap(o -> (String) o[0], o -> ((Number) o[1]).longValue()));
        Map<String, Long> empCounts = jobs.openEmploymentCounts(org).stream().collect(Collectors.toMap(o -> (String) o[0], o -> ((Number) o[1]).longValue()));
        List<Object[]> demand = jobs.openSkillDemand(org, PageRequest.of(0, 40));
        FilterOptions options = new FilterOptions(
            empCounts.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e -> new Option(e.getKey(), e.getKey(), e.getValue())).toList(),
            jobs.openExperienceLevels(org).stream().sorted().map(v -> new Option(v, v, null)).toList(),
            workCounts.entrySet().stream().sorted(Map.Entry.comparingByKey()).map(e -> new Option(e.getKey(), e.getKey(), e.getValue())).toList(),
            industryOptions,
            clientOptions,
            demand.stream().map(o -> new Option((String) o[0], (String) o[0], ((Number) o[1]).longValue())).toList()
        );

        List<Chip> chips = recommended(c, org, workCounts, empCounts, industryCounts, demand);
        List<TrendingSkill> trending = trending(org, now, open, demand);

        List<SavedSearch> saved = searches.findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(org, c.getId(), CwsSavedSearch.SAVED).stream().map(s -> savedOf(org, s)).toList();
        List<RecentSearch> recent = searches.findByOrgIdAndConsultantIdAndKindOrderByLastUsedAtDescIdDesc(org, c.getId(), CwsSavedSearch.RECENT).stream()
            .limit(MAX_RECENT_SEARCHES).map(s -> new RecentSearch(s.getId(), label(filtersOf(s)), filtersOf(s), s.getLastUsedAt())).toList();
        return new Overview(org, now, new Me(c.getId(), c.getDisplayName()), open, options, chips, trending, saved, recent);
    }

    /** Chips derived from the profile (preferred work mode, own skills) and from what is common among open jobs. */
    private List<Chip> recommended(ConsultantProfile c, Long org, Map<String, Long> workCounts, Map<String, Long> empCounts, Map<String, Long> industryCounts, List<Object[]> demand) {
        List<Chip> out = new ArrayList<>();
        String mode = c.getWorkMode();
        if (mode != null && workCounts.getOrDefault(mode, 0L) > 0) {
            out.add(new Chip("workMode:" + mode, "REMOTE".equals(mode) ? "Remote Friendly" : pretty(mode), "workMode", mode, "profile"));
        }
        empCounts.entrySet().stream().max(Map.Entry.comparingByValue()).ifPresent(e -> out.add(new Chip("jobType:" + e.getKey(), pretty(e.getKey()), "jobType", e.getKey(), "market")));
        List<Long> floors = jobs.openHourlyRateFloors(org);
        if (floors.size() >= 3) {
            long median = floors.get(floors.size() / 2);
            long dollars = (median / 100 / 5) * 5;
            if (dollars > 0) out.add(new Chip("minRate:" + dollars, "$" + dollars + "+/hr", "minRate", String.valueOf(dollars * 100), "market"));
        }
        Set<String> mine = scoring(c).mine();
        int added = 0;
        for (Object[] o : demand) {
            String skill = (String) o[0];
            if (mine.contains(skill.toLowerCase(Locale.ROOT)) && added < 4) {
                out.add(new Chip("skill:" + skill.toLowerCase(Locale.ROOT), skill, "skill", skill, "profile"));
                added++;
            }
        }
        if (added == 0) {
            for (Object[] o : demand.stream().limit(3).toList()) {
                String skill = (String) o[0];
                out.add(new Chip("skill:" + skill.toLowerCase(Locale.ROOT), skill, "skill", skill, "market"));
            }
        }
        industryCounts.entrySet().stream().max(Map.Entry.comparingByValue()).ifPresent(e -> out.add(new Chip("industry:" + e.getKey(), e.getKey(), "industry", e.getKey(), "market")));
        return out.size() > 8 ? out.subList(0, 8) : out;
    }

    /** Demand for the most-requested open skills, with the change in postings over the last 30 days vs the 30 days before. Empty when there is too little data. */
    private List<TrendingSkill> trending(Long org, Instant now, long open, List<Object[]> demand) {
        if (open < MIN_OPEN_JOBS_FOR_TRENDING || demand.size() < MIN_TRENDING_SKILLS) return List.of();
        Instant d30 = now.minus(Duration.ofDays(30));
        Instant d60 = now.minus(Duration.ofDays(60));
        Map<String, Long> recent = jobs.postingsBySkill(org, d30, now.plusSeconds(1)).stream().collect(Collectors.toMap(o -> (String) o[0], o -> ((Number) o[1]).longValue()));
        Map<String, Long> prior = jobs.postingsBySkill(org, d60, d30).stream().collect(Collectors.toMap(o -> (String) o[0], o -> ((Number) o[1]).longValue()));
        List<TrendingSkill> out = new ArrayList<>();
        for (Object[] o : demand.stream().limit(5).toList()) {
            String skill = (String) o[0];
            long r = recent.getOrDefault(skill, 0L);
            long p = prior.getOrDefault(skill, 0L);
            Double change = p >= MIN_PRIOR_POSTINGS ? Math.round(1000.0 * (r - p) / p) / 10.0 : null;
            out.add(new TrendingSkill(skill, ((Number) o[1]).longValue(), r, p, change));
        }
        return out;
    }
}
