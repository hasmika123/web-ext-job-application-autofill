package com.dossier.api.service.ent.mkt.talent;

import com.dossier.api.service.dto.ChangeActorDTO;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.Availability;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.DetailInterview;
import com.dossier.api.service.ent.mkt.talent.MktTalentDtos.ResumeStatus;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * The wire type of {@code GET /api/orgs/{orgId}/mkt/talent/{consultantId}/overview}: everything an ASSIGNED marketer sees about one of their consultants on
 * "My Assigned Talent" (decision O5), in one call. Never carried: identity numbers (SSN, tax id, passport or visa numbers), date of birth, bank details,
 * money of any kind (no rates, no bill amounts), timesheets. A phone number and a time zone are not stored for a consultant, so they are not part of it.
 */
public final class MktTalentOverviewDtos {

    private MktTalentOverviewDtos() {}

    /** {@code workAuthorization} is the stored status LABEL (for example "Citizen"), null when none is stored. */
    public record Contact(String workEmail, String location, String workAuthorization) {}

    /** The consultant's current placement: role, client and start date only. */
    public record Placement(Long placementId, String roleTitle, String client, LocalDate startDate, String status) {}

    public record OverviewResume(Long id, String name, int version, boolean primary, String approval, Instant updatedAt) {}

    public record StageCount(String key, String label, int count) {}

    /** {@code updatedBy} is the change-audit actor of the last change (a name and its relation to the consultant), never an enterprise login. */
    public record RecentApplication(String code, String jobTitle, String client, String stage, String stageKey, String nextAction, Instant updatedAt, ChangeActorDTO updatedBy) {}

    public record ApplicationsSummary(int total, int open, List<StageCount> byStage, List<RecentApplication> recent) {}

    public record Overview(
        Long id,
        String name,
        String title,
        String headline,
        Integer yearsExperience,
        String workMode,
        Availability availability,
        ResumeStatus resume,
        int profileCompleteness,
        Contact contact,
        List<String> skills,
        Placement placement,
        List<OverviewResume> resumes,
        ApplicationsSummary applications,
        List<DetailInterview> interviews
    ) {}
}
