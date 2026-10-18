package com.dossier.api.service.jobs;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.JobFeedback;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.JobFeedbackRepository;
import com.dossier.api.repository.JobMatchRepository;
import com.dossier.api.repository.JobPostingCard;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.JobPostingSearchRepository;
import com.dossier.api.repository.JobPostingSearchRepository.Filters;
import com.dossier.api.repository.JobPostingSearchRepository.Hit;
import com.dossier.api.repository.JobPostingSearchRepository.Terms;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.EntitlementService;
import com.dossier.api.service.JobMatchService;
import com.dossier.api.service.ApplicationPatchService;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ResumeDocException;
import com.dossier.api.service.TrackerUsers;
import com.dossier.api.service.dto.JobDTOs.FeedbackResult;
import com.dossier.api.service.dto.JobDTOs.JobCard;
import com.dossier.api.service.dto.JobDTOs.JobCardMatch;
import com.dossier.api.service.dto.JobDTOs.JobCardSource;
import com.dossier.api.service.dto.JobDTOs.JobDetail;
import com.dossier.api.service.dto.JobDTOs.JobExplain;
import com.dossier.api.service.dto.JobDTOs.JobFacets;
import com.dossier.api.service.dto.JobDTOs.JobRelax;
import com.dossier.api.service.dto.JobDTOs.JobSearchPage;
import com.dossier.api.service.dto.ListQuery;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Job search over the posting store we already have (E2E-U4.0; docs/design/user/job-search-matching.md section 5).
 * The postings are the ones the nightly board read stores (Greenhouse, Lever, Ashby public job-board APIs): nothing
 * here fetches or scrapes anything. The same search serves Free and Pro; Pro additionally sees the nightly match
 * score on a card (never computed in a request).
 *
 * <p>What a search does: parses the text ({@link JobQueryParser}), asks {@link JobPostingSearchRepository} for matching
 * ids (FULLTEXT, then word-start LIKE for short words), ranks the best-match pool in Java ({@link JobRanker}) or orders
 * by newest, slices the page, and answers cards plus counts, facets and, when little matched, cheaper searches to try.
 * It never returns a posting the user hid or already applied to. Every limit is a {@code jobs.*} setting.
 */
@Service
@Transactional(readOnly = true)
public class JobSearchService {

    public static final String SORT_BEST = "best";
    public static final String SORT_NEWEST = "newest";
    public static final String CODE_INVALID = "JOB_SEARCH_INVALID";
    public static final String CODE_GONE = "JOB_GONE";

    private static final Set<String> REMOTE_VALUES = Set.of("REMOTE", "HYBRID", "ONSITE");

    /** The request, as the controller read it (all optional). */
    public record Request(String q, String loc, String remote, String type, Integer posted, String company, String sort, Integer page, Integer size, boolean explain) {}

    private record Suggested(Instant expires, List<String> titles) {}

    private final JobPostingRepository postings;
    private final JobPostingSearchRepository search;
    private final JobFeedbackRepository feedback;
    private final ApplicationRepository applications;
    private final JobMatchRepository matches;
    private final ResumeRepository resumes;
    private final BioRepository bios;
    private final EntitlementService entitlement;
    private final ResumeBuilderSettings settings;
    private final TrackerUsers users;
    private final JobMatchService matchService;
    private final ApplicationPatchService patchService;
    private final ObjectMapper om;
    private final Clock clock;
    private final Map<String, Suggested> suggestCache = new ConcurrentHashMap<>();

    @Autowired
    public JobSearchService(
        JobPostingRepository postings,
        JobPostingSearchRepository search,
        JobFeedbackRepository feedback,
        ApplicationRepository applications,
        JobMatchRepository matches,
        ResumeRepository resumes,
        BioRepository bios,
        EntitlementService entitlement,
        ResumeBuilderSettings settings,
        TrackerUsers users,
        JobMatchService matchService,
        ApplicationPatchService patchService,
        ObjectMapper om
    ) {
        this(postings, search, feedback, applications, matches, resumes, bios, entitlement, settings, users, matchService, patchService, om, Clock.systemUTC());
    }

    JobSearchService(
        JobPostingRepository postings,
        JobPostingSearchRepository search,
        JobFeedbackRepository feedback,
        ApplicationRepository applications,
        JobMatchRepository matches,
        ResumeRepository resumes,
        BioRepository bios,
        EntitlementService entitlement,
        ResumeBuilderSettings settings,
        TrackerUsers users,
        JobMatchService matchService,
        ApplicationPatchService patchService,
        ObjectMapper om,
        Clock clock
    ) {
        this.postings = postings;
        this.search = search;
        this.feedback = feedback;
        this.applications = applications;
        this.matches = matches;
        this.resumes = resumes;
        this.bios = bios;
        this.entitlement = entitlement;
        this.settings = settings;
        this.users = users;
        this.matchService = matchService;
        this.patchService = patchService;
        this.om = om;
        this.clock = clock;
    }

    // ---- search -------------------------------------------------------------------------------

    public JobSearchPage search(Request r) {
        long started = System.nanoTime();
        User user = users.current();
        Instant now = Instant.now(clock);

        ListQuery.Limits limits = new ListQuery.Limits(
            settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_DEFAULT_SIZE),
            settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_SIZE),
            settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_QUERY_CHARS)
        );
        ListQuery lq = ListQuery.parse(r.page(), r.size(), r.sort(), r.q(), List.of(SORT_BEST, SORT_NEWEST), SORT_BEST, limits);
        int ftMin = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_FT_MIN_TOKEN);
        JobQueryParser.Parsed parsed = JobQueryParser.parse(lq.q(), ftMin);
        Terms terms = new Terms(parsed.booleanQuery(), parsed.likeIncludes(), parsed.likeExcludes());
        List<Integer> postedChoices = postedChoices();
        Filters filters = filters(r, postedChoices);
        boolean newest = SORT_NEWEST.equals(lq.sortField());
        int maxResults = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_RESULTS);

        long rawTotal = search.count(user.getId(), terms, filters, now, maxResults + 1);
        boolean capped = rawTotal > maxResults;
        long total = Math.min(rawTotal, maxResults);

        List<JobPostingCard> pageCards;
        Map<Long, JobRanker.Scored> scored = new HashMap<>();
        int offset = (int) Math.min(lq.offset(), Integer.MAX_VALUE);
        if (offset >= maxResults || offset >= total) {
            pageCards = List.of();
        } else if (newest) {
            List<Hit> hits = search.hits(user.getId(), terms, filters, now, true, offset, Math.min(lq.size(), maxResults - offset));
            pageCards = cardsInOrder(hits);
        } else {
            int pool = Math.min(maxResults, Math.max(settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_RANK_POOL), offset + lq.size()));
            List<Hit> hits = search.hits(user.getId(), terms, filters, now, false, 0, pool);
            Map<Long, JobPostingCard> byId = cardMap(hits);
            List<JobRanker.Candidate> cands = new ArrayList<>(hits.size());
            for (Hit h : hits) {
                JobPostingCard c = byId.get(h.id());
                if (c != null) cands.add(new JobRanker.Candidate(c, h.relevance()));
            }
            List<JobRanker.Scored> ranked = JobRanker.rank(
                cands,
                parsed.booleanQuery() != null,
                !parsed.likeIncludes().isEmpty(),
                preferences(user),
                weights(),
                now
            );
            int to = Math.min(ranked.size(), offset + lq.size());
            List<JobRanker.Scored> slice = offset >= to ? List.of() : ranked.subList(offset, to);
            pageCards = slice.stream().map(JobRanker.Scored::card).toList();
            slice.forEach(s -> scored.put(s.card().id(), s));
        }

        boolean admin = SecurityUtils.hasCurrentUserThisAuthority(AuthoritiesConstants.ADMIN);
        List<JobCard> items = toCards(user, pageCards, r.explain() && admin ? scored : Map.of());

        JobFacets facets = facets(user.getId(), terms, filters, now, postedChoices);
        List<JobRelax> suggestions = total < settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_RELAX_BELOW)
            ? relaxations(user.getId(), r, parsed, filters, now, total, postedChoices)
            : List.of();
        long tookMs = (System.nanoTime() - started) / 1_000_000L; // config-literal-ok: nanoseconds to milliseconds
        return new JobSearchPage(items, total, lq.page(), lq.size(), capped, tookMs, facets, suggestions);
    }

    private Filters filters(Request r, List<Integer> postedChoices) {
        int maxChars = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_FILTER_CHARS);
        String loc = text("loc", r.loc(), maxChars);
        String company = text("company", r.company(), maxChars);
        String remote = r.remote() == null ? "" : r.remote().trim().toUpperCase(Locale.ROOT);
        if (!remote.isEmpty() && !remote.equals("ANY") && !REMOTE_VALUES.contains(remote)) {
            throw invalid("remote", "use ANY, REMOTE, HYBRID or ONSITE");
        }
        Set<String> types = new LinkedHashSet<>();
        if (r.type() != null && !r.type().isBlank()) {
            for (String t : r.type().split(",")) {
                String v = t.trim().toUpperCase(Locale.ROOT);
                if (v.isEmpty()) continue;
                if (!JobTypes.ALL.contains(v)) throw invalid("type", "'" + t.trim() + "' is not one of " + String.join(", ", JobTypes.ALL));
                types.add(v);
            }
        }
        Integer posted = r.posted();
        if (posted != null && !postedChoices.contains(posted)) throw invalid("posted", "use one of " + postedChoices);
        return new Filters(loc, remote.isEmpty() || remote.equals("ANY") ? null : remote, types, posted, company);
    }

    private static String text(String path, String raw, int max) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) return null;
        if (s.length() > max) throw invalid(path, "is longer than " + max + " characters");
        return s;
    }

    private static ResumeDocException invalid(String path, String message) {
        return new ResumeDocException(422, CODE_INVALID, path + ": " + message, Map.of("path", path, "message", message));
    }

    private List<Integer> postedChoices() {
        List<Integer> days = new ArrayList<>();
        settings.getJson(ResumeBuilderSettingKeys.JOBS_SEARCH_POSTED_DAYS, com.fasterxml.jackson.databind.JsonNode.class).forEach(n -> days.add(n.asInt()));
        days.sort(Comparator.naturalOrder());
        return days;
    }

    private JobRanker.Weights weights() {
        return new JobRanker.Weights(
            settings.getDecimal(ResumeBuilderSettingKeys.JOBS_RANK_WEIGHT_RELEVANCE),
            settings.getDecimal(ResumeBuilderSettingKeys.JOBS_RANK_WEIGHT_RECENCY),
            settings.getDecimal(ResumeBuilderSettingKeys.JOBS_RANK_WEIGHT_PREFERENCE),
            settings.getInt(ResumeBuilderSettingKeys.JOBS_RANK_RECENCY_HOURS)
        );
    }

    /** What the ranking compares the person with: their profile answers and default resume (no form), until they set their own. */
    JobRanker.Prefs preferences(User user) {
        String bio = bios.findByUserId(user.getId()).stream().findFirst().map(Bio::getPayload).orElse(null);
        Optional<Resume> resume = resumes
            .findByUserId(user.getId())
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .min(
                Comparator.comparing((Resume r) -> Boolean.TRUE.equals(r.getDefaultResume()) ? 0 : 1)
                    .thenComparing(Resume::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
            );
        MatchPreferences m = MatchPreferences.from(bio, resume.map(Resume::getParsedJson).orElse(null), LocalDate.ofInstant(Instant.now(clock), ZoneOffset.UTC));
        return JobRanker.Prefs.of(m);
    }

    // ---- cards ---------------------------------------------------------------------------------

    private Map<Long, JobPostingCard> cardMap(List<Hit> hits) {
        if (hits.isEmpty()) return Map.of();
        Map<Long, JobPostingCard> out = new HashMap<>();
        for (JobPostingCard c : postings.cards(hits.stream().map(Hit::id).toList())) out.put(c.id(), c);
        return out;
    }

    private List<JobPostingCard> cardsInOrder(List<Hit> hits) {
        Map<Long, JobPostingCard> byId = cardMap(hits);
        List<JobPostingCard> out = new ArrayList<>(hits.size());
        for (Hit h : hits) if (byId.containsKey(h.id())) out.add(byId.get(h.id()));
        return out;
    }

    private List<JobCard> toCards(User user, List<JobPostingCard> cards, Map<Long, JobRanker.Scored> explain) {
        if (cards.isEmpty()) return List.of();
        List<Long> ids = cards.stream().map(JobPostingCard::id).toList();
        Set<Long> saved = new LinkedHashSet<>(applications.trackedPostingIds(user.getId(), ids));
        Map<Long, JobCardMatch> match = new HashMap<>();
        if (entitlement.has(user.getLogin(), com.dossier.api.service.entitlement.FeatureKeys.AI_JOB_MATCHING)) {
            for (Object[] row : matches.scoresFor(user.getId(), ids, JobMatchService.SHOW_SCORE)) {
                match.put(((Number) row[0]).longValue(), new JobCardMatch(((Number) row[1]).intValue(), (String) row[2]));
            }
        }
        List<JobCard> out = new ArrayList<>(cards.size());
        for (JobPostingCard c : cards) {
            JobRanker.Scored s = explain.get(c.id());
            out.add(card(c, saved.contains(c.id()), match.get(c.id()), s == null ? null : new JobExplain(s.score(), s.relevance(), s.recency(), s.preference())));
        }
        return out;
    }

    static JobCard card(JobPostingCard c, boolean saved, JobCardMatch match, JobExplain explain) {
        String platform = c.ats() == null ? null : c.ats().toLowerCase(Locale.ROOT);
        boolean remote = c.workplaceType() != null ? "REMOTE".equals(c.workplaceType()) : Boolean.TRUE.equals(c.remote());
        return new JobCard(
            c.id(),
            c.title(),
            c.company(),
            companyKey(c.company()),
            c.location(),
            remote,
            c.workplaceType(),
            JobTypes.normalize(c.employmentType()),
            c.publishedAt(),
            new JobCardSource("ATS", platform, platform == null ? null : platform.substring(0, 1).toUpperCase(Locale.ROOT) + platform.substring(1)),
            platform,
            saved,
            match,
            explain
        );
    }

    /** A company as feedback keys it: lower-cased and trimmed (the same as the SQL's {@code LOWER(TRIM(company))}). */
    public static String companyKey(String company) {
        return company == null ? "" : company.trim().toLowerCase(Locale.ROOT);
    }

    // ---- facets and "try this instead" ------------------------------------------------------------

    private JobFacets facets(long userId, Terms terms, Filters f, Instant now, List<Integer> postedChoices) {
        Map<String, Long> remote = new LinkedHashMap<>();
        for (String k : List.of("REMOTE", "HYBRID", "ONSITE")) remote.put(k, 0L);
        search.remoteFacet(userId, terms, f, now).forEach((k, v) -> remote.computeIfPresent(k, (kk, old) -> old + v));

        Map<String, Long> type = new LinkedHashMap<>();
        for (String k : JobTypes.ALL) type.put(k, 0L);
        search.typeFacet(userId, terms, f, now).forEach((raw, v) -> {
            String n = JobTypes.normalize(raw);
            if (n != null) type.merge(n, v, Long::sum);
        });

        Map<String, Long> posted = new LinkedHashMap<>();
        search.postedFacet(userId, terms, f, now, postedChoices).forEach((d, v) -> posted.put(String.valueOf(d), v));
        return new JobFacets(remote, type, posted);
    }

    /** Up to {@code jobs.search.relaxationsMax} cheaper searches that would find more, each with its count. */
    private List<JobRelax> relaxations(long userId, Request r, JobQueryParser.Parsed parsed, Filters f, Instant now, long current, List<Integer> postedChoices) {
        int max = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_RELAXATIONS_MAX);
        if (max <= 0) return List.of();
        int cap = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_RESULTS);
        Map<String, String> base = new LinkedHashMap<>();
        if (parsed.tokens().size() > 0 && r.q() != null && !r.q().isBlank()) base.put("q", r.q().trim());
        if (f.loc() != null) base.put("loc", f.loc());
        if (f.remote() != null) base.put("remote", f.remote());
        if (!f.types().isEmpty()) base.put("type", String.join(",", f.types()));
        if (f.postedDays() != null) base.put("posted", String.valueOf(f.postedDays()));
        if (f.company() != null) base.put("company", f.company());

        List<JobRelax> out = new ArrayList<>();
        int ftMin = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_FT_MIN_TOKEN);

        if (f.remote() != null) {
            out.addAll(tryRelax("Any workplace", base, "remote", null, terms(parsed), new Filters(f.loc(), null, f.types(), f.postedDays(), f.company()), userId, now, current, cap));
        }
        if (f.postedDays() != null) {
            Integer wider = postedChoices.stream().filter(d -> d > f.postedDays()).findFirst().orElse(null);
            String label = wider == null ? "Any date" : "Posted in the last " + wider + " days";
            out.addAll(tryRelax(label, base, "posted", wider == null ? null : String.valueOf(wider), terms(parsed), new Filters(f.loc(), f.remote(), f.types(), wider, f.company()), userId, now, current, cap));
        }
        String fewer = parsed.withoutLastTerm();
        if (fewer != null) {
            JobQueryParser.Parsed p2 = JobQueryParser.parse(fewer, ftMin);
            Map<String, String> params = new LinkedHashMap<>(base);
            params.put("q", fewer);
            long n = search.count(userId, terms(p2), f, now, cap);
            if (n > current) out.add(new JobRelax("Search \"" + fewer + "\"", params, n));
        }
        if (f.loc() != null) {
            out.addAll(tryRelax("Any location", base, "loc", null, terms(parsed), new Filters(null, f.remote(), f.types(), f.postedDays(), f.company()), userId, now, current, cap));
        }
        if (!f.types().isEmpty()) {
            out.addAll(tryRelax("Any job type", base, "type", null, terms(parsed), new Filters(f.loc(), f.remote(), Set.of(), f.postedDays(), f.company()), userId, now, current, cap));
        }
        out.sort(Comparator.comparingLong(JobRelax::total).reversed());
        return out.size() > max ? out.subList(0, max) : out;
    }

    private List<JobRelax> tryRelax(String label, Map<String, String> base, String key, String newValue, Terms terms, Filters relaxed, long userId, Instant now, long current, int cap) {
        long n = search.count(userId, terms, relaxed, now, cap);
        if (n <= current) return List.of();
        Map<String, String> params = new LinkedHashMap<>(base);
        if (newValue == null) params.remove(key);
        else params.put(key, newValue);
        return List.of(new JobRelax(label, params, n));
    }

    private static Terms terms(JobQueryParser.Parsed p) {
        return new Terms(p.booleanQuery(), p.likeIncludes(), p.likeExcludes());
    }

    // ---- one posting -----------------------------------------------------------------------------

    public JobDetail detail(Long id) {
        User user = users.current();
        JobPosting p = posting(user, id);
        JobPostingCard c = new JobPostingCard(p.getId(), p.getTitle(), p.getCompany(), p.getLocation(), p.getWorkplaceType(), p.getRemote(), p.getEmploymentType(), p.getPublishedAt(), p.getSource().getAts());
        boolean saved = !applications.trackedPostingIds(user.getId(), List.of(id)).isEmpty();
        JobCardMatch match = null;
        if (entitlement.has(user.getLogin(), com.dossier.api.service.entitlement.FeatureKeys.AI_JOB_MATCHING)) {
            match =matches.scoresFor(user.getId(), List.of(id), JobMatchService.SHOW_SCORE).stream().findFirst().map(row -> new JobCardMatch(((Number) row[1]).intValue(), (String) row[2])).orElse(null);
        }
        int maxChars = settings.getInt(ResumeBuilderSettingKeys.JOBS_DETAIL_DESCRIPTION_MAX_CHARS);
        long more = Math.max(0, postings.countByCompanyIgnoreCase(p.getCompany()) - 1);
        return new JobDetail(card(c, saved, match, null), cutAtWord(p.getDescriptionText(), maxChars), p.getUrl(), p.getApplyUrl(), more, similar(user, p));
    }

    private List<JobCard> similar(User user, JobPosting p) {
        int max = settings.getInt(ResumeBuilderSettingKeys.JOBS_DETAIL_SIMILAR_MAX);
        if (max <= 0) return List.of();
        int ftMin = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_FT_MIN_TOKEN);
        // Any of the title's telling words (OR, ranked by the index): "senior product designer" -> product, designer.
        List<String> words = JobPrefilter.words(p.getTitle()).stream().filter(w -> w.length() >= ftMin && !JobQueryParser.STOP_WORDS.contains(w)).sorted().limit(4).toList(); // config-literal-ok: four title words is a query shape, not a limit
        if (words.isEmpty()) return List.of();
        Terms t = new Terms(String.join(" ", words), List.of(), List.of());
        List<Hit> hits = search.hits(user.getId(), t, Filters.NONE, Instant.now(clock), false, 0, max + 1);
        List<Hit> others = hits.stream().filter(h -> h.id() != p.getId().longValue()).limit(max).toList();
        return toCards(user, cardsInOrder(others), Map.of());
    }

    static String cutAtWord(String s, int max) {
        if (s == null) return null;
        if (s.length() <= max) return s;
        int cut = s.lastIndexOf(' ', max);
        return s.substring(0, cut > max / 2 ? cut : max).trim() + "…";
    }

    /** The posting, or 410 when the user once tracked it and it has since been purged, else 404. */
    private JobPosting posting(User user, Long id) {
        return postings
            .findById(id)
            .orElseThrow(() ->
                applications.existsByUserIdAndPostingId(user.getId(), id)
                    ? new ResumeDocException(410, CODE_GONE, "This job is no longer listed", Map.of())
                    : new ResponseStatusException(HttpStatus.NOT_FOUND, "No such job")
            );
    }

    // ---- save and hide ----------------------------------------------------------------------------

    /** Put the posting on the board as a SAVED application (the same path as saving a nightly match). */
    @Transactional
    public Long save(Long postingId) {
        User user = users.current();
        return matchService.saveFromSearch(posting(user, postingId));
    }

    /**
     * HIDE this posting or HIDE_COMPANY every posting of that company: it stops showing in the user's search. Hiding a
     * posting the user had SAVED puts that application away (archived) and says which, so the caller can offer Undo.
     */
    @Transactional
    public FeedbackResult hide(Long postingId, String signal) {
        String s = signal == null ? "" : signal.trim().toUpperCase(Locale.ROOT);
        if (!s.equals(JobFeedback.HIDE) && !s.equals(JobFeedback.HIDE_COMPANY)) throw invalid("signal", "use HIDE or HIDE_COMPANY");
        User user = users.current();
        JobPosting p = posting(user, postingId);
        if (feedback.findOneByUserIdAndPostingIdAndSignal(user.getId(), postingId, s).isEmpty()) {
            JobFeedback f = new JobFeedback();
            f.setUserId(user.getId());
            f.setPostingId(postingId);
            f.setSignal(s);
            f.setCompanyKey(companyKey(p.getCompany()));
            feedback.save(f);
        }
        Long archived = null;
        for (Application a : applications.savedForPosting(user.getId(), postingId)) {
            ObjectNode body = om.createObjectNode().put("archived", true);
            patchService.patch(a.getId(), body);
            if (archived == null) archived = a.getId();
        }
        return new FeedbackResult(s, archived);
    }

    /** Undo a hide. Un-hiding a company lifts every posting of it. */
    @Transactional
    public void unhide(Long postingId, String signal) {
        String s = signal == null ? "" : signal.trim().toUpperCase(Locale.ROOT);
        if (!s.equals(JobFeedback.HIDE) && !s.equals(JobFeedback.HIDE_COMPANY)) throw invalid("signal", "use HIDE or HIDE_COMPANY");
        User user = users.current();
        Optional<JobFeedback> row = feedback.findOneByUserIdAndPostingIdAndSignal(user.getId(), postingId, s);
        if (row.isEmpty()) return; // already undone: nothing to say
        if (s.equals(JobFeedback.HIDE_COMPANY) && row.get().getCompanyKey() != null) {
            feedback.deleteAll(feedback.findByUserIdAndCompanyKeyAndSignal(user.getId(), row.get().getCompanyKey(), s));
        } else {
            feedback.delete(row.get());
        }
    }

    /** Sweep hides whose posting was purged. */
    @Scheduled(cron = "0 30 2 * * *", zone = "UTC")
    @Transactional
    public void sweepOrphanHides() {
        feedback.deleteOrphanHides();
    }

    // ---- title suggestions ---------------------------------------------------------------------------

    /**
     * Titles for the search box as you type: distinct titles that start with, or have a word that starts with, what was
     * typed, most-posted first. Public data (no user in it), so one answer is reused for {@code jobs.suggest.cacheSeconds}.
     */
    public List<String> suggest(String typed) {
        users.current(); // signed-in only, like the rest of search
        String q = typed == null ? "" : typed.trim().toLowerCase(Locale.ROOT);
        int min = settings.getInt(ResumeBuilderSettingKeys.JOBS_SUGGEST_MIN_CHARS);
        int maxChars = settings.getInt(ResumeBuilderSettingKeys.JOBS_SEARCH_MAX_QUERY_CHARS);
        if (q.length() < min) return List.of();
        if (q.length() > maxChars) q = q.substring(0, maxChars);
        Instant now = Instant.now(clock);
        Suggested hit = suggestCache.get(q);
        if (hit != null && hit.expires().isAfter(now)) return hit.titles();
        int limit = settings.getInt(ResumeBuilderSettingKeys.JOBS_SUGGEST_MAX);
        String esc = JobPostingSearchRepository.escape(q);
        List<String> titles = postings.suggestTitles(esc + "%", "% " + esc + "%", PageRequest.of(0, limit)).stream().map(r -> (String) r[0]).toList();
        int ttl = settings.getInt(ResumeBuilderSettingKeys.JOBS_SUGGEST_CACHE_SECONDS);
        if (ttl > 0) {
            if (suggestCache.size() > 500) suggestCache.clear(); // config-literal-ok: a safety valve on memory, not a product limit
            suggestCache.put(q, new Suggested(now.plusSeconds(ttl), titles));
        }
        return titles;
    }
}
