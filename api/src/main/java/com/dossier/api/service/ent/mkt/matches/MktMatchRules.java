package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.TalentApplication;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * THE one place the Job Matches page's formulas live (every number on the board is computed here from real rows; nothing is invented).
 *
 * <ul>
 *   <li><b>High confidence</b> = stored {@code requirement_match.score} >= {@link #HIGH_CONFIDENCE_MIN}.</li>
 *   <li><b>Stale</b> = status SUGGESTED and {@code created_at} older than {@link #STALE_DAYS} days.</li>
 *   <li><b>Availability fit</b> (consultant vs. a job that starts "soon", from {@code availability_status} / {@code available_from}):
 *       AVAILABLE = Excellent (100); NOTICE / ON_PROJECT free within {@link #READY_WITHIN_DAYS} days = Good (85); free within 30 days
 *       = Fair (60); later, undated or UNAVAILABLE = Limited (30).</li>
 *   <li><b>Skills match</b> = required skills the consultant holds / required skills (case-insensitive), no percentage when the job lists none.</li>
 *   <li><b>Experience</b> = {@code years_experience} against the level's years (JUNIOR 1, MID 3, SENIOR 5, LEAD 8), capped at 100.</li>
 *   <li><b>Location fit</b> = 100 for a remote job or the same city; 75 same state/region; 50 consultant works remotely; else 30.</li>
 *   <li><b>Client history</b> = share of the consultant's earlier applications to the same client that progressed (interviewing, offer, hired
 *       count 1; still open count 0.5; rejected, withdrawn, no response count 0). No earlier application = no value (the bar says so).</li>
 *   <li><b>Resume update</b> = needed when the consultant has no resume, the primary (else newest) resume was last updated more than
 *       {@link #RESUME_STALE_DAYS} days ago, or a required skill the consultant holds is not mentioned in the resume's headline, summary or target role.
 *       A required skill the consultant does not hold at all is a skill gap, not a resume update.</li>
 *   <li><b>Consultant-ready</b> = a SUGGESTED match whose availability fit is Excellent or Good and that needs no resume update.</li>
 * </ul>
 * The two KPI "vs last month" deltas have no history table behind them; the previous value is the same predicate over rows created before
 * now - 30 days (for Stale: before now - 37 days), using the consultant's current state. Documented in docs/enterprise-v2/page-mkt-matches.md.
 */
public final class MktMatchRules {

    public static final int HIGH_CONFIDENCE_MIN = 85;
    public static final int STALE_DAYS = 7;
    public static final int READY_WITHIN_DAYS = 14;
    public static final int RESUME_STALE_DAYS = 180;
    public static final int TOP_TODAY = 5;
    public static final int SPARK_WEEKS = 8;
    public static final int DEFAULT_PAGE_SIZE = 10;
    public static final int MAX_PAGE_SIZE = 100;

    private MktMatchRules() {}

    public static boolean isHighConfidence(int score) {
        return score >= HIGH_CONFIDENCE_MIN;
    }

    public static boolean isStale(String status, Instant createdAt, Instant now) {
        return "SUGGESTED".equals(status) && createdAt != null && createdAt.isBefore(now.minus(Duration.ofDays(STALE_DAYS)));
    }

    /** Availability label with its tone and the percentage the "Availability Fit" insight bar shows. */
    public record Fit(String key, String label, String tone, int pct) {}

    public static final Fit EXCELLENT = new Fit("EXCELLENT", "Excellent", "green", 100);
    public static final Fit GOOD = new Fit("GOOD", "Good", "blue", 85);
    public static final Fit FAIR = new Fit("FAIR", "Fair", "amber", 60);
    public static final Fit LIMITED = new Fit("LIMITED", "Limited", "red", 30);

    public static Fit availabilityFit(String availabilityStatus, LocalDate availableFrom, LocalDate today) {
        if ("AVAILABLE".equals(availabilityStatus)) return EXCELLENT;
        if ("NOTICE".equals(availabilityStatus) || "ON_PROJECT".equals(availabilityStatus)) {
            if (availableFrom == null) return LIMITED;
            long days = ChronoUnit.DAYS.between(today, availableFrom);
            if (days <= READY_WITHIN_DAYS) return GOOD;
            if (days <= 30) return FAIR;
        }
        return LIMITED;
    }

    public static boolean isReady(String fitKey, boolean resumeUpdateNeeded) {
        return !resumeUpdateNeeded && ("EXCELLENT".equals(fitKey) || "GOOD".equals(fitKey));
    }

    public static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT);
    }

    /** Required skills split into the ones the consultant holds and the ones they do not (original spelling of the job's list). */
    public record SkillOverlap(List<String> required, List<String> matched, List<String> missing) {
        /** Null when the job lists no skills. */
        public Integer pct() {
            return required.isEmpty() ? null : (int) Math.round(100.0 * matched.size() / required.size());
        }
    }

    public static SkillOverlap skillOverlap(Collection<String> required, Collection<String> have) {
        Set<String> mine = new LinkedHashSet<>();
        for (String s : have) mine.add(norm(s));
        List<String> req = new ArrayList<>();
        List<String> ok = new ArrayList<>();
        List<String> missing = new ArrayList<>();
        for (String r : required) {
            if (r == null || r.isBlank()) continue;
            req.add(r);
            (mine.contains(norm(r)) ? ok : missing).add(r);
        }
        return new SkillOverlap(req, ok, missing);
    }

    public static int yearsNeeded(String level) {
        return switch (norm(level)) {
            case "junior", "entry" -> 1;
            case "mid" -> 3;
            case "senior" -> 5;
            case "lead", "principal" -> 8;
            default -> 0;
        };
    }

    /** Null when the job states no level. */
    public static Integer experiencePct(Integer years, String level) {
        int needed = yearsNeeded(level);
        if (needed == 0) return null;
        int have = years == null ? 0 : years;
        return Math.min(100, (int) Math.round(100.0 * have / needed));
    }

    public static int locationFit(String jobLocation, String jobWorkMode, String consultantLocation, String consultantWorkMode) {
        if ("REMOTE".equals(jobWorkMode)) return 100;
        if (!norm(jobLocation).isEmpty() && norm(jobLocation).equals(norm(consultantLocation))) return 100;
        String a = region(jobLocation);
        if (!a.isEmpty() && a.equals(region(consultantLocation))) return 75;
        return "REMOTE".equals(consultantWorkMode) ? 50 : 30;
    }

    private static String region(String location) {
        String n = norm(location);
        int i = n.lastIndexOf(',');
        return i < 0 ? "" : n.substring(i + 1).trim();
    }

    /** What the consultant's earlier applications to this client say; pct is null without any. */
    public record ClientHistory(Integer pct, int total, int progressed) {}

    public static ClientHistory clientHistory(Collection<TalentApplication> sameClient) {
        int total = 0;
        int progressed = 0;
        double score = 0;
        for (TalentApplication a : sameClient) {
            total++;
            String stage = a.getStage();
            if ("INTERVIEWING".equals(stage) || "OFFER".equals(stage) || ("CLOSED".equals(stage) && "HIRED".equals(a.getClosedReason()))) {
                progressed++;
                score += 1;
            } else if ("CLOSED".equals(stage)) {
                // rejected / withdrawn / no response: counts 0
            } else {
                score += 0.5;
            }
        }
        return new ClientHistory(total == 0 ? null : (int) Math.round(100.0 * score / total), total, progressed);
    }

    public record ResumeNeed(boolean needed, List<String> reasons) {}

    /** {@code matchedSkills}: the required skills the consultant holds (they are what a resume should mention). */
    public static ResumeNeed resumeNeed(Collection<OrgResume> resumes, Collection<String> matchedSkills, Instant now) {
        if (resumes.isEmpty()) return new ResumeNeed(true, List.of("No resume on file"));
        OrgResume r = resumes.stream().filter(OrgResume::isPrimaryForOrg).findFirst()
            .orElseGet(() -> resumes.stream().max(Comparator.comparing(OrgResume::getUpdatedAt)).orElseThrow());
        List<String> reasons = new ArrayList<>();
        long days = Duration.between(r.getUpdatedAt(), now).toDays();
        if (days > RESUME_STALE_DAYS) reasons.add("Resume last updated " + (days / 30) + " months ago");
        String text = norm(r.getHeadline()) + " " + norm(r.getSummaryText()) + " " + norm(r.getTargetRole()) + " " + norm(r.getName());
        List<String> absent = new ArrayList<>();
        for (String s : matchedSkills) if (!text.contains(norm(s))) absent.add(s);
        if (!absent.isEmpty()) reasons.add("Add to resume: " + String.join(", ", absent));
        return new ResumeNeed(!reasons.isEmpty(), reasons);
    }
}
