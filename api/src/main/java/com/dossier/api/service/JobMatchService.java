package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Bio;
import com.dossier.api.domain.JobMatch;
import com.dossier.api.domain.JobMatchSetting;
import com.dossier.api.domain.JobPosting;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.domain.enumeration.JobMode;
import com.dossier.api.domain.enumeration.JobType;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.BioRepository;
import com.dossier.api.repository.JobMatchRepository;
import com.dossier.api.repository.JobMatchSettingRepository;
import com.dossier.api.repository.JobPostingRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.jobs.JobBoardProperties;
import com.dossier.api.service.jobs.JobPrefilter;
import com.dossier.api.service.jobs.MatchPreferences;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Daily job matches, the matching half (Phase 13.6b, Pro). Every night after the job-board read,
 * for each user who has switched matches on:
 *
 * <ol>
 *   <li>Their preferences come from what they already gave us ({@link MatchPreferences}) — the Tier A
 *       answers and their default resume. No form.</li>
 *   <li>{@link JobPrefilter} picks ≤ 50 of the fresh postings they haven't seen and don't already
 *       track — no AI, free.</li>
 *   <li>One Flash-Lite call scores them all (match % + a one-line reason), metered against their
 *       monthly AI budget like any Pro AI call. Every posting sent gets a {@code job_match} row, so
 *       none is paid for twice.</li>
 * </ol>
 *
 * Matching is opt-in and off by default: it sends the resume summary and preferences to the AI
 * provider every night without a click, so the user says yes once (13.6c's page asks). Switching it
 * on matches them straight away rather than making them wait for the night. A user matched in the
 * last 20 hours is skipped, so a manual run on top of the nightly one never pays twice.
 */
@Service
public class JobMatchService {

    private static final Logger LOG = LoggerFactory.getLogger(JobMatchService.class);

    /** Matches at or above this are shown; the rest are kept only so they're never scored again. */
    public static final int SHOW_SCORE = 60;
    static final Duration MIN_GAP = Duration.ofHours(20);
    static final int EXCERPT_CHARS = 600;
    static final int MAX_REASON_CHARS = 160;

    public record SettingView(boolean enabled, Instant lastRunAt, String lastStatus, Integer lastCandidates, Integer lastMatched) {}

    public record RunSummary(Instant startedAt, long durationMs, int users, int matched, int noCandidates, int skipped, int errors, int shown) {}

    /** One match as the Matches page shows it: the score and reason, and the posting's public fields. */
    public record MatchView(
        Long id,
        int score,
        String reason,
        String title,
        String company,
        String location,
        String workplaceType,
        String employmentType,
        String url,
        String applyUrl,
        Instant publishedAt,
        String ats
    ) {}

    public record ListView(SettingView setting, List<MatchView> matches) {}

    /** Published when a user switches matching on, so they're matched now rather than tonight. */
    public record MatchRequested(Long userId) {}

    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final JobMatchSettingRepository settings;
    private final JobMatchRepository matches;
    private final JobPostingRepository postings;
    private final ResumeRepository resumes;
    private final BioRepository bios;
    private final ApplicationRepository applications;
    private final UserRepository users;
    private final EntitlementService entitlement;
    private final JobBoardProperties props;
    private final ApplicationEventPublisher events;
    private final ApplicationSyncService applicationSync;
    private final boolean aiEnabled;
    private final ObjectMapper om = new ObjectMapper();
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicReference<RunSummary> lastRun = new AtomicReference<>();

    public JobMatchService(
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        JobMatchSettingRepository settings,
        JobMatchRepository matches,
        JobPostingRepository postings,
        ResumeRepository resumes,
        BioRepository bios,
        ApplicationRepository applications,
        UserRepository users,
        EntitlementService entitlement,
        JobBoardProperties props,
        ApplicationEventPublisher events,
        ApplicationSyncService applicationSync,
        @Value("${dossier.ai.enabled:false}") boolean aiEnabled
    ) {
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.settings = settings;
        this.matches = matches;
        this.postings = postings;
        this.resumes = resumes;
        this.bios = bios;
        this.applications = applications;
        this.users = users;
        this.entitlement = entitlement;
        this.props = props;
        this.events = events;
        this.applicationSync = applicationSync;
        this.aiEnabled = aiEnabled;
    }

    // ---- the user's switch -------------------------------------------------------------------

    @Transactional(readOnly = true)
    public SettingView mySetting() {
        User user = currentUser();
        return settings.findById(user.getId()).map(JobMatchService::view).orElse(new SettingView(false, null, null, null, null));
    }

    /** Switch matching on or off. On is Pro-only (402 on Free); off always works. */
    @Transactional
    public SettingView setEnabled(boolean enabled) {
        User user = currentUser();
        if (enabled) entitlement.requirePro(user.getLogin());
        JobMatchSetting s = settings.findById(user.getId()).orElseGet(() -> new JobMatchSetting(user.getId()));
        boolean wasOn = s.isEnabled();
        s.setEnabled(enabled);
        s = settings.save(s);
        if (enabled && !wasOn) events.publishEvent(new MatchRequested(user.getId()));
        return view(s);
    }

    // ---- the Matches page (13.6c) ------------------------------------------------------------

    /** The switch and today's list: undecided matches scoring {@link #SHOW_SCORE}+, best first. Pro. */
    @Transactional(readOnly = true)
    public ListView myMatches() {
        User user = currentUser();
        entitlement.requirePro(user.getLogin());
        SettingView setting = settings.findById(user.getId()).map(JobMatchService::view).orElse(new SettingView(false, null, null, null, null));
        List<MatchView> list = matches.findShown(user.getId(), JobMatch.NEW, SHOW_SCORE).stream().map(JobMatchService::matchView).toList();
        return new ListView(setting, list);
    }

    /** Hide a match. It stays scored, so it never comes back. */
    @Transactional
    public void dismiss(Long matchId) {
        ownedMatch(matchId).setStatus(JobMatch.DISMISSED);
    }

    /**
     * Put a match on the board as a SAVED application — with its description, so resume fit, job
     * fit, tailoring and the ATS score all work on it — and take it off the list. Built from the
     * stored posting, never from what the browser sends; the board's usual dedup (the ATS's own job
     * id, then the link) means saving a job already tracked updates that entry instead of adding one.
     *
     * @return the application's id
     */
    @Transactional
    public Long save(Long matchId) {
        JobMatch m = ownedMatch(matchId);
        JobPosting p = m.getPosting();
        ApplicationDTO dto = new ApplicationDTO();
        dto.setCompany(p.getCompany());
        // Postings allow longer titles and location lists than the board keeps (200 each).
        dto.setRoleTitle(AiInputs.cap(p.getTitle(), 200));
        dto.setJobUrl(p.getUrl());
        dto.setLocation(p.getLocation() == null ? null : AiInputs.cap(p.getLocation(), 200));
        dto.setJobMode(jobMode(p.getWorkplaceType()));
        dto.setJobType(jobType(p.getEmploymentType()));
        dto.setJobDescription(p.getDescriptionText());
        dto.setExternalJobId(p.getExternalId());
        dto.setAtsPlatform(p.getSource().getAts());
        dto.setSource("match");
        dto.setStatus(ApplicationStatus.SAVED);
        Long appId = applicationSync.upsertApplication(dto).getId();
        m.setStatus(JobMatch.SAVED);
        return appId;
    }

    private JobMatch ownedMatch(Long matchId) {
        User user = currentUser();
        return matches
            .findOneByIdAndUserId(matchId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such match"));
    }

    private static MatchView matchView(JobMatch m) {
        JobPosting p = m.getPosting();
        return new MatchView(
            m.getId(),
            m.getScore(),
            m.getReason(),
            p.getTitle(),
            p.getCompany(),
            p.getLocation(),
            p.getWorkplaceType(),
            p.getEmploymentType(),
            p.getUrl(),
            p.getApplyUrl(),
            p.getPublishedAt(),
            p.getSource().getAts()
        );
    }

    static JobMode jobMode(String workplaceType) {
        if (workplaceType == null) return null;
        return switch (workplaceType) {
            case "REMOTE" -> JobMode.REMOTE;
            case "HYBRID" -> JobMode.HYBRID;
            case "ONSITE" -> JobMode.ON_SITE;
            default -> null;
        };
    }

    /** "Full-time", "FullTime", "Contract", "Intern"… → the board's job type, or null when unclear. */
    static JobType jobType(String employmentType) {
        String e = employmentType == null ? "" : employmentType.toLowerCase(Locale.ROOT).replaceAll("[^a-z]", "");
        if (e.startsWith("fulltime") || e.equals("permanent")) return JobType.FULL_TIME;
        if (e.startsWith("parttime")) return JobType.PART_TIME;
        if (e.startsWith("contract") || e.startsWith("freelance")) return JobType.CONTRACT;
        if (e.startsWith("intern")) return JobType.INTERNSHIP;
        if (e.startsWith("temp") || e.startsWith("seasonal")) return JobType.TEMPORARY;
        return null;
    }

    // ---- matching ----------------------------------------------------------------------------

    public boolean isRunning() {
        return running.get();
    }

    public RunSummary lastRun() {
        return lastRun.get();
    }

    /** Everyone who has matching on. One run at a time; returns null if one is already going. */
    public RunSummary runAll() {
        if (!running.compareAndSet(false, true)) return null;
        try {
            Instant now = Instant.now();
            List<JobPosting> pool = freshPool(now);
            int n = 0, ok = 0, none = 0, skipped = 0, errors = 0, shown = 0;
            for (JobMatchSetting s : settings.findAllByEnabledTrue()) {
                n++;
                Outcome o = matchUser(s.getUserId(), pool, now);
                switch (o.status()) {
                    case "OK" -> {
                        ok++;
                        shown += o.shown();
                    }
                    case "NO_CANDIDATES" -> none++;
                    case "ERROR" -> errors++;
                    default -> skipped++;
                }
            }
            RunSummary summary = new RunSummary(now, Duration.between(now, Instant.now()).toMillis(), n, ok, none, skipped, errors, shown);
            lastRun.set(summary);
            LOG.info("Job matching: {}", summary);
            return summary;
        } finally {
            running.set(false);
        }
    }

    /** One user, now (they just switched matching on). */
    public void matchOne(Long userId) {
        Instant now = Instant.now();
        matchUser(userId, freshPool(now), now);
    }

    record Outcome(String status, int candidates, int shown) {}

    Outcome matchUser(Long userId, List<JobPosting> pool, Instant now) {
        Optional<JobMatchSetting> maybe = settings.findById(userId);
        if (maybe.isEmpty() || !maybe.get().isEnabled()) return new Outcome("OFF", 0, 0);
        JobMatchSetting s = maybe.get();
        if (s.getLastRunAt() != null && s.getLastRunAt().isAfter(now.minus(MIN_GAP)) && "OK".equals(s.getLastStatus())) {
            return new Outcome("RECENT", 0, 0);
        }
        Optional<User> user = users.findById(userId);
        if (user.isEmpty()) return new Outcome("OFF", 0, 0);
        Outcome o;
        try {
            o = score(user.get(), pool, now);
        } catch (RuntimeException e) {
            LOG.warn("Job matching failed for a user: {}", e.getMessage());
            o = new Outcome("ERROR", 0, 0);
        }
        s.setLastRunAt(now);
        s.setLastStatus(o.status());
        s.setLastCandidates(o.candidates());
        s.setLastMatched(o.shown());
        settings.save(s);
        return o;
    }

    private Outcome score(User user, List<JobPosting> pool, Instant now) {
        if (!aiEnabled || !provider.isConfigured()) return new Outcome("DISABLED", 0, 0);
        String login = user.getLogin();
        AiBudgetService.Decision d = budget.decide(login, AiTask.JOBS);
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return new Outcome("DISABLED", 0, 0);
            }
            case PRO_REQUIRED -> {
                return new Outcome("NOT_PRO", 0, 0);
            }
            case EXHAUSTED -> {
                return new Outcome("BUDGET_EXHAUSTED", 0, 0);
            }
            default -> {}
        }
        Optional<Resume> resume = defaultResume(user.getId());
        if (resume.isEmpty()) return new Outcome("NO_RESUME", 0, 0);
        String bio = bios.findByUserId(user.getId()).stream().findFirst().map(Bio::getPayload).orElse(null);
        MatchPreferences prefs = MatchPreferences.from(bio, resume.get().getParsedJson(), LocalDate.ofInstant(now, ZoneOffset.UTC));
        if (!prefs.usable()) return new Outcome("NO_RESUME", 0, 0);

        Set<Long> seen = new HashSet<>(matches.postingIdsForUser(user.getId()));
        Set<String> tracked = new HashSet<>();
        for (Application a : applications.findByUserId(user.getId())) {
            tracked.add(JobPrefilter.trackedKey(a.getCompany(), a.getRoleTitle()));
            if (a.getJobUrl() != null) tracked.add(a.getJobUrl());
        }
        List<JobPrefilter.Candidate> candidates = JobPrefilter.select(prefs, pool, seen, tracked, JobPrefilter.MAX_CANDIDATES);
        if (candidates.isEmpty()) return new Outcome("NO_CANDIDATES", 0, 0);

        AiResult result;
        try {
            result = provider.generate(AiTask.JOBS, d.model(), buildPrompt(prefs, resume.get(), candidates), "");
        } catch (AiProviderException e) {
            LOG.warn("Job matching call failed: {}", e.getMessage());
            return new Outcome("ERROR", candidates.size(), 0);
        }
        // Billed whether or not the reply is usable, so it's recorded first.
        metering.record(login, AiTask.JOBS, result);

        Map<String, Scored> scores = parseScores(result.text());
        if (scores.isEmpty()) return new Outcome("ERROR", candidates.size(), 0);
        User ref = users.getReferenceById(user.getId());
        int shown = 0;
        for (int i = 0; i < candidates.size(); i++) {
            Scored sc = scores.get(ref(i));
            JobMatch m = new JobMatch();
            m.setUser(ref);
            m.setPosting(candidates.get(i).posting());
            m.setScore(sc == null ? 0 : sc.score());
            m.setReason(sc == null ? null : sc.why());
            m.setModel(result.model());
            matches.save(m);
            if (sc != null && sc.score() >= SHOW_SCORE) shown++;
        }
        return new Outcome("OK", candidates.size(), shown);
    }

    private List<JobPosting> freshPool(Instant now) {
        return postings.findByPublishedAtAfter(now.minus(Duration.ofHours(props.getFreshHours())));
    }

    private Optional<Resume> defaultResume(Long userId) {
        return resumes
            .findByUserId(userId)
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .min(
                Comparator.comparing((Resume r) -> Boolean.TRUE.equals(r.getDefaultResume()) ? 0 : 1)
                    .thenComparing(Resume::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
            );
    }

    // ---- the prompt --------------------------------------------------------------------------

    static String ref(int i) {
        return "j" + (i + 1);
    }

    String buildPrompt(MatchPreferences p, Resume resume, List<JobPrefilter.Candidate> candidates) {
        StringBuilder sb = new StringBuilder();
        sb.append("Score how well each job below fits this candidate as a job to apply to now. Return scores: one entry per job id, ");
        sb.append("with score 0-100 (85+ a strong fit worth applying to today; 70-84 good; 50-69 a stretch; below 50 poor) ");
        sb.append("and why: at most 15 words, the main reason for the score. Judge the role and seniority, the skills the job asks ");
        sb.append("for against the resume, and the location or remote setup against the candidate's preferences. ");
        sb.append("If the candidate needs visa sponsorship and a job says it cannot sponsor, score it below 30.\n\n");
        sb.append("Candidate:\n");
        sb.append(AiInputs.resumeDigest(resume.getParsedJson(), AiInputs.BRIEF));
        if (p.years() > 0) sb.append("Years of experience: about ").append(p.years()).append('\n');
        String where = String.join(", ", Stream.of(p.city(), p.state(), p.country()).filter(x -> x != null && !x.isBlank()).toList());
        if (!where.isEmpty()) sb.append("Based in: ").append(AiInputs.cap(where, 80)).append('\n');
        if (p.workPreference() != null) sb.append("Prefers: ").append(p.workPreference().toLowerCase(Locale.ROOT)).append(" work\n");
        sb.append("Willing to relocate: ").append(p.relocate() ? "yes" : "no").append('\n');
        if (p.needsSponsorship()) sb.append("Needs visa sponsorship: yes\n");
        sb.append("\nJobs:\n");
        for (int i = 0; i < candidates.size(); i++) {
            JobPosting j = candidates.get(i).posting();
            sb.append('[').append(ref(i)).append("] ").append(AiInputs.cap(j.getTitle(), 120)).append(" — ").append(AiInputs.cap(j.getCompany(), 60));
            if (j.getLocation() != null) sb.append(" | ").append(AiInputs.cap(j.getLocation(), 100));
            if (j.getWorkplaceType() != null) sb.append(" | ").append(j.getWorkplaceType().toLowerCase(Locale.ROOT));
            sb.append('\n').append(excerpt(j.getDescriptionText())).append("\n\n");
        }
        return sb.toString();
    }

    private static final Pattern REQUIREMENTS = Pattern.compile(
        "(?i)(qualifications|requirements|what you('| wi)ll need|what you bring|you have|about you|who you are|what we're looking for|you might be a fit|minimum)"
    );

    /** The part of a description that says what the job wants — requirements over company blurb. */
    static String excerpt(String description) {
        if (description == null || description.isBlank()) return "(no description)";
        String d = description;
        Matcher m = REQUIREMENTS.matcher(d);
        if (m.find() && m.start() > 0) d = d.substring(m.start());
        return AiInputs.cap(d.replaceAll("\\s+", " ").trim(), EXCERPT_CHARS);
    }

    record Scored(int score, String why) {}

    Map<String, Scored> parseScores(String text) {
        Map<String, Scored> out = new HashMap<>();
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            JsonNode root = start < 0 ? null : om.readTree(t.substring(start));
            if (root == null) return out;
            for (JsonNode n : root.path("scores")) {
                String id = n.path("id").asText("").trim().toLowerCase(Locale.ROOT).replaceAll("[\\[\\]]", "");
                if (id.isEmpty() || !n.path("score").isNumber()) continue;
                int score = (int) Math.max(0, Math.min(100, Math.round(n.path("score").asDouble())));
                out.putIfAbsent(id, new Scored(score, AiInputs.cap(n.path("why").asText("").trim(), MAX_REASON_CHARS)));
            }
        } catch (Exception e) {
            // unusable reply: nothing scored
        }
        return out;
    }

    // ---- account deletion --------------------------------------------------------------------

    public void deleteAllForUser(Long userId) {
        matches.deleteAll(matches.findByUserId(userId));
        settings.findById(userId).ifPresent(settings::delete);
    }

    private static SettingView view(JobMatchSetting s) {
        return new SettingView(s.isEnabled(), s.getLastRunAt(), s.getLastStatus(), s.getLastCandidates(), s.getLastMatched());
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return users.findOneByLogin(login).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
