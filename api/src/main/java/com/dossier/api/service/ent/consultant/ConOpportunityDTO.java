package com.dossier.api.service.ent.consultant;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * An assigned opportunity as the CONSULTANT sees it (doc 60 section 4). Forbidden in any {@code Con*} DTO (the reflection test in
 * {@code NoSubmitSurfaceTest} pins it): a rate beyond {@code payLabel}, a client contact, another consultant, a marketer-internal note,
 * {@code ownerMemberId}. {@code marketerNote} is the note the marketer addressed to THIS consultant when assigning, not an internal one.
 *
 * <p>{@code allowedActions} is computed on the server from the state and the link; the page renders its buttons from it and nowhere else.
 */
public record ConOpportunityDTO(
    Long id,
    String state,
    Job job,
    String marketerNote,
    AssignedBy assignedBy,
    Instant assignedAt,
    String priority,
    LocalDate dueOn,
    String infoRequest,
    String infoAnswer,
    Instant appliedAt,
    Long linkedApplicationId,
    List<String> allowedActions,
    long version
) {
    /** The trimmed job: facts and the link, never the full posting text. Built by {@link ConJobDtoFactory} only. */
    public record Job(
        Long id,
        String title,
        String company,
        String location,
        String workMode,
        String employmentType,
        String payLabel,
        String jobUrl,
        String atsPlatform,
        String externalJobId,
        LocalDate postedOn,
        List<String> skills
    ) {}

    /** The marketer who assigned it. */
    public record AssignedBy(Long memberId, String name) {}

    /** {@code GET .../con/opportunities}: one page and the total behind the filter. */
    public record ListResponse(List<ConOpportunityDTO> items, long total) {}
}
