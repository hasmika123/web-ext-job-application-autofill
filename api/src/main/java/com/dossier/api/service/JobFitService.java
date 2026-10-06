package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.JobFit;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.JobFitRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.dto.BioDTO;
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
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The job-fit panel (Phase 13.3 — a Pro AI feature): one resume against one job.
 *
 * <p>Returns a match score, a one-line summary, the job's key requirements the resume clearly shows,
 * the ones it doesn't ("missing keywords"), and <b>red flags</b> — hard blockers worth knowing before
 * applying. Red flags read a handful of the user's own profile answers (10.3's work authorization,
 * sponsorship, location, relocation, work preference), so "no visa sponsorship offered" is flagged
 * only for someone who needs it, and "on-site in New York" only for someone who isn't there and
 * won't move. The model is told to flag only what the posting states.
 *
 * <p>Cached per (job description × resume content × those profile facts), exactly like 13.2's
 * resume match, so reopening the panel is free. Gated and metered as task {@link AiTask#FIT}; the
 * ROADMAP routes this to Flash, which is one env var ({@code DOSSIER_AI_MODEL_FIT}) away.
 */
@Service
@Transactional
public class JobFitService {

    private static final Logger LOG = LoggerFactory.getLogger(JobFitService.class);

    static final int MAX_MATCHED = 12;
    static final int MAX_MISSING = 10;
    static final int MAX_RED_FLAGS = 5;
    static final int MAX_ITEM_CHARS = 90;

    /** Profile answers a red flag can depend on — nothing else from the profile is sent. */
    static final List<String> FACT_KEYS = List.of(
        "authorizedToWork",
        "requireSponsorship",
        "city",
        "state",
        "country",
        "willingToRelocate",
        "workPreference",
        "earliestStartDate",
        "noticePeriod"
    );

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        QUOTA_EXCEEDED,
        NO_RESUME,
        NO_JOB_DESCRIPTION,
        ERROR,
    }

    public record Fit(
        Long resumeId,
        String label,
        int score,
        String summary,
        List<String> matched,
        List<String> missing,
        List<String> redFlags
    ) {}

    public record Result(Status status, Fit fit, boolean cached, int used, int quota, Instant resetsAt) {}

    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final JobFitRepository fitRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final boolean enabled;
    private final ObjectMapper om = new ObjectMapper();

    public JobFitService(
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        JobFitRepository fitRepository,
        UserRepository userRepository,
        ProfileService profileService,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.fitRepository = fitRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
        this.enabled = enabled;
    }

    /** The job the extension has on screen, against one of the user's resumes (server id). */
    public Result fitJob(Long resumeId, String jobDescription, String role, String company, boolean consent) {
        User user = currentUser();
        return run(user, ownedResume(user, resumeId), jobDescription, role, company, consent);
    }

    /**
     * A tracked application (the board). With no resume named it uses the one linked to the
     * application, else the user's default, else their newest. 404 if the application isn't theirs.
     */
    public Result fitApplication(Long applicationId, Long resumeId, boolean consent) {
        User user = currentUser();
        Application app = applicationRepository
            .findById(applicationId)
            .filter(a -> a.getUser() != null && user.getId().equals(a.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such application"));
        Optional<Resume> resume;
        if (resumeId != null) {
            resume = ownedResume(user, resumeId);
        } else if (app.getResume() != null && !Boolean.TRUE.equals(app.getResume().getArchived())) {
            resume = Optional.of(app.getResume());
        } else {
            resume = fallbackResume(user);
        }
        return run(user, resume, app.getJobDescription(), app.getRoleTitle(), app.getCompany(), consent);
    }

    /** Every row a user owns (account deletion). */
    public void deleteAllForUser(Long userId) {
        fitRepository.deleteAll(fitRepository.findByUserId(userId));
    }

    private Result run(User user, Optional<Resume> resume, String jobDescription, String role, String company, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, false, 0, 0, null);
        }
        String login = user.getLogin();
        AiBudgetService.Decision d = budget.decide(login, AiTask.FIT);
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return new Result(Status.DISABLED, null, false, 0, 0, null);
            }
            case PRO_REQUIRED -> throw new ProRequiredException(
                ProRequiredException.CODE_PRO_REQUIRED,
                "The job-fit check is part of Pro"
            );
            default -> {}
        }
        if (!consent) {
            return new Result(Status.CONSENT_REQUIRED, null, false, d.used(), d.limit(), d.resetsAt());
        }
        String job = AiInputs.cleanJobDescription(jobDescription);
        if (job.length() < AiInputs.MIN_JD_CHARS) {
            return new Result(Status.NO_JOB_DESCRIPTION, null, false, d.used(), d.limit(), d.resetsAt());
        }
        if (resume.isEmpty()) {
            return new Result(Status.NO_RESUME, null, false, d.used(), d.limit(), d.resetsAt());
        }
        Resume r = resume.get();
        Map<String, String> facts = candidateFacts();
        String key = cacheKey(job, role, r, facts);

        var hit = fitRepository.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(user.getId(), key);
        if (hit.isPresent()) {
            Fit fit = readReport(hit.get().getResultJson(), r);
            if (fit != null) return new Result(Status.OK, fit, true, d.used(), d.limit(), d.resetsAt());
        }
        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) {
            return new Result(Status.QUOTA_EXCEEDED, null, false, d.used(), d.limit(), d.resetsAt());
        }

        AiResult result;
        try {
            result = provider.generate(AiTask.FIT, d.model(), buildPrompt(job, role, company, r, facts), "");
        } catch (AiProviderException e) {
            LOG.warn("Job fit failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, false, d.used(), d.limit(), d.resetsAt());
        }
        // The provider billed us whether or not the reply is usable, so the call is recorded first.
        metering.record(login, AiTask.FIT, result);

        Fit fit = parseReport(result.text(), r);
        AiBudgetService.Decision after = budget.decide(login, AiTask.FIT);
        if (fit == null) {
            LOG.warn("Job fit returned no usable report");
            return new Result(Status.ERROR, null, false, after.used(), after.limit(), after.resetsAt());
        }
        JobFit row = new JobFit();
        row.setUser(user);
        row.setCacheKey(key);
        row.setResultJson(storeJson(fit));
        row.setModel(result.model());
        fitRepository.save(row);
        return new Result(Status.OK, fit, false, after.used(), after.limit(), after.resetsAt());
    }

    // ---- inputs ------------------------------------------------------------------------------

    private Optional<Resume> ownedResume(User user, Long resumeId) {
        if (resumeId == null) return fallbackResume(user);
        Resume r = resumeRepository
            .findById(resumeId)
            .filter(x -> x.getUser() != null && user.getId().equals(x.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such resume"));
        return Boolean.TRUE.equals(r.getArchived()) ? Optional.empty() : Optional.of(r);
    }

    private Optional<Resume> fallbackResume(User user) {
        return resumeRepository
            .findByUserId(user.getId())
            .stream()
            .filter(r -> !Boolean.TRUE.equals(r.getArchived()))
            .min(
                Comparator.comparing((Resume r) -> Boolean.TRUE.equals(r.getDefaultResume()) ? 0 : 1)
                    .thenComparing(Resume::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
            );
    }

    /** The profile answers red flags depend on, in a fixed order; blanks left out. */
    Map<String, String> candidateFacts() {
        Map<String, String> facts = new LinkedHashMap<>();
        String payload = profileService.getProfile().map(BioDTO::getPayload).orElse(null);
        if (payload == null || payload.isBlank()) return facts;
        try {
            JsonNode bio = om.readTree(payload);
            for (String k : FACT_KEYS) {
                JsonNode v = bio.get(k);
                if (v != null && v.isValueNode() && !v.asText("").isBlank()) facts.put(k, AiInputs.cap(v.asText(), 80));
            }
        } catch (Exception e) {
            // unreadable profile — no facts, so no fact-based red flags
        }
        return facts;
    }

    static String cacheKey(String job, String role, Resume r, Map<String, String> facts) {
        StringBuilder sb = new StringBuilder("v1|").append(role == null ? "" : role.trim().toLowerCase(Locale.ROOT)).append('|').append(job);
        sb.append("|r:").append(r.getId()).append(':').append(AiInputs.sha256(r.getLabel() + "\n" + r.getParsedJson()));
        facts.forEach((k, v) -> sb.append('|').append(k).append('=').append(v));
        return AiInputs.sha256(sb.toString());
    }

    String buildPrompt(String job, String role, String company, Resume r, Map<String, String> facts) {
        StringBuilder sb = new StringBuilder();
        sb.append("Assess how well this candidate's resume fits this job. Return: ");
        sb.append("score 0-100 (90+ strong on the core requirements; 70-89 good; 50-69 partial; below 50 weak); ");
        sb.append("summary, one sentence of at most 25 words; ");
        sb.append("matched, up to ").append(MAX_MATCHED).append(" of the job's key skills or requirements the resume clearly shows; ");
        sb.append("missing, up to ").append(MAX_MISSING).append(" the job asks for that the resume does not show, most important first; ");
        sb.append("redFlags, up to ").append(MAX_RED_FLAGS).append(" hard blockers or serious mismatches worth knowing before applying — ");
        sb.append("e.g. a required clearance or citizenship, no visa sponsorship when the candidate needs it, an on-site location the ");
        sb.append("candidate is not in and won't relocate to, or years of experience well above the resume's. ");
        sb.append("Keep list items to short phrases. Flag only what the posting explicitly states; use empty arrays when there is nothing.\n\n");
        String heading = (role == null ? "" : role.trim()) + (company == null || company.isBlank() ? "" : " at " + company.trim());
        if (!heading.isBlank()) sb.append("Job: ").append(heading).append('\n');
        sb.append("Job description:\n<<<\n").append(job).append("\n>>>\n\n");
        sb.append("Resume \"").append(AiInputs.cap(String.valueOf(r.getLabel()), 80)).append("\":\n");
        sb.append(AiInputs.resumeDigest(r.getParsedJson(), AiInputs.DETAILED));
        if (!facts.isEmpty()) {
            sb.append("\nCandidate facts (from their profile):\n");
            facts.forEach((k, v) -> sb.append("- ").append(k).append(": ").append(v).append('\n'));
        }
        return sb.toString();
    }

    // ---- outputs -----------------------------------------------------------------------------

    /** The model's report, or null when it isn't usable. Lists capped, trimmed and de-duplicated. */
    Fit parseReport(String text, Resume r) {
        JsonNode root;
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            root = start < 0 ? null : om.readTree(t.substring(start));
        } catch (Exception e) {
            return null;
        }
        if (root == null || !root.path("score").isNumber()) return null;
        int score = (int) Math.max(0, Math.min(100, Math.round(root.path("score").asDouble())));
        return new Fit(
            r.getId(),
            r.getLabel(),
            score,
            AiInputs.cap(root.path("summary").asText(""), 200),
            list(root.path("matched"), MAX_MATCHED),
            list(root.path("missing"), MAX_MISSING),
            list(root.path("redFlags"), MAX_RED_FLAGS)
        );
    }

    private static List<String> list(JsonNode arr, int max) {
        List<String> out = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode n : arr) {
            if (out.size() >= max) break;
            String v = AiInputs.cap(n.asText(""), MAX_ITEM_CHARS);
            if (!v.isBlank() && seen.add(v.toLowerCase(Locale.ROOT))) out.add(v);
        }
        return out;
    }

    private String storeJson(Fit f) {
        ObjectNode root = om.createObjectNode();
        root.put("score", f.score());
        root.put("summary", f.summary());
        ArrayNode matched = root.putArray("matched");
        f.matched().forEach(matched::add);
        ArrayNode missing = root.putArray("missing");
        f.missing().forEach(missing::add);
        ArrayNode flags = root.putArray("redFlags");
        f.redFlags().forEach(flags::add);
        return root.toString();
    }

    /** A cached report, with the resume's current label. */
    private Fit readReport(String json, Resume r) {
        return parseReport(json, r);
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
