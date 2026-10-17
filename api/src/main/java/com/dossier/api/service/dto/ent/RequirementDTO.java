package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Wire shapes of the Account Manager's Requirements page and Home tiles (Enterprise V2, X10.2 / X10.5). A requirement is a
 * {@code client_requirement} row. Rates are business data in whole currency units (never a bank or tax value). Requests carry only the
 * fields named here (an unknown JSON property is refused) and never an organization id.
 */
public final class RequirementDTO {

    private RequirementDTO() {}

    public record ClientRef(Long id, String name) {}

    public record Rate(Long min, Long max, String unit, String currency) {}

    public record Row(
        Long id,
        String title,
        ClientRef client,
        String location,
        String workMode,
        String priority,
        String status,
        int positions,
        int filled,
        Rate rate,
        List<String> skills,
        LocalDate dueOn,
        Instant postedAt,
        int ageDays,
        int consultantCount,
        String source
    ) {}

    public record Page(List<Row> items, int page, int size, long total, boolean hasNext) {}

    /** A consultant the requirement was put in front of; the consultant still decides (they apply, nobody applies for them). */
    public record Assignee(Long consultantId, String name, String title, String matchStatus, String stage, Instant assignedAt) {}

    public record Contact(Long id, String name, String title) {}

    public record Access(boolean canCreate, boolean canEdit, boolean canAssign) {}

    public record Detail(
        Row requirement,
        String description,
        String employment,
        String durationLabel,
        String experienceLevel,
        Contact contact,
        String jobUrl,
        List<Assignee> assignees,
        String version,
        Access access
    ) {}

    public record ContactOption(Long id, String name) {}

    public record ClientOption(Long id, String name, List<ContactOption> contacts) {}

    /** The Home tiles and the page's filter facets in one answer. {@code agingDays} is the organization's setting behind the Aging figure. */
    public record Summary(
        long open,
        long unassigned,
        long aging,
        long onHold,
        long contacts,
        int agingDays,
        Instant asOf,
        List<ClientOption> clientOptions,
        Access access
    ) {}

    /** A consultant the Account Manager may put a requirement in front of (name, title and availability only). */
    public record Candidate(Long consultantId, String name, String title, String availability, Integer score, String matchStatus, String pausedReason) {}

    /**
     * Intake. {@code source} is MANUAL (default), PASTED_TEXT (the client's text is pasted into {@code description}) or LINK (the posting address is
     * {@code sourceUrl}). Rates are whole currency units.
     */
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
        String priority,
        LocalDate dueOn,
        List<String> skills,
        String source,
        String sourceUrl
    ) {}

    @JsonIgnoreProperties(ignoreUnknown = false)
    public record AssignRequest(Long consultantId) {}

    public record AssignResult(Detail requirement, Long consultantId, boolean created, boolean existing) {}
}
