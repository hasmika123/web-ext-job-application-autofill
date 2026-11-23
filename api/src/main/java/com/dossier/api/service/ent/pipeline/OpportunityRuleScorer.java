package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.JobPosting;
import com.dossier.api.service.jobs.JobPrefilter;
import com.dossier.api.service.jobs.MatchPreferences;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.springframework.stereotype.Service;

/**
 * Deterministic rule scoring for projected organization opportunities. This class deliberately has no repository,
 * AI, entitlement, consent, actor, or match-write dependency; the later run service owns those concerns.
 */
@Service
public class OpportunityRuleScorer {

    public static final String ALGORITHM_VERSION = "RULE_V1";
    public static final int MAX_REASON_LENGTH = 300;

    public enum LocationFit {
        LOCAL_OR_MATCHING_REMOTE,
        WORKABLE,
        UNKNOWN,
        NOT_FIT
    }

    /** Individual signals are exposed so a later Matches projection can explain the score without re-scoring. */
    public record Signals(
        List<String> matchedTitleWords,
        List<String> matchedSkills,
        LocationFit locationFit,
        int seniorityGap,
        int titlePoints,
        int skillPoints,
        int locationPoints,
        int seniorityPoints
    ) {}

    public record Result(boolean eligible, int score, Signals signals, List<String> reasons, String reason) {}

    public Result score(MatchPreferences preferences, OpportunityCandidateProjector.Candidate candidate) {
        Objects.requireNonNull(preferences, "preferences");
        Objects.requireNonNull(candidate, "candidate");

        JobPrefilter.Evaluation evaluation = JobPrefilter.evaluate(preferences, asPosting(candidate));
        LocationFit locationFit = locationFit(preferences, candidate, evaluation);
        int titlePoints = Math.min(40, evaluation.titleTellingMatches() * 20 + evaluation.titleGenericMatches() * 8);
        int skillPoints = Math.min(35, evaluation.matchedSkills().size() * 5);
        int locationPoints = locationFit == LocationFit.LOCAL_OR_MATCHING_REMOTE ? 15 : 0;
        int seniorityPoints = evaluation.seniorityGap() == 0 ? 10 : evaluation.seniorityGap() == 1 ? 5 : 0;
        boolean eligible = evaluation.eligible();
        int score = eligible ? clamp(titlePoints + skillPoints + locationPoints + seniorityPoints) : 0;

        Signals signals = new Signals(
            evaluation.matchedTitleWords(),
            evaluation.matchedSkills(),
            locationFit,
            evaluation.seniorityGap(),
            titlePoints,
            skillPoints,
            locationPoints,
            seniorityPoints
        );
        List<String> reasons = buildReasons(evaluation, locationFit);
        return new Result(eligible, score, signals, reasons, compact(reasons));
    }

    private static JobPosting asPosting(OpportunityCandidateProjector.Candidate candidate) {
        JobPosting posting = new JobPosting();
        posting.setTitle(candidate.title());
        posting.setLocation(candidate.location());
        posting.setWorkplaceType(candidate.workplaceType());
        posting.setRemote(candidate.remote());
        posting.setDescriptionText(combineDescription(candidate.descriptionText(), candidate.skillsJson()));
        return posting;
    }

    private static String combineDescription(String description, String skillsJson) {
        if (description == null || description.isBlank()) return skillsJson;
        if (skillsJson == null || skillsJson.isBlank()) return description;
        return description + "\n" + skillsJson;
    }

    private static LocationFit locationFit(
        MatchPreferences preferences,
        OpportunityCandidateProjector.Candidate candidate,
        JobPrefilter.Evaluation evaluation
    ) {
        if (!evaluation.locationAllowed()) return LocationFit.NOT_FIT;
        if (!hasLocation(preferences) || candidate.location() == null || candidate.location().isBlank()) return LocationFit.UNKNOWN;
        return evaluation.locationFit() >= 2 ? LocationFit.LOCAL_OR_MATCHING_REMOTE : LocationFit.WORKABLE;
    }

    private static boolean hasLocation(MatchPreferences preferences) {
        return hasText(preferences.city()) || hasText(preferences.state()) || hasText(preferences.country());
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static List<String> buildReasons(JobPrefilter.Evaluation evaluation, LocationFit locationFit) {
        if (!evaluation.locationAllowed()) return List.of("location does not fit stated preferences");
        if (!evaluation.seniorityAllowed()) return List.of("level is more than one step from the profile");
        if (!evaluation.lineOfWork()) return List.of("no matching title or skills");

        List<String> reasons = new ArrayList<>();
        if (!evaluation.matchedTitleWords().isEmpty()) {
            reasons.add("Title: " + String.join(", ", evaluation.matchedTitleWords()));
        }
        if (!evaluation.matchedSkills().isEmpty()) {
            reasons.add("Skills: " + String.join(", ", evaluation.matchedSkills()));
        }
        switch (locationFit) {
            case LOCAL_OR_MATCHING_REMOTE -> reasons.add("Location: local or matching remote");
            case WORKABLE -> reasons.add("Location: workable, review details");
            case UNKNOWN -> {
                // Unknown location contributes no points and is not represented as a positive claim.
            }
            case NOT_FIT -> throw new IllegalStateException("ineligible location reached eligible reason path");
        }
        if (evaluation.seniorityGap() == 0) reasons.add("Level: exact match");
        else if (evaluation.seniorityGap() == 1) reasons.add("Level: one step away");
        return reasons.isEmpty() ? List.of("limited deterministic profile signal") : List.copyOf(reasons);
    }

    private static int clamp(int value) {
        return Math.max(0, Math.min(100, value));
    }

    private static String compact(List<String> reasons) {
        String reason = String.join(" · ", reasons);
        return reason.length() <= MAX_REASON_LENGTH ? reason : reason.substring(0, MAX_REASON_LENGTH - 3) + "...";
    }
}
