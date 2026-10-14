package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The Clients page (board "Clients"): the wire shapes of {@code /api/orgs/{orgId}/clients}. A client is a {@code client_account} row.
 * Requests carry only the fields named here (an unknown JSON property is refused) and never an organization id. Contacts carry a name,
 * a title and a WORK e-mail only: no phone, no private address, no photo. Nothing here carries a birth date, document or bank number.
 */
public final class ClientDTO {

    private ClientDTO() {}

    public record Person(Long id, String name) {}

    /** {@code level} is HEALTHY, AT_RISK or NEUTRAL; {@code reason} is the sentence of the rule that produced it. */
    public record Health(String level, String reason) {}

    public record Row(
        Long id,
        String name,
        String industry,
        String status,
        String website,
        int openRequirements,
        int activeConsultants,
        Person manager,
        Health health,
        Instant lastActivityAt
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** A KPI tile: {@code previous} / {@code delta} / {@code deltaPercent} are null when the history does not exist; {@code series} is weekly, oldest first. */
    public record Tile(long value, Long previous, Long delta, Double deltaPercent, List<Long> series) {}

    public record Facet(String value, String label, int count) {}

    public record Facets(List<Facet> industries, List<Facet> health, List<Facet> statuses, List<Facet> sizes, List<Facet> managers) {}

    /** What the caller may do on this page (the API is the gate; the page only hides buttons). */
    public record Access(boolean canManage, boolean canCreateRequirement) {}

    /** The rule behind the badge, so the page can say it in words: the two thresholds (organization settings). */
    public record Rule(int healthyDays, int atRiskDays) {}

    public record Summary(Tile totalClients, Tile activeRequirements, Tile newThisMonth, Tile placementsViaClients, Instant asOf, Facets facets, Rule healthRule, List<Person> managerOptions, Access access) {}

    public record Contact(Long id, String name, String title, String email, String role, String status, Instant addedAt) {}

    public record RequirementItem(Long id, String title, String status, int positions, int filled, String location, Instant postedAt, int submissions) {}

    public record SubmissionItem(Long applicationId, String code, Long consultantId, String consultantName, String jobTitle, String stage, String closedReason, Instant at) {}

    public record NoteItem(Long id, String body, Instant at, String author) {}

    public record Detail(
        Long id,
        String name,
        String status,
        String industry,
        String website,
        String location,
        String sizeBand,
        LocalDate clientSince,
        String about,
        Person manager,
        Health health,
        int openRequirements,
        int activeConsultants,
        int placements,
        Instant lastActivityAt,
        List<Contact> contacts,
        int contactCount,
        List<RequirementItem> requirements,
        int requirementCount,
        List<SubmissionItem> submissions,
        List<NoteItem> notes,
        int noteCount,
        String version,
        Access access
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record CreateRequest(String name, String industry, String website, String location, String sizeBand, LocalDate clientSince, String about, String status, Long ownerMemberId) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record ContactRequest(String name, String title, String email, String role) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record NoteRequest(String body) {}

    // ---- the three other tabs ------------------------------------------------------------------------------------------

    public record ClientRef(Long id, String name) {}

    public record ContactRow(Long id, String name, String title, String email, String role, String status, ClientRef client, Instant addedAt) {}

    public record ContactPage(List<ContactRow> items, int page, int size, long total, boolean hasNext) {}

    public record RequirementRow(Long id, String title, ClientRef client, String status, int positions, int filled, String location, Instant postedAt, int submissions) {}

    public record RequirementPage(List<RequirementRow> items, int page, int size, long total, boolean hasNext) {}

    /** {@code kind}: client, contact, note, requirement, submission, placement. */
    public record ActivityItem(Instant at, String kind, String summary, ClientRef client, String actor) {}

    public record ActivityFeed(List<ActivityItem> items) {}
}
