package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * The Jobs page (talent board "Jobs"): the wire shapes of {@code /api/orgs/{orgId}/jobs}. A job is a {@code client_requirement} row.
 * Requests carry only the fields named here (an unknown JSON property is refused) and never an organization id. Money is whole currency
 * units on the wire (the table keeps minor units). Nothing here carries a phone number, birth date, document or bank number, or a photo.
 */
public final class JobDTO {

    private JobDTO() {}

    /** Most jobs one bulk call may name. */
    public static final int BULK_MAX = 100;

    public record ClientRef(Long id, String name) {}

    /** A consultant chip of a row: initials come from the name on the page, there are no photos. */
    public record MatchChip(Long consultantId, String name, int score) {}

    /** {@code count} live matches (not dismissed), the best score or null, and the top three for the avatar stack. */
    public record MatchSummary(int count, Integer best, List<MatchChip> top) {}

    public record Row(
        Long id,
        String title,
        ClientRef client,
        String location,
        String workMode,
        String employment,
        String experienceLevel,
        String status,
        Instant postedAt,
        List<String> skills,
        int submissions,
        MatchSummary matches,
        int positions,
        int filled
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** A KPI tile: {@code previous} / {@code delta} / {@code deltaPercent} are null when the history does not exist; {@code series} is weekly, oldest first. */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {}

    public record Facet(String value, String label, int count) {}

    public record Facets(List<Facet> statuses, List<Facet> clients, List<Facet> locations, List<Facet> workModes, List<Facet> employment, List<Facet> experience, List<Facet> skills) {}

    /** What the caller may do on this page (the API is the gate; the page only hides buttons). */
    public record Access(boolean canCreate, boolean canEdit, boolean canAssign) {}

    /** A client the Create Job form can pick, with its contacts (business name, title and work email only). */
    public record ClientOption(Long id, String name, List<Contact> contacts) {}

    public record Summary(Tile openJobs, Tile newThisWeek, Tile assignedOpportunities, Tile highMatchJobs, Instant asOf, Facets facets, List<ClientOption> clientOptions, Access access) {}

    public record Contact(Long id, String name, String title, String email) {}

    /** Whole currency units; null when the job states no rate. */
    public record Rate(Long min, Long max, String unit, String currency) {}

    public record TopMatch(
        Long matchId,
        Long consultantId,
        String name,
        String title,
        String availability,
        String location,
        int score,
        String reason,
        String status,
        String applicationCode
    ) {}

    public record Submission(Long applicationId, String code, Long consultantId, String consultantName, String stage, String closedReason, LocalDate appliedOn) {}

    public record ActivityItem(Instant at, String kind, String summary, String actor) {}

    public record Detail(
        Long id,
        String title,
        ClientRef client,
        String clientIndustry,
        Contact contact,
        String description,
        String location,
        String workMode,
        String employment,
        String durationLabel,
        String experienceLevel,
        Rate rate,
        int positions,
        int filled,
        String status,
        Instant postedAt,
        Instant closedAt,
        List<String> skills,
        List<TopMatch> topMatches,
        List<Submission> submissions,
        int submissionCount,
        List<ActivityItem> activity,
        String version,
        Access access
    ) {}

    /** {@code skills} replaces the list when present. Rates are whole currency units. */
    @JsonIgnoreProperties(ignoreUnknown = false)
    public record CreateRequest(
        String title,
        Long clientId,
        Long contactId,
        String description,
        String location,
        String workMode,
        String employment,
        String durationLabel,
        String experienceLevel,
        Long rateMin,
        Long rateMax,
        String rateUnit,
        Integer positions,
        String status,
        List<String> skills
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record BulkStatusRequest(List<Long> ids, String status) {}

    public record Skipped(Long id, String reason) {}

    /** {@code previous} is the status the job had, so the page can send the reverse call as its Undo. */
    public record RowResult(Long id, boolean ok, String reason, Map<String, Object> previous) {}

    public record BulkResult(String action, int requested, int ok, List<Skipped> skipped, List<RowResult> results) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record MatchRequest(String status) {}

    public record AssignResult(Detail job, Long applicationId, String applicationCode, boolean alreadyAssigned) {}
}
