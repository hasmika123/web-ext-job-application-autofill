package com.dossier.api.service.ent.tracker;

import com.dossier.api.domain.enumeration.ApplicationStatus;
import com.dossier.api.service.ApplicationSyncService;
import com.dossier.api.service.dto.ApplicationDTO;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.privacy.SensitiveContent;
import com.dossier.api.service.ent.tracker.TrackerActForGate.Grant;
import com.dossier.api.service.tracker.TrackerActAs;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A marketer saves a job onto an assigned consultant's own application tracker (X9.15; the write behind X9.12's "Save for consultant"). The
 * application is the CONSULTANT's ({@code user_id}), status SAVED, source {@code org}; the history says it was the marketer who saved it, for the
 * consultant ({@code actor_kind PERSON}, actor = marketer, {@code on_behalf_of} = consultant), and the application's created_by / updated_by name
 * the marketer. The marketer's own tracker is untouched.
 *
 * <p>It runs the EXISTING {@link ApplicationSyncService#upsertApplication} unchanged inside {@link TrackerActAs#run}; this is the only code that opens
 * that window, for the length of this one call, after {@link TrackerActForGate} proved the access (anything short of it is the generic 404 and nothing is
 * written). The request is a whitelist of job facts (no description, salary, e-mail or notes: free text a marketer types must not land in a person's
 * tracker), and a job the consultant already has keeps its status (a re-save never pulls an APPLIED job back to SAVED). E1: this records a saved
 * job; it never applies, fills or signs in as anyone.
 *
 * <p>The org security trail gets one {@code MARKETER_SAVE_FOR_CONSULTANT} row (MEDIUM, beneficiary = the consultant's login): the history row is for the
 * person, the audit row is for the organization. The audit row and the application commit or roll back together.
 */
@Service
public class SaveForConsultantService {

    public static final String SOURCE = "org";

    /** The job facts a marketer may save for a consultant. Everything else about the application is the consultant's to add. */
    public record Request(String company, String roleTitle, String jobUrl, String location, String externalJobId, String atsPlatform, Long postingId) {}

    /** The consultant's application as their tracker holds it, and whether they already had this job (an idempotent re-save). */
    public record Outcome(ApplicationDTO application, boolean alreadySaved) {}

    private final TrackerActForGate gate;
    private final ApplicationSyncService sync;
    private final OrgAuditService audit;

    public SaveForConsultantService(TrackerActForGate gate, ApplicationSyncService sync, OrgAuditService audit) {
        this.gate = gate;
        this.sync = sync;
        this.audit = audit;
    }

    /** Saves the job for the consultant whose seat is {@code consultantMemberId}; returns the consultant's application as the consultant's tracker holds it. */
    @Transactional
    public ApplicationDTO save(OrgMembership me, Long consultantMemberId, Request request) {
        return saveWithOutcome(me, consultantMemberId, request).application();
    }

    /** {@link #save}, also telling whether the consultant already had this job (matched by {@code ApplicationKeys}: the same posting is never saved twice). */
    @Transactional
    public Outcome saveWithOutcome(OrgMembership me, Long consultantMemberId, Request request) {
        Grant grant = gate.authorize(me, consultantMemberId);
        if (request == null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "a job is required");
        SensitiveContent.check("company", "company", request.company());
        SensitiveContent.check("roleTitle", "roleTitle", request.roleTitle());
        SensitiveContent.check("location", "location", request.location());

        ApplicationDTO dto = new ApplicationDTO();
        dto.setCompany(request.company());
        dto.setRoleTitle(request.roleTitle());
        dto.setJobUrl(request.jobUrl());
        dto.setExternalJobId(request.externalJobId());
        dto.setAtsPlatform(request.atsPlatform());

        java.util.concurrent.atomic.AtomicBoolean existed = new java.util.concurrent.atomic.AtomicBoolean(false);
        ApplicationDTO saved = TrackerActAs.run(
            grant.owner(),
            grant.scope(),
            () -> {
                // A job the consultant already has is only re-identified: its status, source, location and the rest stay the consultant's.
                existed.set(sync.hasEntryFor(dto));
                if (!existed.get()) {
                    dto.setLocation(request.location());
                    dto.setPostingId(request.postingId());
                    dto.setStatus(ApplicationStatus.SAVED);
                    dto.setSource(SOURCE);
                }
                return sync.upsertApplication(dto);
            }
        );

        audit.record(
            me.orgId(),
            me.login(),
            me.role(),
            OrgAuditService.MARKETER_SAVE_FOR_CONSULTANT,
            OrgAuditService.TARGET_MEMBER,
            grant.owner().getLogin(),
            String.valueOf(consultantMemberId),
            "applicationId=" + saved.getId(),
            null,
            null,
            grant.owner().getLogin(),
            "MEDIUM"
        );
        return new Outcome(saved, existed.get());
    }
}
