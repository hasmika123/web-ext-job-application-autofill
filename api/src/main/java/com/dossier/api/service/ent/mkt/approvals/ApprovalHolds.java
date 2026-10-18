package com.dossier.api.service.ent.mkt.approvals;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mgmt.MktApprovalRequestRepository;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.pipeline.DuplicateGuard;
import com.dossier.api.service.ent.pipeline.PipelineGuardSettings;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Where the existing flows park a step for a manager (docs/enterprise-v2/deferred/marketing-manager.md section 4.1.1). A hold is a one-line insertion at the
 * call site behind a setting whose default changes nothing ({@code org.pipeline.manager_approval} NEVER, {@code org.pipeline.duplicate_policy} WARN,
 * {@code org.resumes.manager_review} false).
 *
 * <p>The assignment holds answer the caller with a 409 (the caller's own transaction is rolled back by it), yet the request, the suggested pair and the link
 * between them must SURVIVE the answer, so they are written in a transaction of their own ({@code REQUIRES_NEW}), in one piece: the match (SUGGESTED; an
 * already-assigned pair that is being reopened stays as it is), the opportunity overlay, the PENDING request and {@code mkt_opportunity.approval_request_id}.
 * Nothing in the held pair reaches the consultant until a manager approves. A second attempt while a request is open is 409 {@code APPROVAL_PENDING} naming it.
 *
 * <p>E1: this parks an assignment (a record that a marketer put a job in front of a consultant); it never submits an application.
 */
@Service
public class ApprovalHolds {

    /** What the held assignment was asked to do, so the manager's approval can carry it out exactly. */
    public record Spec(Long ownerMemberId, boolean askInterest, String marketerNote, String priority, LocalDate dueOn, Integer score, String matchReason, String source) {}

    private final PipelineGuardSettings settings;
    private final ApprovalService approvals;
    private final MktApprovalRequestRepository requests;
    private final RequirementMatchRepository matches;
    private final MktOpportunityRepository opportunities;
    private final ConsultantProfileRepository consultants;
    private final ClientAccountRepository clients;
    private final MarketerAssignmentRepository assignments;
    private final PlatformTransactionManager txm;
    private final ObjectMapper json;
    private final Clock clock;

    public ApprovalHolds(
        PipelineGuardSettings settings,
        ApprovalService approvals,
        MktApprovalRequestRepository requests,
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerAssignmentRepository assignments,
        PlatformTransactionManager txm,
        ObjectMapper json
    ) {
        this(settings, approvals, requests, matches, opportunities, consultants, clients, assignments, txm, json, Clock.systemUTC());
    }

    ApprovalHolds(
        PipelineGuardSettings settings,
        ApprovalService approvals,
        MktApprovalRequestRepository requests,
        RequirementMatchRepository matches,
        MktOpportunityRepository opportunities,
        ConsultantProfileRepository consultants,
        ClientAccountRepository clients,
        MarketerAssignmentRepository assignments,
        PlatformTransactionManager txm,
        ObjectMapper json,
        Clock clock
    ) {
        this.settings = settings;
        this.approvals = approvals;
        this.requests = requests;
        this.matches = matches;
        this.opportunities = opportunities;
        this.consultants = consultants;
        this.clients = clients;
        this.assignments = assignments;
        this.txm = txm;
        this.json = json;
        this.clock = clock;
    }

    /** True when {@code org.pipeline.manager_approval} says assigning this consultant waits for a manager (ALWAYS, or HIGH_PRIORITY and their assignment is HIGH). NEVER, the default, holds nothing. */
    public boolean holdsAssignment(Long orgId, Long consultantId) {
        String mode = settings.managerApproval(orgId);
        if (PipelineGuardSettings.APPROVAL_ALWAYS.equals(mode)) return true;
        if (!PipelineGuardSettings.APPROVAL_HIGH_PRIORITY.equals(mode)) return false;
        return assignments.findByOrgIdAndConsultantId(orgId, consultantId).map(a -> "HIGH".equals(a.getPriority())).orElse(false);
    }

    /** True when {@code org.resumes.manager_review} sends a marketer-made resume through a manager before the consultant is asked. */
    public boolean reviewsResumes(Long orgId) {
        return settings.managerReview(orgId);
    }

    /**
     * Opens a RESUME_RELEASE request for a marketer-made resume in the caller's transaction (no exception is thrown, so nothing has to survive one). Returns false,
     * changing nothing, when a request for this resume is already waiting.
     */
    public boolean holdResume(OrgMembership me, Long consultantId, Long resumeId, String resumeName) {
        Long orgId = me.orgId();
        if (requests.findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(orgId, ApprovalKinds.SUBJECT_RESUME, resumeId, ApprovalKinds.RESUME_RELEASE, "PENDING").isPresent()) return false;
        String who = consultants.findByOrgIdAndId(orgId, consultantId).map(ConsultantProfile::getDisplayName).orElse("Consultant");
        String title = who + ", resume " + (resumeName == null ? "" : resumeName);
        if (title.length() > ApprovalKinds.TITLE_MAX) title = title.substring(0, ApprovalKinds.TITLE_MAX);
        ObjectNode payload = json.createObjectNode();
        payload.put("resumeId", resumeId);
        payload.put("consultantId", consultantId);
        approvals.open(me, new ApprovalService.Request(ApprovalKinds.RESUME_RELEASE, ApprovalKinds.SUBJECT_RESUME, resumeId, consultantId, title, null, payload));
        return true;
    }

    /** Parks the assignment for a manager and returns the 409 {@code APPROVAL_PENDING} to throw. */
    public OrgException holdAssignment(OrgMembership me, ClientRequirement job, Long consultantId, Spec spec, DuplicateGuard.Confirm confirm) {
        return park(me, job, consultantId, spec, ApprovalKinds.OPPORTUNITY_ASSIGN, confirm == null || !confirm.confirmed() ? null : confirm.reason(), null);
    }

    /** Parks the duplicate override the marketer stated {@code reason} for and returns the 409 {@code DUPLICATE_APPROVAL_REQUIRED} to throw. */
    public OrgException holdDuplicate(OrgMembership me, ClientRequirement job, Long consultantId, Spec spec, List<DuplicateGuard.Finding> findings, String reason) {
        return park(me, job, consultantId, spec, ApprovalKinds.DUPLICATE_OVERRIDE, reason, findings);
    }

    private OrgException park(OrgMembership me, ClientRequirement job, Long consultantId, Spec spec, String kind, String duplicateReason, List<DuplicateGuard.Finding> findings) {
        TransactionTemplate tx = new TransactionTemplate(txm);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        try {
            Long requestId = tx.execute(status -> parkInThisTransaction(me, job, consultantId, spec, kind, duplicateReason, findings));
            Map<String, Object> extra = new LinkedHashMap<>();
            extra.put("requestId", requestId);
            extra.put("kind", kind);
            if (findings != null) extra.put("rules", findings.stream().map(DuplicateGuard.Finding::rule).toList());
            return ApprovalKinds.DUPLICATE_OVERRIDE.equals(kind)
                ? OrgException.coded(409, ApprovalKinds.CODE_DUPLICATE_APPROVAL_REQUIRED, "Sent to a manager for approval of the duplicate. The opportunity stays suggested until they decide.", extra)
                : OrgException.coded(409, ApprovalKinds.CODE_PENDING, "Sent to a manager for approval. The opportunity stays suggested until they decide.", extra);
        } catch (OrgException refused) {
            return refused; // APPROVAL_PENDING of the request that is already open, or a refusal of the open itself
        }
    }

    private Long parkInThisTransaction(OrgMembership me, ClientRequirement job, Long consultantId, Spec spec, String kind, String duplicateReason, List<DuplicateGuard.Finding> findings) {
        Long orgId = me.orgId();
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        String client = clients.findByOrgIdAndId(orgId, job.getClientId()).map(ClientAccount::getName).orElse("a client");
        Instant now = clock.instant();

        RequirementMatch match = matches.findByOrgIdAndRequirementIdAndConsultantId(orgId, job.getId(), consultantId).orElse(null);
        if (match == null) {
            match = new RequirementMatch();
            match.setOrgId(orgId);
            match.setRequirementId(job.getId());
            match.setConsultantId(consultantId);
            match.setScore(spec.score() == null ? 0 : spec.score());
            match.setReason(spec.matchReason() == null ? "Assigned by a marketer" : spec.matchReason());
            match.setSource(spec.source() == null ? "MANUAL" : spec.source());
            match.setStatus("SUGGESTED");
            match.setCreatedAt(now);
            match = matches.saveAndFlush(match);
        } else if ("DISMISSED".equals(match.getStatus())) {
            match.setStatus("SUGGESTED");
            match.setAssignedAt(null);
            match.setAssignedByMemberId(null);
            match = matches.saveAndFlush(match);
        }
        MktOpportunity opp = opportunities.findByOrgIdAndMatchId(orgId, match.getId()).orElse(null);
        if (opp == null) {
            opp = new MktOpportunity();
            opp.setOrgId(orgId);
            opp.setMatchId(match.getId());
            opp.setOwnerMemberId(spec.ownerMemberId());
            opp.setState("ASSIGNED");
            opp.setCreatedAt(now);
            opp.setUpdatedAt(now);
            opp = opportunities.save(opp);
        }
        requests
            .findByOrgIdAndSubjectTypeAndSubjectIdAndKindAndStatus(orgId, ApprovalKinds.SUBJECT_OPPORTUNITY, opp.getId(), kind, "PENDING")
            .ifPresent(existing -> {
                Map<String, Object> extra = new LinkedHashMap<>();
                extra.put("requestId", existing.getId());
                extra.put("kind", kind);
                throw OrgException.coded(409, ApprovalKinds.CODE_PENDING, "This is already waiting for a manager's approval.", extra);
            });

        ObjectNode payload = json.createObjectNode();
        payload.put("jobId", job.getId());
        payload.put("consultantId", consultantId);
        payload.put("matchId", match.getId());
        if (spec.ownerMemberId() != null) payload.put("ownerMemberId", spec.ownerMemberId());
        payload.put("askInterest", spec.askInterest());
        if (spec.marketerNote() != null) payload.put("marketerNote", spec.marketerNote());
        if (spec.priority() != null) payload.put("priority", spec.priority());
        if (spec.dueOn() != null) payload.put("dueOn", spec.dueOn().toString());
        payload.put("confirmDuplicate", duplicateReason != null);
        if (duplicateReason != null) payload.put("duplicateReason", duplicateReason);
        if (findings != null) {
            var rules = payload.putArray("rules");
            for (DuplicateGuard.Finding f : findings) rules.add(f.rule());
        }
        String jobTitle = job.getTitle() == null ? "a job" : job.getTitle();
        String title = consultant.getDisplayName() + " to " + client + ", " + jobTitle;
        if (title.length() > ApprovalKinds.TITLE_MAX) title = title.substring(0, ApprovalKinds.TITLE_MAX);
        ApprovalRequestDTO opened = approvals.open(
            me, new ApprovalService.Request(kind, ApprovalKinds.SUBJECT_OPPORTUNITY, opp.getId(), consultantId, title, null, payload)
        );
        opp.setApprovalRequestId(opened.id());
        opportunities.save(opp);
        return opened.id();
    }
}
