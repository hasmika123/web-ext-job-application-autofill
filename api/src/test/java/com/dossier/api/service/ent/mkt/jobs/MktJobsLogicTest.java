package com.dossier.api.service.ent.mkt.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.service.ent.mkt.jobs.MktJobsDTO.Criteria;
import com.dossier.api.service.ent.mkt.jobs.MktJobsLogic.JobView;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The pure rules of the Job Discovery board: every filter, the sorts, the rate text, percent change and the sparkline buckets. */
class MktJobsLogicTest {

    private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");

    private static JobView job(long id, String title, String client, String location, String mode, Long min, Long max, String unit, String source, String visa, String... skills) {
        ClientRequirement r = new ClientRequirement();
        r.setId(id);
        r.setTitle(title);
        r.setLocation(location);
        r.setWorkMode(mode);
        r.setRateMinMinor(min);
        r.setRateMaxMinor(max);
        r.setRateUnit(unit);
        r.setPostedAt(NOW.minusSeconds(id * 3600));
        return new JobView(r, client, source, "MEDIUM", visa, List.of(skills));
    }

    private static Criteria only(String q, List<String> skills, String location, String workType, String visa, String source, Integer rateMin, Integer rateMax) {
        return new Criteria(q, skills, location, workType, visa, source, rateMin, rateMax);
    }

    private final JobView java = job(1, "Senior Java Developer", "TechCorp", "New York, NY", "HYBRID", 9000L, 11000L, "HOUR", "LinkedIn Jobs", "H-1B transfer", "Java", "Spring Boot", "AWS");
    private final JobView analyst = job(2, "Data Analyst", "Global Bank", "Remote", "REMOTE", 6000L, 7500L, "HOUR", "Indeed", "Any visa", "SQL", "Python");
    private final JobView aws = job(3, "AWS Cloud Engineer", "CloudScale", "Austin, TX", "ON_SITE", 12_000_000L, 15_000_000L, "YEAR", "Dice", null, "AWS", "DevOps");

    @Test
    void percentChangeIsWholePercentAndNullWithoutAPreviousValue() {
        assertThat(MktJobsLogic.pct(26, 20)).isEqualTo(30.0);
        assertThat(MktJobsLogic.pct(5, 10)).isEqualTo(-50.0);
        assertThat(MktJobsLogic.pct(5, 0)).isNull();
        assertThat(MktJobsLogic.pct(0, 0)).isNull();
    }

    @Test
    void rateIsShownInTheJobsOwnFields() {
        assertThat(MktJobsLogic.rateLabel(9000L, 11000L, "HOUR", "USD")).isEqualTo("$90 - $110/hr");
        assertThat(MktJobsLogic.rateLabel(12_000_000L, 15_000_000L, "YEAR", "USD")).isEqualTo("$120k - $150k/yr");
        assertThat(MktJobsLogic.rateLabel(9000L, null, "HOUR", "USD")).isEqualTo("$90/hr");
        assertThat(MktJobsLogic.rateLabel(null, 11000L, "HOUR", "USD")).isEqualTo("$110/hr");
        assertThat(MktJobsLogic.rateLabel(9000L, 9000L, "HOUR", "USD")).isEqualTo("$90/hr");
        assertThat(MktJobsLogic.rateLabel(9000L, 11000L, "HOUR", "GBP")).isEqualTo("GBP 90 - GBP 110/hr");
        assertThat(MktJobsLogic.rateLabel(null, null, "HOUR", "USD")).isEqualTo("-");
    }

    @Test
    void noFilterKeepsEveryJob() {
        for (JobView j : List.of(java, analyst, aws)) assertThat(MktJobsLogic.matches(j, null)).isTrue();
        assertThat(MktJobsLogic.matches(java, only(null, List.of(), null, null, null, null, null, null))).isTrue();
    }

    @Test
    void searchBoxNeedsEveryWordSomewhereInTitleClientSkillsOrLocation() {
        assertThat(MktJobsLogic.matches(java, only("java techcorp", null, null, null, null, null, null, null))).isTrue();
        assertThat(MktJobsLogic.matches(java, only("spring austin", null, null, null, null, null, null, null))).isFalse();
        assertThat(MktJobsLogic.matches(analyst, only("python", null, null, null, null, null, null, null))).isTrue();
    }

    @Test
    void skillsMatchWhenTheJobHasAnyOfThem() {
        assertThat(MktJobsLogic.matches(java, only(null, List.of("aws", "react"), null, null, null, null, null, null))).isTrue();
        assertThat(MktJobsLogic.matches(analyst, only(null, List.of("AWS", "Java"), null, null, null, null, null, null))).isFalse();
    }

    @Test
    void locationMatchesTheTextAndRemoteAlsoMatchesTheWorkMode() {
        assertThat(MktJobsLogic.matches(java, only(null, null, "ny", null, null, null, null, null))).isTrue();
        assertThat(MktJobsLogic.matches(aws, only(null, null, "ny", null, null, null, null, null))).isFalse();
        JobView hybridRemote = job(9, "X", "C", "Chicago, IL", "REMOTE", null, null, null, "Indeed", null);
        assertThat(MktJobsLogic.matches(hybridRemote, only(null, null, "Remote", null, null, null, null, null))).isTrue();
    }

    @Test
    void workTypeVisaAndSourceAreExact() {
        assertThat(MktJobsLogic.matches(java, only(null, null, null, "HYBRID", null, null, null, null))).isTrue();
        assertThat(MktJobsLogic.matches(java, only(null, null, null, "REMOTE", null, null, null, null))).isFalse();
        assertThat(MktJobsLogic.matches(java, only(null, null, null, null, "h-1b transfer", null, null, null))).isTrue();
        assertThat(MktJobsLogic.matches(aws, only(null, null, null, null, "Any visa", null, null, null))).isFalse();
        assertThat(MktJobsLogic.matches(analyst, only(null, null, null, null, null, "Indeed", null, null))).isTrue();
        assertThat(MktJobsLogic.matches(analyst, only(null, null, null, null, null, "Dice", null, null))).isFalse();
    }

    @Test
    void rateRangeIsComparedPerHourAndAYearlyRateIsDividedBy2080() {
        // java $90-$110/h, analyst $60-$75/h, aws $120k-$150k/yr = $57.7-$72.1/h
        assertThat(MktJobsLogic.matches(java, only(null, null, null, null, null, null, 100, null))).isTrue();
        assertThat(MktJobsLogic.matches(analyst, only(null, null, null, null, null, null, 100, null))).isFalse();
        assertThat(MktJobsLogic.matches(analyst, only(null, null, null, null, null, null, null, 50))).isFalse();
        assertThat(MktJobsLogic.matches(analyst, only(null, null, null, null, null, null, 70, 80))).isTrue();
        assertThat(MktJobsLogic.matches(aws, only(null, null, null, null, null, null, 55, 60))).isTrue();
        assertThat(MktJobsLogic.matches(aws, only(null, null, null, null, null, null, 80, null))).isFalse();
        JobView noRate = job(8, "No rate", "C", "Remote", "REMOTE", null, null, null, "Indeed", null);
        assertThat(MktJobsLogic.matches(noRate, only(null, null, null, null, null, null, 10, null))).as("a job without a rate cannot satisfy a rate filter").isFalse();
        assertThat(MktJobsLogic.matches(noRate, null)).isTrue();
    }

    @Test
    void filtersAreAndedTogether() {
        assertThat(MktJobsLogic.matches(java, only("java", List.of("AWS"), "NY", "HYBRID", "H-1B transfer", "LinkedIn Jobs", 80, 120))).isTrue();
        assertThat(MktJobsLogic.matches(java, only("java", List.of("AWS"), "NY", "HYBRID", "H-1B transfer", "Indeed", 80, 120))).isFalse();
    }

    @Test
    void sortsNewestFirstByDefaultAndByRateTitleClient() {
        List<JobView> all = new ArrayList<>(List.of(aws, java, analyst));
        all.sort(MktJobsLogic.comparator(null));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(1L, 2L, 3L);
        all.sort(MktJobsLogic.comparator("posted_asc"));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(3L, 2L, 1L);
        all.sort(MktJobsLogic.comparator("rate_desc"));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(1L, 2L, 3L);
        all.sort(MktJobsLogic.comparator("title_asc"));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(3L, 2L, 1L);
        all.sort(MktJobsLogic.comparator("client_asc"));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(3L, 2L, 1L);
        all.sort(MktJobsLogic.comparator("nonsense"));
        assertThat(all).extracting(v -> v.r().getId()).containsExactly(1L, 2L, 3L);
    }

    @Test
    void bucketsAndCumulativeCountsEndAtNow() {
        List<Instant> at = List.of(NOW.minusSeconds(3600), NOW.minusSeconds(2 * 86_400 + 60), NOW.minusSeconds(40 * 86_400));
        List<Long> daily = MktJobsLogic.buckets(at, NOW, 86_400, 8);
        assertThat(daily).hasSize(8);
        assertThat(daily.get(7)).isEqualTo(1L);
        assertThat(daily.get(5)).isEqualTo(1L);
        assertThat(daily.stream().mapToLong(Long::longValue).sum()).isEqualTo(2L);
        List<Long> total = MktJobsLogic.cumulative(at, NOW, 7 * 86_400, 8);
        assertThat(total).hasSize(8);
        assertThat(total.get(7)).isEqualTo(3L);
        assertThat(total.get(0)).isEqualTo(0L);
        assertThat(total.get(2)).isEqualTo(1L);
    }

    @Test
    void priorityIsOneOfThreeValues() {
        assertThat(MktJobsLogic.priority("high")).isEqualTo("HIGH");
        assertThat(MktJobsLogic.priority(null)).isEqualTo("MEDIUM");
        assertThat(MktJobsLogic.priority("urgent")).isEqualTo("MEDIUM");
    }
}
