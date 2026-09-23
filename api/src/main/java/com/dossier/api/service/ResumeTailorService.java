package com.dossier.api.service;

import com.dossier.api.domain.Application;
import com.dossier.api.domain.Resume;
import com.dossier.api.domain.ResumeTailor;
import com.dossier.api.domain.User;
import com.dossier.api.domain.enumeration.ResumeStatus;
import com.dossier.api.repository.ApplicationRepository;
import com.dossier.api.repository.ResumeRepository;
import com.dossier.api.repository.ResumeTailorRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ai.AiProvider;
import com.dossier.api.service.ai.AiProviderException;
import com.dossier.api.service.ai.AiResult;
import com.dossier.api.service.ai.AiTask;
import com.dossier.api.service.dto.ResumeDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Resume tailoring (Phase 13.4 — a Pro AI feature): reword a resume for one job, and save what the
 * user keeps as a <b>new</b> resume. The original is never touched.
 *
 * <p><b>Truthfulness is enforced here, not requested.</b> The model is told not to invent anything,
 * and then the server makes sure:
 * <ul>
 *   <li>Only <b>existing</b> bullets and the summary can be rewritten, addressed by ref
 *       ({@code e0b1} = role 0, bullet 1). Roles, employers, titles, dates, education and projects
 *       are copied through untouched — there is no way to express a new one.</li>
 *   <li>A rewrite that contains a <b>number</b> its original doesn't (a metric, a year, a team size)
 *       is dropped. So is one that names the target company, which isn't a bullet about the past.</li>
 *   <li>Skills can only be <b>reordered</b> — the list is rebuilt from the resume's own skills. Job
 *       keywords the resume lacks come back as suggestions to add <i>if true</i>, and are never
 *       applied.</li>
 *   <li>Saving rebuilds the new resume from the stored, checked proposal. The client only says
 *       which refs to keep — it can't send text — and a proposal for a resume that has changed
 *       since is refused.</li>
 * </ul>
 *
 * <p>Cached per (job description × resume content), so asking again is free. Gated and metered as
 * task {@link AiTask#TAILOR}; the ROADMAP routes it to Flash ({@code DOSSIER_AI_MODEL_TAILOR}).
 */
@Service
@Transactional
public class ResumeTailorService {

    private static final Logger LOG = LoggerFactory.getLogger(ResumeTailorService.class);

    static final int MAX_ROLES = 8;
    static final int MAX_BULLETS_PER_ROLE = 5;
    static final int MAX_REWRITES = 12;
    static final int MAX_SUGGESTIONS = 6;
    static final int MAX_TEXT = 400;
    static final String SUMMARY_REF = "summary";
    static final String SKILLS_REF = "skills";

    private static final Pattern REF = Pattern.compile("^e(\\d+)b(\\d+)$");
    private static final Pattern NUMBER = Pattern.compile("\\d+(?:[.,]\\d+)*");

    public enum Status {
        OK,
        DISABLED,
        CONSENT_REQUIRED,
        QUOTA_EXCEEDED,
        NO_RESUME,
        NO_JOB_DESCRIPTION,
        NOTHING_TO_CHANGE,
        ERROR,
    }

    /** One proposed change: {@code ref} is a bullet ref, {@link #SUMMARY_REF} or {@link #SKILLS_REF}. */
    public record Change(String ref, String section, String before, String after) {}

    public record Proposal(Long proposalId, Long resumeId, String label, List<Change> changes, List<String> suggestions) {}

    public record Result(Status status, Proposal proposal, boolean cached, int used, int quota, Instant resetsAt) {}

    private final AiProvider provider;
    private final AiBudgetService budget;
    private final AiMeteringService metering;
    private final ResumeRepository resumeRepository;
    private final ApplicationRepository applicationRepository;
    private final ResumeTailorRepository tailorRepository;
    private final UserRepository userRepository;
    private final ProfileService profileService;
    private final boolean enabled;
    private final ObjectMapper om = new ObjectMapper();

    public ResumeTailorService(
        AiProvider provider,
        AiBudgetService budget,
        AiMeteringService metering,
        ResumeRepository resumeRepository,
        ApplicationRepository applicationRepository,
        ResumeTailorRepository tailorRepository,
        UserRepository userRepository,
        ProfileService profileService,
        @Value("${dossier.ai.enabled:false}") boolean enabled
    ) {
        this.provider = provider;
        this.budget = budget;
        this.metering = metering;
        this.resumeRepository = resumeRepository;
        this.applicationRepository = applicationRepository;
        this.tailorRepository = tailorRepository;
        this.userRepository = userRepository;
        this.profileService = profileService;
        this.enabled = enabled;
    }

    // ---- propose -----------------------------------------------------------------------------

    /** Tailor one of the user's resumes to a tracked application's job. 404 if either isn't theirs. */
    public Result proposeForApplication(Long applicationId, Long resumeId, boolean consent) {
        User user = currentUser();
        Application app = ownedApplication(user, applicationId);
        Resume resume = ownedResume(user, resumeId);
        return propose(user, resume, app.getJobDescription(), app.getRoleTitle(), app.getCompany(), consent);
    }

    private Result propose(User user, Resume resume, String jobDescription, String role, String company, boolean consent) {
        if (!enabled || !provider.isConfigured()) {
            return new Result(Status.DISABLED, null, false, 0, 0, null);
        }
        String login = user.getLogin();
        AiBudgetService.Decision d = budget.decide(login, AiTask.TAILOR);
        switch (d.verdict()) {
            case TASK_DISABLED -> {
                return new Result(Status.DISABLED, null, false, 0, 0, null);
            }
            case PRO_REQUIRED -> throw new ProRequiredException(ProRequiredException.CODE_PRO_REQUIRED, "Resume tailoring is part of Pro");
            default -> {}
        }
        if (!consent) return new Result(Status.CONSENT_REQUIRED, null, false, d.used(), d.limit(), d.resetsAt());
        if (Boolean.TRUE.equals(resume.getArchived())) return new Result(Status.NO_RESUME, null, false, d.used(), d.limit(), d.resetsAt());
        String job = AiInputs.cleanJobDescription(jobDescription);
        if (job.length() < AiInputs.MIN_JD_CHARS) {
            return new Result(Status.NO_JOB_DESCRIPTION, null, false, d.used(), d.limit(), d.resetsAt());
        }

        JsonNode parsed = parsed(resume);
        String resumeHash = resumeHash(resume);
        String key = AiInputs.sha256("v1|" + (role == null ? "" : role.trim().toLowerCase(Locale.ROOT)) + "|" + job + "|" + resume.getId() + ":" + resumeHash);

        var hit = tailorRepository.findFirstByUserIdAndCacheKeyOrderByCreatedAtDesc(user.getId(), key);
        if (hit.isPresent()) {
            Proposal p = present(hit.get(), resume, parsed);
            return new Result(p.changes().isEmpty() ? Status.NOTHING_TO_CHANGE : Status.OK, p, true, d.used(), d.limit(), d.resetsAt());
        }
        if (d.verdict() == AiBudgetService.Verdict.EXHAUSTED) {
            return new Result(Status.QUOTA_EXCEEDED, null, false, d.used(), d.limit(), d.resetsAt());
        }

        Map<String, String> bullets = bulletsByRef(parsed);
        AiResult result;
        try {
            result = provider.generate(AiTask.TAILOR, d.model(), buildPrompt(job, role, company, parsed, bullets), "");
        } catch (AiProviderException e) {
            LOG.warn("Resume tailoring failed for user: {}", e.getMessage());
            return new Result(Status.ERROR, null, false, d.used(), d.limit(), d.resetsAt());
        }
        // The provider billed us whether or not the reply is usable, so the call is recorded first.
        metering.record(login, AiTask.TAILOR, result);
        AiBudgetService.Decision after = budget.decide(login, AiTask.TAILOR);

        ObjectNode checked = check(result.text(), parsed, bullets, company);
        if (checked == null) {
            return new Result(Status.ERROR, null, false, after.used(), after.limit(), after.resetsAt());
        }
        ResumeTailor row = new ResumeTailor();
        row.setUser(user);
        row.setResumeId(resume.getId());
        row.setResumeHash(resumeHash);
        row.setCacheKey(key);
        row.setResultJson(checked.toString());
        row.setModel(result.model());
        row = tailorRepository.save(row);
        Proposal p = present(row, resume, parsed);
        if (p.changes().isEmpty()) {
            return new Result(Status.NOTHING_TO_CHANGE, p, false, after.used(), after.limit(), after.resetsAt());
        }
        return new Result(Status.OK, p, false, after.used(), after.limit(), after.resetsAt());
    }

    // ---- apply -------------------------------------------------------------------------------

    /**
     * Save the kept changes as a NEW resume. {@code keep} is the refs to apply — the text comes from
     * the stored, checked proposal. Optionally links the new resume to an application.
     *
     * @throws ResponseStatusException 404 for someone else's proposal/application, 409 if the source
     *                                 resume changed or is gone, 400 if nothing is kept
     */
    public ResumeDTO apply(Long proposalId, Collection<String> keep, String label, Long applicationId) {
        User user = currentUser();
        ResumeTailor row = tailorRepository
            .findByIdAndUserId(proposalId, user.getId())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such proposal"));
        Resume source = resumeRepository
            .findById(row.getResumeId())
            .filter(r -> r.getUser() != null && user.getId().equals(r.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "The resume this was made from is gone"));
        if (!row.getResumeHash().equals(resumeHash(source))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That resume changed since — tailor it again");
        }
        Set<String> kept = keep == null ? Set.of() : new LinkedHashSet<>(keep);
        if (kept.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Keep at least one change");
        Application app = applicationId == null ? null : ownedApplication(user, applicationId);

        ObjectNode doc = (ObjectNode) parsed(source).deepCopy();
        JsonNode proposal = readJson(row.getResultJson());
        int applied = 0;
        if (kept.contains(SUMMARY_REF) && proposal.hasNonNull("summary")) {
            doc.put("summary", proposal.get("summary").asText());
            applied++;
        }
        if (kept.contains(SKILLS_REF) && proposal.has("skillsOrder")) {
            ArrayNode skills = doc.putArray("skills");
            proposal.get("skillsOrder").forEach(s -> skills.add(s.asText()));
            applied++;
        }
        for (JsonNode b : proposal.path("bullets")) {
            String ref = b.path("ref").asText("");
            Matcher m = REF.matcher(ref);
            if (!kept.contains(ref) || !m.matches()) continue;
            JsonNode bullets = doc.path("experience").path(Integer.parseInt(m.group(1))).path("bullets");
            int j = Integer.parseInt(m.group(2));
            if (bullets instanceof ArrayNode arr && j < arr.size()) {
                arr.set(j, om.getNodeFactory().textNode(b.path("text").asText()));
                applied++;
            }
        }
        if (applied == 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "None of those changes are in this proposal");

        ResumeDTO dto = new ResumeDTO();
        String base = source.getLabel() == null ? "Resume" : source.getLabel();
        String name = label != null && !label.isBlank() ? label.trim() : base + " (tailored)";
        dto.setLabel(AiInputs.cap(name, 200));
        dto.setParsedJson(doc.toString());
        dto.setStatus(ResumeStatus.CONFIRMED); // the user reviewed every change
        dto.setDefaultResume(false);
        dto.setArchived(false);
        ResumeDTO created = profileService.createResume(dto);

        if (app != null) {
            resumeRepository.findById(created.getId()).ifPresent(app::setResume);
            app.setUpdatedAt(Instant.now());
            applicationRepository.save(app);
        }
        return created;
    }

    /** Every row a user owns (account deletion). */
    public void deleteAllForUser(Long userId) {
        tailorRepository.deleteAll(tailorRepository.findByUserId(userId));
    }

    // ---- inputs ------------------------------------------------------------------------------

    /** Bullets the model may rewrite, by ref — bounded to the latest roles and first bullets. */
    static Map<String, String> bulletsByRef(JsonNode parsed) {
        Map<String, String> out = new LinkedHashMap<>();
        int i = 0;
        for (JsonNode e : parsed.path("experience")) {
            if (i >= MAX_ROLES) break;
            int j = 0;
            for (JsonNode b : e.path("bullets")) {
                if (j >= MAX_BULLETS_PER_ROLE) break;
                String t = b.asText("").trim();
                if (!t.isEmpty()) out.put("e" + i + "b" + j, t);
                j++;
            }
            i++;
        }
        return out;
    }

    String buildPrompt(String job, String role, String company, JsonNode parsed, Map<String, String> bullets) {
        StringBuilder sb = new StringBuilder();
        sb.append("Tailor this resume to the job below by rewording what is already there. Rules: ");
        sb.append("never invent employers, titles, dates, degrees, tools, numbers, metrics or results; ");
        sb.append("keep every number exactly as written and add none; do not mention the hiring company; ");
        sb.append("use the job's wording only where it is true of what the bullet already says; ");
        sb.append("rewrite only bullets that clearly gain from it (at most ").append(MAX_REWRITES).append("), keeping each about as long. ");
        sb.append("Return: bullets as {ref, text} using the refs below; summary, a rewritten summary (omit if there is none); ");
        sb.append("skillsOrder, the candidate's OWN skills reordered most relevant first (use only skills from the list); ");
        sb.append("suggestions, up to ").append(MAX_SUGGESTIONS).append(" of the job's key skills missing from the resume that the candidate could add only if true.\n\n");
        String heading = (role == null ? "" : role.trim()) + (company == null || company.isBlank() ? "" : " at " + company.trim());
        if (!heading.isBlank()) sb.append("Job: ").append(heading).append('\n');
        sb.append("Job description:\n<<<\n").append(job).append("\n>>>\n\nResume:\n");
        String summary = parsed.path("summary").asText("");
        if (!summary.isBlank()) sb.append("Summary: ").append(AiInputs.cap(summary, 800)).append('\n');
        int i = 0;
        for (JsonNode e : parsed.path("experience")) {
            if (i >= MAX_ROLES) break;
            sb.append("[e").append(i).append("] ").append(e.path("title").asText("")).append(" at ").append(e.path("company").asText("")).append('\n');
            final int roleIndex = i;
            bullets.forEach((ref, text) -> {
                if (ref.startsWith("e" + roleIndex + "b")) sb.append("  [").append(ref).append("] ").append(AiInputs.cap(text, 300)).append('\n');
            });
            i++;
        }
        List<String> skills = skills(parsed);
        if (!skills.isEmpty()) sb.append("Skills: ").append(String.join(", ", skills)).append('\n');
        return sb.toString();
    }

    // ---- the checks ------------------------------------------------------------------------

    /**
     * The model's reply, reduced to what may be applied. Null when it isn't usable at all. Each kept
     * rewrite targets an existing bullet, differs from it, fits the length cap, adds no number and
     * doesn't name the company; the summary follows the same rules against the whole resume; skills
     * are a reorder of the resume's own list.
     */
    ObjectNode check(String text, JsonNode parsed, Map<String, String> bullets, String company) {
        JsonNode root = readJson(text);
        if (root == null || !root.isObject()) return null;
        ObjectNode out = om.createObjectNode();
        String companyLc = company == null ? "" : company.trim().toLowerCase(Locale.ROOT);

        ArrayNode kept = out.putArray("bullets");
        Set<String> seen = new LinkedHashSet<>();
        for (JsonNode b : root.path("bullets")) {
            if (kept.size() >= MAX_REWRITES) break;
            String ref = b.path("ref").asText("").trim();
            String before = bullets.get(ref);
            String after = AiInputs.cap(b.path("text").asText(""), MAX_TEXT);
            if (before == null || !seen.add(ref) || !acceptable(before, after, before, companyLc)) continue;
            kept.addObject().put("ref", ref).put("text", after);
        }

        String summary = parsed.path("summary").asText("");
        String newSummary = AiInputs.cap(root.path("summary").asText(""), 900);
        if (!summary.isBlank() && acceptable(summary, newSummary, allText(parsed), companyLc)) {
            out.put("summary", newSummary);
        }

        List<String> own = skills(parsed);
        if (own.size() > 1 && root.has("skillsOrder")) {
            List<String> order = reorder(own, root.path("skillsOrder"));
            if (!order.equals(own)) {
                ArrayNode arr = out.putArray("skillsOrder");
                order.forEach(arr::add);
            }
        }

        Set<String> ownLc = new LinkedHashSet<>();
        own.forEach(s -> ownLc.add(s.toLowerCase(Locale.ROOT)));
        ArrayNode sug = out.putArray("suggestions");
        for (JsonNode s : root.path("suggestions")) {
            if (sug.size() >= MAX_SUGGESTIONS) break;
            String v = AiInputs.cap(s.asText(""), 60);
            if (!v.isBlank() && !ownLc.contains(v.toLowerCase(Locale.ROOT))) sug.add(v);
        }
        return out;
    }

    /** A rewrite is kept only if it says something different, stays short, adds no number and doesn't name the company. */
    static boolean acceptable(String before, String after, String numberSource, String companyLc) {
        if (after == null || after.isBlank() || after.trim().equalsIgnoreCase(before.trim())) return false;
        if (after.length() > Math.max(before.length() * 2 + 60, 160)) return false;
        String afterLc = after.toLowerCase(Locale.ROOT);
        if (!companyLc.isBlank() && afterLc.contains(companyLc) && !before.toLowerCase(Locale.ROOT).contains(companyLc)) return false;
        Set<String> allowed = numbers(numberSource);
        for (String n : numbers(after)) if (!allowed.contains(n)) return false;
        return true;
    }

    /** Numbers in a text, normalized ("1,200" and "1200" are the same number). */
    static Set<String> numbers(String text) {
        Set<String> out = new LinkedHashSet<>();
        Matcher m = NUMBER.matcher(text == null ? "" : text);
        while (m.find()) out.add(m.group().replace(",", ""));
        return out;
    }

    /** The resume's own skills in the model's order, then any it left out — never a skill it added. */
    static List<String> reorder(List<String> own, JsonNode proposed) {
        Map<String, String> byLc = new LinkedHashMap<>();
        own.forEach(s -> byLc.putIfAbsent(s.toLowerCase(Locale.ROOT), s));
        List<String> out = new ArrayList<>();
        Set<String> used = new LinkedHashSet<>();
        for (JsonNode p : proposed) {
            String lc = p.asText("").trim().toLowerCase(Locale.ROOT);
            if (byLc.containsKey(lc) && used.add(lc)) out.add(byLc.get(lc));
        }
        byLc.forEach((lc, s) -> {
            if (used.add(lc)) out.add(s);
        });
        return out;
    }

    // ---- presenting a stored proposal ------------------------------------------------------

    private Proposal present(ResumeTailor row, Resume resume, JsonNode parsed) {
        JsonNode p = readJson(row.getResultJson());
        List<Change> changes = new ArrayList<>();
        if (p == null) return new Proposal(row.getId(), resume.getId(), resume.getLabel(), changes, List.of());
        if (p.hasNonNull("summary")) changes.add(new Change(SUMMARY_REF, "Summary", parsed.path("summary").asText(""), p.get("summary").asText()));
        Map<String, String> bullets = bulletsByRef(parsed);
        for (JsonNode b : p.path("bullets")) {
            String ref = b.path("ref").asText("");
            Matcher m = REF.matcher(ref);
            if (!bullets.containsKey(ref) || !m.matches()) continue;
            JsonNode e = parsed.path("experience").path(Integer.parseInt(m.group(1)));
            String section = (e.path("title").asText("") + " · " + e.path("company").asText("")).replaceAll("^ · | · $", "");
            changes.add(new Change(ref, section, bullets.get(ref), b.path("text").asText()));
        }
        if (p.has("skillsOrder")) {
            List<String> order = new ArrayList<>();
            p.get("skillsOrder").forEach(s -> order.add(s.asText()));
            changes.add(new Change(SKILLS_REF, "Skills (reordered)", String.join(", ", skills(parsed)), String.join(", ", order)));
        }
        List<String> suggestions = new ArrayList<>();
        p.path("suggestions").forEach(s -> suggestions.add(s.asText()));
        return new Proposal(row.getId(), resume.getId(), resume.getLabel(), changes, suggestions);
    }

    // ---- helpers -----------------------------------------------------------------------------

    private JsonNode parsed(Resume r) {
        JsonNode n = readJson(r.getParsedJson());
        return n != null && n.isObject() ? n : om.createObjectNode();
    }

    private JsonNode readJson(String text) {
        try {
            String t = text == null ? "" : text.trim();
            int start = t.indexOf('{');
            return start < 0 ? null : om.readTree(t.substring(start));
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> skills(JsonNode parsed) {
        List<String> out = new ArrayList<>();
        parsed.path("skills").forEach(s -> {
            if (!s.asText("").isBlank()) out.add(s.asText().trim());
        });
        return out;
    }

    /** Everything the resume says — the numbers a summary rewrite may use. */
    private static String allText(JsonNode parsed) {
        return parsed.toString();
    }

    static String resumeHash(Resume r) {
        return AiInputs.sha256(r.getLabel() + "\n" + r.getParsedJson());
    }

    private Resume ownedResume(User user, Long resumeId) {
        if (resumeId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a resume to tailor");
        return resumeRepository
            .findById(resumeId)
            .filter(r -> r.getUser() != null && user.getId().equals(r.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such resume"));
    }

    private Application ownedApplication(User user, Long applicationId) {
        return applicationRepository
            .findById(applicationId)
            .filter(a -> a.getUser() != null && user.getId().equals(a.getUser().getId()))
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No such application"));
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
