package com.dossier.api.service.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.dossier.api.repository.JobPostingCard;
import com.dossier.api.service.jobs.JobRanker.Candidate;
import com.dossier.api.service.jobs.JobRanker.Prefs;
import com.dossier.api.service.jobs.JobRanker.Scored;
import com.dossier.api.service.jobs.JobRanker.Weights;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Each ranking term on fixed rows, the weights, and stable ties. */
class JobRankerTest {

    private static final Instant NOW = Instant.parse("2026-10-14T12:00:00Z");
    private static final Weights W = new Weights(0.45, 0.20, 0.25, 72);

    private static JobPostingCard card(long id, String title, String location, String workplace, int hoursAgo) {
        return new JobPostingCard(id, title, "Acme", location, workplace, "REMOTE".equals(workplace), "Full-time", NOW.minus(Duration.ofHours(hoursAgo)), "greenhouse");
    }

    private static Prefs designer() {
        return Prefs.of(
            MatchPreferences.from(
                "{\"city\":\"Austin\",\"state\":\"TX\",\"country\":\"United States\",\"workPreference\":\"Hybrid\"}",
                "{\"experience\":[{\"title\":\"Senior Product Designer\",\"startDate\":\"2019-01\",\"current\":true}],\"skills\":[\"Figma\"]}",
                LocalDate.of(2026, 10, 14)
            )
        );
    }

    @Test
    void recencyIsOneNowAndAboutAThirdAfterTheConfiguredHours() {
        assertThat(JobRanker.recency(NOW, NOW, 72)).isCloseTo(1.0, within(1e-9));
        assertThat(JobRanker.recency(NOW.minus(Duration.ofHours(72)), NOW, 72)).isCloseTo(Math.exp(-1), within(1e-6));
        assertThat(JobRanker.recency(NOW.minus(Duration.ofHours(24)), NOW, 72)).isGreaterThan(JobRanker.recency(NOW.minus(Duration.ofHours(48)), NOW, 72));
        assertThat(JobRanker.recency(null, NOW, 72)).isZero();
        assertThat(JobRanker.recency(NOW.plus(Duration.ofHours(5)), NOW, 72)).isCloseTo(1.0, within(1e-9)); // a clock skewed future date is not "newer than now"
    }

    @Test
    void relevanceIsScaledToTheBestAndNeutralWithoutIndexedWords() {
        assertThat(JobRanker.relevance(4, 8, true, false)).isEqualTo(0.5);
        assertThat(JobRanker.relevance(8, 8, true, false)).isEqualTo(1.0);
        assertThat(JobRanker.relevance(0, 0, true, false)).isEqualTo(0.5);
        assertThat(JobRanker.relevance(0, 0, false, false)).isEqualTo(0.5); // browsing
        assertThat(JobRanker.relevance(0, 0, false, true)).isEqualTo(0.7); // only short words: matched, not scored
    }

    @Test
    void preferenceIsNeutralWhenThereIsNothingToCompare() {
        assertThat(JobRanker.preference(card(1, "Anything", "Nowhere", null, 1), Prefs.NONE)).isEqualTo(0.5);
        assertThat(JobRanker.preference(card(1, "Anything", "Nowhere", null, 1), null)).isEqualTo(0.5);
    }

    @Test
    void preferenceRewardsTitleOverlapPlaceAndLevel() {
        Prefs p = designer();
        double fit = JobRanker.preference(card(1, "Senior Product Designer", "Austin, TX", "HYBRID", 1), p);
        double wrongField = JobRanker.preference(card(2, "Senior Data Engineer", "Austin, TX", "HYBRID", 1), p);
        double wrongPlace = JobRanker.preference(card(3, "Senior Product Designer", "Berlin, Germany", "ONSITE", 1), p);
        double wrongLevel = JobRanker.preference(card(4, "Product Design Intern", "Austin, TX", "HYBRID", 1), p);
        assertThat(fit).isGreaterThan(wrongField).isGreaterThan(wrongPlace).isGreaterThan(wrongLevel);
        assertThat(fit).isCloseTo(1.0, within(1e-9));
    }

    @Test
    void rankingCombinesTheTermsByTheirWeights() {
        // Same text relevance; the fresher job wins on recency, the better fit wins on preference.
        Candidate stale = new Candidate(card(1, "Senior Product Designer", "Austin, TX", "HYBRID", 140), 5);
        Candidate fresh = new Candidate(card(2, "Senior Product Designer", "Austin, TX", "HYBRID", 2), 5);
        List<Scored> out = JobRanker.rank(List.of(stale, fresh), true, false, designer(), W, NOW);
        assertThat(out.get(0).card().id()).isEqualTo(2);
        Scored top = out.get(0);
        assertThat(top.score()).isCloseTo(0.45 * top.relevance() + 0.20 * top.recency() + 0.25 * top.preference(), within(1e-9));

        Candidate fit = new Candidate(card(3, "Senior Product Designer", "Austin, TX", "HYBRID", 30), 5);
        Candidate off = new Candidate(card(4, "Senior Data Engineer", "Berlin, Germany", "ONSITE", 30), 5);
        assertThat(JobRanker.rank(List.of(off, fit), true, false, designer(), W, NOW).get(0).card().id()).isEqualTo(3);
    }

    @Test
    void aBetterTextMatchOutranksAFresherWorseOne() {
        Candidate better = new Candidate(card(1, "Product Designer", "Remote (US)", "REMOTE", 40), 9);
        Candidate fresher = new Candidate(card(2, "Product Designer", "Remote (US)", "REMOTE", 1), 1);
        assertThat(JobRanker.rank(List.of(fresher, better), true, false, Prefs.NONE, W, NOW).get(0).card().id()).isEqualTo(1);
    }

    @Test
    void tiesAreStableNewestThenHighestId() {
        Candidate a = new Candidate(card(10, "Designer", "X", null, 10), 1);
        Candidate b = new Candidate(card(11, "Designer", "X", null, 10), 1);
        Candidate older = new Candidate(card(12, "Designer", "X", null, 10), 1);
        // identical score and time: higher id first, and the order does not depend on the input order
        assertThat(JobRanker.rank(List.of(a, b, older), false, false, Prefs.NONE, W, NOW).stream().map(s -> s.card().id()).toList()).containsExactly(12L, 11L, 10L);
        assertThat(JobRanker.rank(List.of(older, b, a), false, false, Prefs.NONE, W, NOW).stream().map(s -> s.card().id()).toList()).containsExactly(12L, 11L, 10L);
    }

    @Test
    void zeroWeightsTurnATermOff() {
        Weights recencyOnly = new Weights(0, 1, 0, 72);
        Candidate old = new Candidate(card(1, "Senior Product Designer", "Austin, TX", "HYBRID", 100), 9);
        Candidate fresh = new Candidate(card(2, "Janitor", "Mars", "ONSITE", 1), 0);
        assertThat(JobRanker.rank(List.of(old, fresh), true, false, designer(), recencyOnly, NOW).get(0).card().id()).isEqualTo(2);
    }
}
