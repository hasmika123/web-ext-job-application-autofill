package com.dossier.api.service.retirement.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * How well the ranked successors cover the people being retired (docs/subscriptions/11 sections 5.1 and 11; story K10.2): for the wizard's coverage preview ("198 fully
 * covered, 14 with gaps") and its price check ("0 would pay more, so migrating at renewal is allowed"). Counts only; no login appears here.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record CoverageDTO(
    int subscribers,
    int fullyCovered,
    int withGaps,
    int wouldPayMore,
    int unavailable,
    List<SuccessorCoverage> bySuccessor,
    List<GapFeature> gapFeatures,
    boolean migrateAllowed
) {
    /** Per ranked successor: how many subscribers it would cover completely, leave with gaps, or charge more than they pay today. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SuccessorCoverage(String planKey, String featureKey, String name, int rank, int fullyCovered, int withGaps, int wouldPayMore, int notSold) {}

    /** A service some subscribers use that the best successor (for them) does not cover. */
    public record GapFeature(String featureKey, String name, int count) {}
}
