package com.dossier.api.service;

import com.dossier.api.domain.Resume;
import com.dossier.api.domain.User;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * The ATS resume score (Phase 13.5, Pro): 0–100 for one resume, with the reasons.
 *
 * <p>Two parts. <b>Structure</b> — fifteen deterministic checks ({@link AtsChecks}): sections, dates,
 * bullet quality, measurable results, action verbs, first person, education, a file on record.
 * Free to run, no AI. <b>Keywords</b> — only when there's a job: how many of the job's key
 * requirements the resume covers, taken from 13.3's job-fit report (covered ÷ covered + missing).
 * That report is already cached per (job × resume), so the score costs no extra AI call — the one
 * Flash-Lite read the ROADMAP asks for is the one job fit already makes.
 *
 * <p>Without a job the structure checks are the whole score; with one they're 70 % of it and keyword
 * coverage is the other 30 %.
 */
@Service
@Transactional(readOnly = true)
public class AtsScoreService {

    static final int STRUCTURE_SHARE_WITH_JOB = 70;

    /** One check, as the page shows it. */
    public record CheckView(String id, String label, boolean passed, int weight, String detail) {}

    public record Keywords(int covered, int missing, int coveragePercent, List<String> missingTerms) {}

    /**
     * @param jobNote why keyword coverage is absent when a job was asked for (e.g. "quotaExceeded"),
     *                else null
     */
    public record Report(Long resumeId, String label, int score, int passed, int total, List<CheckView> checks, Keywords keywords, String jobNote) {}

    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;
    private final EntitlementService entitlementService;
    private final JobFitService jobFitService;
    private final ObjectMapper om = new ObjectMapper();

    public AtsScoreService(
        ResumeRepository resumeRepository,
        UserRepository userRepository,
        EntitlementService entitlementService,
        JobFitService jobFitService
    ) {
        this.resumeRepository = resumeRepository;
        this.userRepository = userRepository;
        this.entitlementService = entitlementService;
        this.jobFitService = jobFitService;
    }

    /** Structure only — the Resumes page. */
    public Report forResume(Long resumeId) {
        User user = currentUser();
        entitlementService.requirePro(user.getLogin());
        Resume r = ownedResume(user, resumeId);
        List<AtsChecks.Check> checks = AtsChecks.run(parsed(r), hasFile(r));
        int ratio = AtsChecks.passedWeight(checks);
        return report(r, checks, ratio, null, null);
    }

    /**
     * Structure plus keyword coverage against a tracked application's job (the board's job-fit
     * panel). Keywords come from the job-fit report; if it can't be had (budget spent, AI off, no
     * description) the structure score stands alone and {@code jobNote} says why.
     */
    @Transactional
    public Report forApplication(Long applicationId, Long resumeId, boolean consent) {
        User user = currentUser();
        entitlementService.requirePro(user.getLogin());
        Resume r = ownedResume(user, resumeId);
        List<AtsChecks.Check> checks = AtsChecks.run(parsed(r), hasFile(r));
        int structure = AtsChecks.passedWeight(checks);

        JobFitService.Result fit = jobFitService.fitApplication(applicationId, resumeId, consent);
        if (fit.status() != JobFitService.Status.OK || fit.fit() == null) {
            return report(r, checks, structure, null, noteFor(fit.status()));
        }
        int covered = fit.fit().matched().size();
        int missing = fit.fit().missing().size();
        int coverage = covered + missing == 0 ? 0 : Math.round(covered * 100f / (covered + missing));
        Keywords k = new Keywords(covered, missing, coverage, fit.fit().missing());
        int score = Math.round(structure * STRUCTURE_SHARE_WITH_JOB / 100f + coverage * (100 - STRUCTURE_SHARE_WITH_JOB) / 100f);
        return report(r, checks, score, k, null);
    }

    private Report report(Resume r, List<AtsChecks.Check> checks, int score, Keywords k, String note) {
        List<CheckView> views = checks.stream().map(c -> new CheckView(c.id(), c.label(), c.passed(), c.weight(), c.detail())).toList();
        int passed = (int) checks.stream().filter(AtsChecks.Check::passed).count();
        return new Report(r.getId(), r.getLabel(), Math.max(0, Math.min(100, score)), passed, checks.size(), views, k, note);
    }

    private static String noteFor(JobFitService.Status s) {
        return switch (s) {
            case QUOTA_EXCEEDED -> "quotaExceeded";
            case NO_JOB_DESCRIPTION -> "noJobDescription";
            case DISABLED -> "disabled";
            case CONSENT_REQUIRED -> "consentRequired";
            default -> "unavailable";
        };
    }

    private JsonNode parsed(Resume r) {
        try {
            JsonNode n = r.getParsedJson() == null || r.getParsedJson().isBlank() ? null : om.readTree(r.getParsedJson());
            return n != null && n.isObject() ? n : om.createObjectNode();
        } catch (Exception e) {
            return om.createObjectNode();
        }
    }

    private static boolean hasFile(Resume r) {
        return r.getr2ObjectKey() != null && !r.getr2ObjectKey().isBlank();
    }

    private Resume ownedResume(User user, Long resumeId) {
        if (resumeId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a resume");
        return resumeRepository
            .findById(resumeId)
            .filter(r -> r.getUser() != null && user.getId().equals(r.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such resume"));
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
