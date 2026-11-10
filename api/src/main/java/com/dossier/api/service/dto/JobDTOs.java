package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Job search over the posting store (E2E-U4.0). The page shape is the shared list shape
 * ({@code items, total, page, size}) plus what search adds: facets, "try this instead" suggestions and, for an
 * admin who asked, why each result ranked where it did.
 */
public final class JobDTOs {

    private JobDTOs() {}

    /** Where a posting came from: {@code kind} is ATS today (an aggregator arrives later), {@code platform} the board's name. */
    public record JobCardSource(String kind, String platform, String label) {}

    /** The nightly match score (Pro only), never computed in a search request. */
    public record JobCardMatch(int score, String reason) {}

    /** The ranking terms of one result (admins, {@code ?explain=1}). */
    public record JobExplain(double score, double relevance, double recency, double preference) {}

    /**
     * One result.
     *
     * @param remote true when the posting is remote (a stated workplace type wins over the board's remote flag)
     * @param employmentType FULL_TIME, PART_TIME, CONTRACT or INTERNSHIP when the board's words say so, else null
     * @param saved whether the user already tracks this posting (a SAVED or later application)
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record JobCard(
        Long id,
        String title,
        String company,
        String companyKey,
        String location,
        boolean remote,
        String workplaceType,
        String employmentType,
        Instant publishedAt,
        JobCardSource source,
        String applyAts,
        boolean saved,
        JobCardMatch match,
        JobExplain explain
    ) {}

    /** Counts of matching postings by each facet value, each ignoring its own filter so alternatives stay visible. */
    public record JobFacets(Map<String, Long> remote, Map<String, Long> type, Map<String, Long> postedBuckets) {}

    /** A cheaper search and how many postings it would find: {@code params} are the query parameters to use. */
    public record JobRelax(String label, Map<String, String> params, long total) {}

    /**
     * @param capped true when more postings match than the search will page through: say "narrow your search"
     * @param tookMs how long the search took, for the curious
     */
    public record JobSearchPage(
        List<JobCard> items,
        long total,
        int page,
        int size,
        boolean capped,
        long tookMs,
        JobFacets facets,
        List<JobRelax> suggestions
    ) {}

    /** One posting in full: the card plus its description (plain text, cut at a word) and links. */
    public record JobDetail(JobCard card, String descriptionText, String url, String applyUrl, long companyJobsCount, List<JobCard> similar) {}

    /** The request body of a feedback call. */
    public record FeedbackRequest(String signal) {}

    /** What hiding did: the SAVED application it put away (null when there was none), so the UI can offer Undo. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record FeedbackResult(String signal, Long archivedApplicationId) {}
}
