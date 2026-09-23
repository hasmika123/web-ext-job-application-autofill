package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeMatch;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeMatchRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Which of my resumes fits this job? (Phase 13.2 — a Pro AI feature.)
 *
 * <p>One call scores every live resume the user has against one job description: "best match:
 * Backend v3 — 82 %". The answer is cached per (job description × the exact resumes scored), so
 * asking again — the drawer reopening on the same posting, the board re-checking an application —
 * costs nothing, and any edit to a resume or a different posting simply misses the cache.
 *
 * <p>Inputs are bounded, per the 13.1 cost rules: each resume goes in as a compact digest (summary,
 * skills, the latest roles, education — not the whole document), at most {@link #MAX_RESUMES} of
 * them, and the job description is capped at {@link #MAX_JD_CHARS}. The call is gated and metered
 * like every other server AI task ({@link AiBudgetService}, task {@link AiTask#MATCH}).
 */
@Service
@Transactional
public class ResumeMatchService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeMatchService.class);

    /** Shorter than this and it's a page summary, not a job description — scoring it would be noise. */
    static final int MIN_JD_CHARS = AiInputs.MIN_JD_CHARS;
    static final int MAX_JD_CHARS = AiInputs.MAX_JD_CHARS;
    static final int MAX_RESUMES = 10;

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        QUOTA_EXCEEDED,
        NO_RESUMES,
        NO_JOB_DESCRIPTION,
        ERROR,
    }

    /** One resume's fit: 0–100 and a one-line reason naming the deciding strength or gap. */
    public record Score(Long resumeId, String label, int score, String why) {}

    public record Result(Status status, List<Score> scores, boolean cached, int used, int quota, Instant resetsAt) {
        /** The best fit, or null. */
        public Score best() {
            return scores == null || scores.isEmpty() ? null : scores.get(0);
        }
    }

    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final ResumeMatchRepository matchRepository;
    private final UserRepository userRepository;
    private final boolean enabled;
    private final ObjectMapper om = new ObjectMapper();

    public ResumeMatchService(
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        ResumeMatchRepository matchRepository,
        UserRepository userRepository,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.matchRepository = matchRepository;
        this.userRepository = userRepository;
        this.enabled = enabled;
    }

    /** Score against a job the extension has on screen. */
    public Result matchJob(String jobDescription, String role, String company, boolean consent) {
        return run(currentUser(), jobDescription, role, company, consent);
    }

    /** Score against one of the user's tracked applications (the board). 404 if it isn't theirs. */
    public Result matchApplication(Long applicationId, boolean consent) {
        User user = currentUser();
        Application app = applicationRepository
            .findById(applicationId)
            .filter(a -> a.getUser() != null && user.getId().equals(a.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such application"));
        return run(user, app.getJobDescription(), app.getRoleTitle(), app.getCompany(), consent);
    }

    private Result run(User user, String jobDescription, String role, String company, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, List.of(), false, 0, 0, null);
        }
        String login = user.getLogin();
        AiBudgetService.Decision d = budget.decide(login, AiTask.MATCH);
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return new Result(Status.DISABLED, List.of(), false, 0, 0, null);
            }
            case PRO_REQUIRED -> throw new ProRequiredException(
                ProRequiredException.CODE_PRO_REQUIRED,
                "Seeing which resume fits a job is part of Pro"
            );
            default -> {}
        }
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, List.of(), false, d.used(), d.limit(), d.resetsAt());
        }

        String job = cleanJobDescription(jobDescription);
        if (job.length() < MIN_JD_CHARS) {
            return new Result(Status.NO_JOB_DESCRIPTION, List.of(), false, d.used(), d.limit(), d.resetsAt());
        }
        List<Resume> resumes = liveResumes(user);
        if (resumes.isEmpty()) {
            return new Result(Status.NO_RESUMES, List.of(), false, d.used(), d.limit(), d.resetsAt());
        }

        Map<Long, Resume> byId = new LinkedHashMap<>();
        resumes.forEach(r -> byId.put(r.getId(), r));
        String key = cacheKey(job, role, resumes);

        // Cache hit: the same posting against the same resumes — free, and not blocked by the budget.
        var hit = matchRepository.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(user.getId(), key);
        if (hit.isPresent()) {
            List<Score> scores = readStored(hit.get().getResultJson(), byId);
            if (!scores.isEmpty()) {
                return new Result(Status.OK, scores, true, d.used(), d.limit(), d.resetsAt());
            }
        }

        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) {
            return new Result(Status.QUOTA_EXCEEDED, List.of(), false, d.used(), d.limit(), d.resetsAt());
        }

        Map<String, Resume> byRef = new LinkedHashMap<>();
        for (int i = 0; i < resumes.size(); i++) byRef.put("r" + (i + 1), resumes.get(i));

        AiResult result;
        try {
            result = provider.generate(AiTask.MATCH, d.model(), buildPrompt(job, role, company, byRef), "");
        } catch (AiProviderException e) {
            LOG.warn("Resume match failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, List.of(), false, d.used(), d.limit(), d.resetsAt());
        }
        // The provider billed us whether or not the reply is usable, so the call is recorded first.
        metering.record(login, AiTask.MATCH, result);

        List<Score> scores = parseScores(result.text(), byRef);
        AiBudgetService.Decision after = budget.decide(login, AiTask.MATCH);
        if (scores.isEmpty()) {
            LOG.warn("Resume match returned no usable scores");
            return new Result(Status.ERROR, List.of(), false, after.used(), after.limit(), after.resetsAt());
        }

        ResumeMatch row = new ResumeMatch();
        row.setUser(user);
        row.setCacheKey(key);
        row.setResultJson(storeJson(scores));
        row.setModel(result.model());
        matchRepository.save(row);
        return new Result(Status.OK, scores, false, after.used(), after.limit(), after.resetsAt());
    }

    /** Every row a user owns (account deletion). */
    public void deleteAllForUser(Long userId) {
        matchRepository.deleteAll(matchRepository.findByUserId(userId));
    }

    // ---- inputs ------------------------------------------------------------------------------

    /** Live (non-archived) resumes: the default first, then newest — at most {@link #MAX_RESUMES}. */
    List<Resume> liveResumes(User user) {
        return resumeRepository
            .findByUserId(user.getId())
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .sorted(
                Comparator.comparing((Resume r) -> Boolean.TRUE.equals(r.getDefaultResume()) ? 0 : 1)
                    .thenComparing(Resume::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                    .thenComparing(Resume::getId)
            )
            .limit(MAX_RESUMES)
            .toList();
    }

    static String cleanJobDescription(String jd) {
        return AiInputs.cleanJobDescription(jd);
    }

    /** Changes whenever the posting, or any scored resume's label or content, changes. */
    static String cacheKey(String job, String role, List<Resume> resumes) {
        StringBuilder sb = new StringBuilder("v1|").append(role == null ? "" : role.trim().toLowerCase()).append('|').append(job);
        resumes
            .stream()
            .sorted(Comparator.comparing(Resume::getId))
            .forEach(r -> sb.append("|").append(r.getId()).append(':').append(sha256(r.getLabel() + "\n" + r.getParsedJson())));
        return sha256(sb.toString());
    }

    /** A resume as the model sees it: what decides fit, bounded so ten resumes stay cheap. */
    String digest(Resume r) {
        return AiInputs.resumeDigest(r.getParsedJson(), AiInputs.BRIEF);
    }

    String buildPrompt(String job, String role, String company, Map<String, Resume> byRef) {
        StringBuilder sb = new StringBuilder();
        sb.append("Score how well each of one candidate's resumes fits this job, 0-100. ");
        sb.append("90+ = strong on the core requirements; 70-89 = good; 50-69 = partial; below 50 = weak. ");
        sb.append("Judge only what each resume says. For each, give a reason of at most 12 words naming the deciding strength or gap.\n\n");
        String heading = (role == null ? "" : role.trim()) + (company == null || company.isBlank() ? "" : " at " + company.trim());
        if (!heading.isBlank()) sb.append("Job: ").append(heading).append('\n');
        sb.append("Job description:\n<<<\n").append(job).append("\n>>>\n\nResumes:\n");
        byRef.forEach((ref, r) -> sb.append('[').append(ref).append("] \"").append(cap(String.valueOf(r.getLabel()), 80)).append("\"\n").append(digest(r)).append('\n'));
        sb.append("Return JSON {\"scores\":[{\"id\":\"r1\",\"score\":82,\"why\":\"…\"}]} with exactly one entry per resume id.");
        return sb.toString();
    }

    // ---- outputs -----------------------------------------------------------------------------

    /** Best first; unknown ids and duplicates dropped; scores clamped to 0–100. */
    List<Score> parseScores(String text, Map<String, Resume> byRef) {
        JsonNode root;
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            root = start < 0 ? null : om.readTree(t.substring(start));
        } catch (Exception e) {
            return List.of();
        }
        if (root == null) return List.of();
        List<Score> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode s : root.path("scores")) {
            String ref = s.path("id").asText("").trim();
            Resume r = byRef.get(ref);
            if (r == null || !seen.add(ref) || !s.path("score").isNumber()) continue;
            int score = (int) Math.max(0, Math.min(100, Math.round(s.path("score").asDouble())));
            out.add(new Score(r.getId(), r.getLabel(), score, cap(s.path("why").asText("").trim(), 140)));
        }
        out.sort(Comparator.comparingInt(Score::score).reversed());
        return out;
    }

    private String storeJson(List<Score> scores) {
        ObjectNode root = om.createObjectNode();
        ArrayNode arr = root.putArray("scores");
        scores.forEach(s -> arr.addObject().put("resumeId", s.resumeId()).put("score", s.score()).put("why", s.why()));
        return root.toString();
    }

    /** A cached result, with today's labels; a resume that no longer exists is dropped. */
    private List<Score> readStored(String json, Map<Long, Resume> byId) {
        List<Score> out = new ArrayList<>();
        try {
            for (JsonNode s : om.readTree(json).path("scores")) {
                Resume r = byId.get(s.path("resumeId").asLong(-1));
                if (r != null) out.add(new Score(r.getId(), r.getLabel(), s.path("score").asInt(0), s.path("why").asText("")));
            }
        } catch (Exception e) {
            return List.of();
        }
        out.sort(Comparator.comparingInt(Score::score).reversed());
        return out;
    }

    // ---- helpers -----------------------------------------------------------------------------

    private static String cap(String s, int max) {
        return AiInputs.cap(s, max);
    }

    private static String sha256(String s) {
        return AiInputs.sha256(s);
    }

    private User currentUser() {
        String login = SecurityUtils.getCurrentUserLogin().orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No authenticated user")
        );
        return userRepository
            .findOneByLogin(login)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user not found"));
    }
}
