package com.dossier.api.service.ent.consultant;

import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.TalentApplication;
import com.dossier.api.domain.ent.talent.TalentApplicationEvent;
import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.repository.ent.consultant.ConProjectionRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.TalentApplicationEventRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * The org's read-only mirror ({@code talent_application}) of a consultant's OWN application (doc 60 section 0.3 and 0.4). Only called when the
 * consultant's consent is FULL: a SUMMARY consultant gets the opportunity state and nothing more, NONE gets nothing.
 *
 * <p>The row is SYSTEM-owned from the moment it carries a {@code personal_application_id}: the marketer's {@code recordStage} refuses it (409
 * {@code STAGE_OWNED_BY_CONSULTANT}) and only the consultant's own record moves it, through {@link #mirror}. Nothing here changes the application itself.
 */
@Component
public class LinkedApplicationProjection {

    public static final String ENTRY_LINKED = "LINKED";
    public static final String SOURCE_SYSTEM = "SYSTEM";

    private final ConProjectionRepository projections;
    private final TalentApplicationEventRepository events;
    private final ClientRequirementRepository requirements;
    private final Clock clock;

    @Autowired
    public LinkedApplicationProjection(ConProjectionRepository projections, TalentApplicationEventRepository events, ClientRequirementRepository requirements) {
        this(projections, events, requirements, Clock.systemUTC());
    }

    LinkedApplicationProjection(ConProjectionRepository projections, TalentApplicationEventRepository events, ClientRequirementRepository requirements, Clock clock) {
        this.projections = projections;
        this.events = events;
        this.requirements = requirements;
        this.clock = clock;
    }

    /**
     * The projection row of (job, consultant) for this personal application: an existing row is attached to it (its entry path is kept), a missing one
     * is created with {@code entry_path=LINKED, stage_source=SYSTEM}. Returns the row id, or null when the job has no client (nothing to project).
     */
    public Long upsert(Long orgId, Long opportunityId, Long jobId, Long consultantId, Long marketerMemberId, Long personalApplicationId, Instant appliedAt) {
        Instant now = clock.instant();
        Optional<TalentApplication> found = projections.findByOrgIdAndRequirementIdAndConsultantId(orgId, jobId, consultantId);
        TalentApplication row;
        String detail;
        if (found.isPresent()) {
            row = found.get();
            if (personalApplicationId.equals(row.getPersonalApplicationId())) return row.getId(); // already this application: nothing to do
            row.setPersonalApplicationId(personalApplicationId);
            row.setStageSource(SOURCE_SYSTEM);
            row.setUpdatedAt(now);
            detail = "Linked to the consultant's own application";
        } else {
            ClientRequirement job = requirements.findByOrgIdAndId(orgId, jobId).orElse(null);
            if (job == null || job.getClientId() == null) return null;
            row = new TalentApplication();
            row.setOrgId(orgId);
            row.setCode("LNK-" + opportunityId);
            row.setRequirementId(jobId);
            row.setConsultantId(consultantId);
            row.setClientId(job.getClientId());
            row.setMarketerMemberId(marketerMemberId);
            row.setStage("SUBMITTED");
            row.setAppliedOn((appliedAt == null ? now : appliedAt).atZone(ZoneOffset.UTC).toLocalDate());
            row.setSourceLabel("Linked application");
            row.setStageChangedAt(now);
            row.setCreatedAt(now);
            row.setUpdatedAt(now);
            row.setPersonalApplicationId(personalApplicationId);
            row.setEntryPath(ENTRY_LINKED);
            row.setStageSource(SOURCE_SYSTEM);
            detail = "Created from the consultant's own application";
        }
        row = projections.save(row);
        event(orgId, row.getId(), "LINKED", null, row.getStage(), detail, now);
        return row.getId();
    }

    /** Detach on unlink: the row keeps its history, but the consultant's record no longer feeds it and the marketer may record a stage again. */
    public void detach(Long orgId, Long talentApplicationId) {
        if (talentApplicationId == null) return;
        projections.findByOrgIdAndId(orgId, talentApplicationId).ifPresent(row -> {
            Instant now = clock.instant();
            row.setPersonalApplicationId(null);
            row.setUpdatedAt(now);
            projections.save(row);
            event(orgId, row.getId(), "UNLINKED", row.getStage(), row.getStage(), "The consultant unlinked their application", now);
        });
    }

    /** The consultant's own application moved: follow it on every row it feeds in this org (FULL consent only, checked by the caller). */
    public void mirror(Long orgId, Long personalApplicationId, ApplicationStatus to) {
        String stage = stageOf(to);
        if (stage == null) return;
        String closedReason = to == ApplicationStatus.REJECTED ? "REJECTED" : to == ApplicationStatus.WITHDRAWN ? "WITHDRAWN" : null;
        Instant now = clock.instant();
        List<TalentApplication> rows = projections.findByOrgIdAndPersonalApplicationId(orgId, personalApplicationId);
        for (TalentApplication row : rows) {
            if (stage.equals(row.getStage()) && java.util.Objects.equals(closedReason, row.getClosedReason())) continue;
            String from = row.getStage();
            row.setStage(stage);
            row.setClosedReason(closedReason);
            row.setStageSource(SOURCE_SYSTEM);
            row.setStageChangedAt(now);
            row.setUpdatedAt(now);
            projections.save(row);
            event(orgId, row.getId(), "STAGE_CHANGE", from, stage, "Followed the consultant's own application", now);
        }
    }

    /** The stored stage an application status maps to; null for the statuses that do not move a stage (DRAFT, SAVED, APPLIED). */
    static String stageOf(ApplicationStatus s) {
        if (s == null) return null;
        return switch (s) {
            case IN_REVIEW -> "UNDER_REVIEW";
            case INTERVIEW -> "INTERVIEWING";
            case OFFER -> "OFFER";
            case REJECTED, WITHDRAWN -> "CLOSED";
            default -> null;
        };
    }

    private void event(Long orgId, Long applicationId, String type, String from, String to, String detail, Instant at) {
        TalentApplicationEvent e = new TalentApplicationEvent();
        e.setOrgId(orgId);
        e.setApplicationId(applicationId);
        e.setEventType(type);
        e.setFromStage(from);
        e.setToStage(to);
        e.setDetail(detail);
        e.setOccurredAt(at);
        events.save(e);
    }
}
