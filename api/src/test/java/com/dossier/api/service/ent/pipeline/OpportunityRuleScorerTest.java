package com.dossier.api.service.ent.pipeline;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ent.pipeline.OpportunityCandidateProjector.Candidate;
import com.dossier.api.service.ent.pipeline.OpportunityCandidateProjector.Source;
import com.dossier.api.service.jobs.MatchPreferences;
import com.dossier.api.service.jobs.MatchPreferences.Seniority;
import java.util.List;
import org.junit.jupiter.api.Test;

class OpportunityRuleScorerTest {

    private static final MatchPreferences PROFILE = new MatchPreferences(
        List.of("Senior Backend Engineer"),
        Seniority.SENIOR,
        7,
        List.of("Java", "Kafka", "PostgreSQL", "AWS", "Terraform", "Spring Boot", "gRPC"),
        "Brooklyn",
        "NY",
        "United States",
        "REMOTE",
        false,
        false
    );

    private final OpportunityRuleScorer scorer = new OpportunityRuleScorer();

    @Test
    void strongSignalsProduceDeterministicBoundedScoreAndReason() {
        Candidate candidate = candidate(
            "Senior Backend Engineer",
            "Remote (US)",
            "Build Java services with Kafka and PostgreSQL.",
            "[\"Java\",\"Kafka\"]",
            "REMOTE",
            true
        );

        OpportunityRuleScorer.Result first = scorer.score(PROFILE, candidate);
        OpportunityRuleScorer.Result second = scorer.score(PROFILE, candidate);

        assertThat(first).isEqualTo(second);
        assertThat(first.eligible()).isTrue();
        assertThat(first.score()).isBetween(1, 100);
        assertThat(first.signals().matchedTitleWords()).contains("backend", "engineer");
        assertThat(first.signals().matchedSkills()).contains("Java", "Kafka", "PostgreSQL");
        assertThat(first.signals().locationFit()).isEqualTo(OpportunityRuleScorer.LocationFit.LOCAL_OR_MATCHING_REMOTE);
        assertThat(first.signals().seniorityGap()).isZero();
        assertThat(first.reason()).contains("Title", "Skills", "Location", "Level");
        assertThat(first.reason()).hasSizeLessThanOrEqualTo(300);
    }

    @Test
    void strongerTitleAndSkillAlignmentOutranksAWeakButEligibleMatch() {
        Candidate strong = candidate(
            "Senior Backend Engineer",
            "Remote (US)",
            "Java Kafka PostgreSQL AWS",
            null,
            "REMOTE",
            true
        );
        Candidate weak = candidate(
            "Solutions Engineer",
            "Remote (US)",
            "Java Kafka AWS",
            null,
            "REMOTE",
            true
        );

        OpportunityRuleScorer.Result strongResult = scorer.score(PROFILE, strong);
        OpportunityRuleScorer.Result weakResult = scorer.score(PROFILE, weak);

        assertThat(strongResult.eligible()).isTrue();
        assertThat(weakResult.eligible()).isTrue();
        assertThat(strongResult.score()).isGreaterThan(weakResult.score());
    }

    @Test
    void twoOrMoreLevelsAwayIsIneligible() {
        OpportunityRuleScorer.Result result = scorer.score(
            PROFILE,
            candidate("Backend Engineering Intern", "Remote (US)", "Java Kafka", null, "REMOTE", true)
        );

        assertThat(result.eligible()).isFalse();
        assertThat(result.score()).isZero();
        assertThat(result.signals().seniorityGap()).isEqualTo(3);
        assertThat(result.reason()).contains("level");
    }

    @Test
    void oneLevelAwayIsStillEligibleButReceivesLessSeniorityCredit() {
        OpportunityRuleScorer.Result exact = scorer.score(
            PROFILE,
            candidate("Senior Backend Engineer", "Remote (US)", "Java Kafka", null, "REMOTE", true)
        );
        OpportunityRuleScorer.Result adjacent = scorer.score(
            PROFILE,
            candidate("Staff Backend Engineer", "Remote (US)", "Java Kafka", null, "REMOTE", true)
        );

        assertThat(adjacent.eligible()).isTrue();
        assertThat(adjacent.signals().seniorityGap()).isEqualTo(1);
        assertThat(adjacent.signals().seniorityPoints()).isLessThan(exact.signals().seniorityPoints());
        assertThat(adjacent.score()).isLessThan(exact.score());
    }

    @Test
    void noMeaningfulTitleOrSkillAlignmentIsIneligible() {
        OpportunityRuleScorer.Result result = scorer.score(
            PROFILE,
            candidate("Account Executive", "Remote (US)", "Sell our Java platform", null, "REMOTE", true)
        );

        assertThat(result.eligible()).isFalse();
        assertThat(result.score()).isZero();
        assertThat(result.reason()).contains("title or skills");
    }

    @Test
    void locationOutsideTheProfileIsIneligible() {
        OpportunityRuleScorer.Result result = scorer.score(
            PROFILE,
            candidate("Senior Backend Engineer", "Berlin, Germany", "Java Kafka", null, "ONSITE", false)
        );

        assertThat(result.eligible()).isFalse();
        assertThat(result.score()).isZero();
        assertThat(result.signals().locationFit()).isEqualTo(OpportunityRuleScorer.LocationFit.NOT_FIT);
    }

    private static Candidate candidate(
        String title,
        String location,
        String description,
        String skillsJson,
        String workplaceType,
        Boolean remote
    ) {
        return new Candidate(
            7L,
            Source.PUBLIC_POSTING,
            null,
            100L,
            "JOB_POSTING",
            title,
            "Acme",
            location,
            workplaceType,
            remote,
            "https://jobs.example/100",
            "https://jobs.example/apply/100",
            description,
            skillsJson,
            "BOARD_API",
            "candidate-100",
            null,
            null,
            10
        );
    }
}
