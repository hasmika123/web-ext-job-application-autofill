package com.dossier.api.service.jobs;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.repository.JobPostingCard;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The "best match" order of job search (E2E-U4.0, docs/design/user/job-search-matching.md section 6): deterministic
 * and the same for every tier, never a model call.
 *
 * <pre>
 * score = w.relevance * text_relevance + w.recency * exp(-hours_old / recencyHours) + w.preference * preference_fit
 * </pre>
 *
 * <ul>
 *   <li><b>text relevance</b> - the FULLTEXT score scaled to 0..1 by the best one in the pool; 0.5 when there is no
 *       search text (browsing), 0.7 when only short words were searched (matched, but not scored by the index);</li>
 *   <li><b>preference fit</b> - the average of title overlap with the person's recent titles (0 / 0.5 / 1), whether the
 *       place suits them ({@link JobPrefilter}'s location rules: local or the remote they asked for 1, workable 0.5,
 *       not 0) and seniority (same level 1, one off 0.5, further 0; unstated 0.5). A person with nothing to compare
 *       gets a neutral 0.5 on every job, so ranking falls back to relevance and recency.</li>
 * </ul>
 *
 * Ties break newest first, then by id, so a page never shuffles between requests. The weights and the recency
 * constant are settings (the caller passes them in); this class holds no tunable.
 */
public final class JobRanker {

    /** The tunables, read from settings by the caller. */
    public record Weights(double relevance, double recency, double preference, int recencyHours) {}

    /** What is known about the person, reduced to what ranking compares. {@link #NONE} = nothing to compare. */
    public record Prefs(Set<String> titleWords, JobPrefilter.Place place, String workPreference, boolean relocate, int seniority) {
        public static final Prefs NONE = new Prefs(Set.of(), null, null, false, MatchPreferences.Seniority.UNKNOWN);

        public boolean usable() {
            return !titleWords.isEmpty() || (place != null && place.known()) || seniority != MatchPreferences.Seniority.UNKNOWN;
        }

        public static Prefs of(MatchPreferences m) {
            Set<String> words = new HashSet<>();
            for (String t : m.titles()) words.addAll(JobPrefilter.words(t));
            return new Prefs(words, JobPrefilter.Place.of(m.city(), m.state(), m.country()), m.workPreference(), m.relocate(), m.seniority());
        }
    }

    /** One scored posting with each term, so "why did this rank here" can be answered. */
    public record Scored(JobPostingCard card, double score, double relevance, double recency, double preference) {}

    private JobRanker() {}

    /**
     * @param hits the candidates with their raw FULLTEXT relevance, in any order
     * @param hasIndexedTerms whether the search had words the FULLTEXT index served (so relevance numbers are meaningful)
     * @param hasLikeTerms whether it had words matched by LIKE
     */
    public static List<Scored> rank(
        List<Candidate> hits,
        boolean hasIndexedTerms,
        boolean hasLikeTerms,
        Prefs prefs,
        Weights w,
        Instant now
    ) {
        double top = hits.stream().mapToDouble(Candidate::relevance).max().orElse(0);
        List<Scored> out = new ArrayList<>(hits.size());
        for (Candidate c : hits) {
            double rel = relevance(c.relevance(), top, hasIndexedTerms, hasLikeTerms);
            double rec = recency(c.card().publishedAt(), now, w.recencyHours());
            double pref = preference(c.card(), prefs);
            out.add(new Scored(c.card(), w.relevance() * rel + w.recency() * rec + w.preference() * pref, rel, rec, pref));
        }
        out.sort(
            Comparator.comparingDouble(Scored::score)
                .reversed()
                .thenComparing((Scored s) -> s.card().publishedAt(), Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing((Scored s) -> s.card().id(), Comparator.reverseOrder())
        );
        return out;
    }

    /** A matching posting and the FULLTEXT relevance the database gave it. */
    public record Candidate(JobPostingCard card, double relevance) {}

    static double relevance(double raw, double top, boolean hasIndexedTerms, boolean hasLikeTerms) {
        if (hasIndexedTerms) return top > 0 ? Math.min(1, raw / top) : 0.5;
        return hasLikeTerms ? 0.7 : 0.5; // config-literal-ok: neutral relevance when the index scored nothing
    }

    /** 1 for a posting published now, about a third after {@code recencyHours}; never negative. */
    static double recency(Instant publishedAt, Instant now, int recencyHours) {
        if (publishedAt == null) return 0;
        double hours = Math.max(0, Duration.between(publishedAt, now).toMinutes() / 60.0);
        return Math.exp(-hours / Math.max(1, recencyHours));
    }

    static double preference(JobPostingCard c, Prefs p) {
        if (p == null || !p.usable()) return 0.5;
        List<Double> parts = new ArrayList<>(3);

        if (!p.titleWords().isEmpty()) {
            Set<String> mine = JobPrefilter.words(c.title());
            long hits = mine.stream().filter(p.titleWords()::contains).count();
            parts.add(hits == 0 ? 0.0 : hits == 1 ? 0.5 : 1.0);
        }
        if (p.place() != null && p.place().known()) {
            JobPosting j = new JobPosting();
            j.setLocation(c.location());
            j.setWorkplaceType(c.workplaceType());
            j.setRemote(c.remote());
            int fit = p.place().fit(j, p.workPreference(), p.relocate());
            parts.add(fit >= 2 ? 1.0 : fit == 0 ? 0.5 : 0.0);
        }
        if (p.seniority() != MatchPreferences.Seniority.UNKNOWN) {
            int level = MatchPreferences.Seniority.of(c.title());
            int gap = level == MatchPreferences.Seniority.UNKNOWN ? -1 : Math.abs(level - p.seniority());
            parts.add(gap < 0 ? 0.5 : gap == 0 ? 1.0 : gap == 1 ? 0.5 : 0.0);
        }
        return parts.stream().mapToDouble(Double::doubleValue).average().orElse(0.5);
    }
}
