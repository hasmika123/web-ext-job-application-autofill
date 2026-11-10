package com.dossier.api.service.ent.mkt.matches;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.TalentApplication;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The documented formulas of {@link MktMatchRules}, one by one. */
class MktMatchRulesTest {

    private static final Instant NOW = Instant.parse("2026-10-13T10:00:00Z");
    private static final LocalDate TODAY = LocalDate.of(2026, 10, 13);

    @Test
    void highConfidenceStartsAtEightyFive() {
        assertThat(MktMatchRules.isHighConfidence(85)).isTrue();
        assertThat(MktMatchRules.isHighConfidence(84)).isFalse();
    }

    @Test
    void staleMeansSuggestedAndOlderThanSevenDays() {
        assertThat(MktMatchRules.isStale("SUGGESTED", NOW.minus(8, ChronoUnit.DAYS), NOW)).isTrue();
        assertThat(MktMatchRules.isStale("SUGGESTED", NOW.minus(6, ChronoUnit.DAYS), NOW)).isFalse();
        assertThat(MktMatchRules.isStale("ASSIGNED", NOW.minus(30, ChronoUnit.DAYS), NOW)).isFalse();
    }

    @Test
    void availabilityFitFollowsStatusAndDate() {
        assertThat(MktMatchRules.availabilityFit("AVAILABLE", null, TODAY)).isEqualTo(MktMatchRules.EXCELLENT);
        assertThat(MktMatchRules.availabilityFit("NOTICE", TODAY.plusDays(14), TODAY)).isEqualTo(MktMatchRules.GOOD);
        assertThat(MktMatchRules.availabilityFit("NOTICE", TODAY.plusDays(25), TODAY)).isEqualTo(MktMatchRules.FAIR);
        assertThat(MktMatchRules.availabilityFit("NOTICE", TODAY.plusDays(60), TODAY)).isEqualTo(MktMatchRules.LIMITED);
        assertThat(MktMatchRules.availabilityFit("ON_PROJECT", null, TODAY)).isEqualTo(MktMatchRules.LIMITED);
        assertThat(MktMatchRules.availabilityFit("UNAVAILABLE", TODAY, TODAY)).isEqualTo(MktMatchRules.LIMITED);
    }

    @Test
    void skillOverlapIsCaseInsensitiveAndEmptyRequirementsHaveNoPercent() {
        MktMatchRules.SkillOverlap o = MktMatchRules.skillOverlap(List.of("Java", "AWS", "REST APIs"), List.of("java", "Spring Boot", "aws"));
        assertThat(o.matched()).containsExactly("Java", "AWS");
        assertThat(o.missing()).containsExactly("REST APIs");
        assertThat(o.pct()).isEqualTo(67);
        assertThat(MktMatchRules.skillOverlap(List.of(), List.of("Java")).pct()).isNull();
    }

    @Test
    void experienceAndLocation() {
        assertThat(MktMatchRules.experiencePct(6, "SENIOR")).isEqualTo(100);
        assertThat(MktMatchRules.experiencePct(3, "SENIOR")).isEqualTo(60);
        assertThat(MktMatchRules.experiencePct(3, null)).isNull();
        assertThat(MktMatchRules.locationFit("Austin, TX", "REMOTE", "Boston, MA", "ON_SITE")).isEqualTo(100);
        assertThat(MktMatchRules.locationFit("New York, NY", "HYBRID", "new york, ny", "HYBRID")).isEqualTo(100);
        assertThat(MktMatchRules.locationFit("Austin, TX", "HYBRID", "Dallas, TX", "ON_SITE")).isEqualTo(75);
        assertThat(MktMatchRules.locationFit("Austin, TX", "HYBRID", "Boston, MA", "REMOTE")).isEqualTo(50);
        assertThat(MktMatchRules.locationFit("Austin, TX", "HYBRID", "Boston, MA", "ON_SITE")).isEqualTo(30);
    }

    private static TalentApplication app(String stage, String reason) {
        TalentApplication a = new TalentApplication();
        a.setStage(stage);
        a.setClosedReason(reason);
        return a;
    }

    @Test
    void clientHistoryCountsProgressedAndOpenApplications() {
        assertThat(MktMatchRules.clientHistory(List.of()).pct()).isNull();
        MktMatchRules.ClientHistory h = MktMatchRules.clientHistory(List.of(app("INTERVIEWING", null), app("CLOSED", "REJECTED"), app("SUBMITTED", null), app("CLOSED", "HIRED")));
        assertThat(h.total()).isEqualTo(4);
        assertThat(h.progressed()).isEqualTo(2);
        assertThat(h.pct()).isEqualTo(63); // (1 + 0 + 0.5 + 1) / 4
    }

    private static OrgResume resume(boolean primary, Instant updated, String text) {
        OrgResume r = new OrgResume();
        r.setPrimaryForOrg(primary);
        r.setUpdatedAt(updated);
        r.setHeadline(text);
        return r;
    }

    @Test
    void resumeUpdateWhenMissingStaleOrSkillsNotMentioned() {
        assertThat(MktMatchRules.resumeNeed(List.of(), List.of("Java"), NOW).reasons()).containsExactly("No resume on file");
        assertThat(MktMatchRules.resumeNeed(List.of(resume(true, NOW.minus(10, ChronoUnit.DAYS), "Java and AWS engineer")), List.of("Java", "AWS"), NOW).needed()).isFalse();
        MktMatchRules.ResumeNeed missing = MktMatchRules.resumeNeed(List.of(resume(true, NOW.minus(10, ChronoUnit.DAYS), "Java engineer")), List.of("Java", "AWS"), NOW);
        assertThat(missing.needed()).isTrue();
        assertThat(missing.reasons()).containsExactly("Add to resume: AWS");
        MktMatchRules.ResumeNeed old = MktMatchRules.resumeNeed(List.of(resume(false, NOW.minus(400, ChronoUnit.DAYS), "Java")), List.of("Java"), NOW);
        assertThat(old.needed()).isTrue();
        assertThat(old.reasons().get(0)).startsWith("Resume last updated");
    }

    @Test
    void readyNeedsGoodAvailabilityAndNoResumeUpdate() {
        assertThat(MktMatchRules.isReady("EXCELLENT", false)).isTrue();
        assertThat(MktMatchRules.isReady("GOOD", false)).isTrue();
        assertThat(MktMatchRules.isReady("FAIR", false)).isFalse();
        assertThat(MktMatchRules.isReady("EXCELLENT", true)).isFalse();
    }
}
