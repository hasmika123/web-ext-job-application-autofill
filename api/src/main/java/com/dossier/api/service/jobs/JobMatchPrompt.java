package com.dossier.api.service.jobs;

import com.dossier.api.domain.Resume;
import com.dossier.api.service.AiInputs;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Shared bounded prompt vocabulary for personal and organization job matching.
 *
 * <p>Storage and entitlement stay outside this class. A caller supplies the candidate reference
 * shown to the model, so the same prompt cannot accidentally tie an enterprise match to personal
 * {@code job_match} storage.</p>
 */
public final class JobMatchPrompt {

    public static final int EXCERPT_CHARS = 600;

    private static final Pattern REQUIREMENTS = Pattern.compile(
        "(?i)(qualifications|requirements|what you('| wi)ll need|what you bring|you have|about you|who you are|what we're looking for|you might be a fit|minimum)"
    );

    /** The job fields both sources are allowed to place in the shared prompt. */
    public record Job(String ref, String title, String company, String location, String workplaceType, String description) {}

    private JobMatchPrompt() {}

    public static String build(MatchPreferences preferences, Resume resume, List<Job> jobs) {
        Objects.requireNonNull(resume, "resume");
        return build(preferences, resume.getParsedJson(), jobs);
    }

    public static String build(MatchPreferences preferences, String parsedResumeJson, List<Job> jobs) {
        Objects.requireNonNull(preferences, "preferences");
        Objects.requireNonNull(jobs, "jobs");
        StringBuilder sb = new StringBuilder();
        sb.append("Score how well each job below fits this candidate as a job to apply to now. Return scores: one entry per job id, ");
        sb.append("with score 0-100 (85+ a strong fit worth applying to today; 70-84 good; 50-69 a stretch; below 50 poor) ");
        sb.append("and why: at most 15 words, the main reason for the score. Judge the role and seniority, the skills the job asks ");
        sb.append("for against the resume, and the location or remote setup against the candidate's preferences. ");
        sb.append("If the candidate needs visa sponsorship and a job says it cannot sponsor, score it below 30.\n\n");
        sb.append("Candidate:\n");
        sb.append(AiInputs.resumeDigest(parsedResumeJson, AiInputs.BRIEF));
        if (preferences.years() > 0) sb.append("Years of experience: about ").append(preferences.years()).append('\n');
        String where = String.join(", ", Stream.of(preferences.city(), preferences.state(), preferences.country()).filter(x -> x != null && !x.isBlank()).toList());
        if (!where.isEmpty()) sb.append("Based in: ").append(AiInputs.cap(where, 80)).append('\n');
        if (preferences.workPreference() != null) sb.append("Prefers: ").append(preferences.workPreference().toLowerCase(Locale.ROOT)).append(" work\n");
        sb.append("Willing to relocate: ").append(preferences.relocate() ? "yes" : "no").append('\n');
        if (preferences.needsSponsorship()) sb.append("Needs visa sponsorship: yes\n");
        sb.append("\nJobs:\n");
        for (Job job : jobs) {
            sb.append('[').append(job.ref()).append("] ").append(AiInputs.cap(job.title(), 120)).append(" — ").append(AiInputs.cap(job.company(), 60));
            if (job.location() != null) sb.append(" | ").append(AiInputs.cap(job.location(), 100));
            if (job.workplaceType() != null) sb.append(" | ").append(job.workplaceType().toLowerCase(Locale.ROOT));
            sb.append('\n').append(excerpt(job.description())).append("\n\n");
        }
        return sb.toString();
    }

    /** The part of a description that says what the job wants — requirements over company blurb. */
    public static String excerpt(String description) {
        if (description == null || description.isBlank()) return "(no description)";
        String d = description;
        Matcher m = REQUIREMENTS.matcher(d);
        if (m.find() && m.start() > 0) d = d.substring(m.start());
        return AiInputs.cap(d.replaceAll("\\s+", " ").trim(), EXCERPT_CHARS);
    }
}
