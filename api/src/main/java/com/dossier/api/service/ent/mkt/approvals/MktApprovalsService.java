package com.dossier.api.service.ent.mkt.approvals;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientAccount;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.OrgResume;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.mkt.MktOpportunityRepository;
import com.dossier.api.repository.ent.talent.ClientAccountRepository;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.OrgResumeRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The marketer's side of the Approvals page (MM-03): ask a Marketing Manager to release a step, see one's own requests, take one back. Gated like the
 * Opportunities page ({@code opportunities.manage}, the consultants the caller may see); a consultant outside that set is the generic 404.
 *
 * <p>A marketer names WHAT to approve, never HOW: the held action's arguments are built here from the stored rows (the suggested pair, the resume), never
 * taken from the request body, so a request cannot make a manager's approval do anything else than what the marketer could already do. Duplicate
 * overrides are only ever opened by the duplicate guard itself (policy REQUIRE_APPROVAL). Nothing here submits an application (E1).
 */
@Service
public class MktApprovalsService {

    private final MktScope scope;
    private final ApprovalService approvals;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ClientAccountRepository clients;
    private final ConsultantProfileRepository consultants;
    private final MktOpportunityRepository opportunities;
    private final OrgResumeRepository resumes;
    private final OpportunityAssignmentService assignment;
    private final ObjectMapper json;

    public MktApprovalsService(
        MktScope scope,
        ApprovalService approvals,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ClientAccountRepository clients,
        ConsultantProfileRepository consultants,
        MktOpportunityRepository opportunities,
        OrgResumeRepository resumes,
        OpportunityAssignmentService assignment,
        ObjectMapper json
    ) {
        this.scope = scope;
        this.approvals = approvals;
        this.matches = matches;
        this.requirements = requirements;
        this.clients = clients;
        this.consultants = consultants;
        this.opportunities = opportunities;
        this.resumes = resumes;
        this.assignment = assignment;
        this.json = json;
    }

    /** The write gate: the page's scope (the generic 404 for everyone outside it). */
    public void gate(OrgMembership me) {
        scope.resolve(me, ApprovalKinds.KEY_REQUEST);
    }

    /**
     * Opens a request. {@code OPPORTUNITY_ASSIGN}: {@code subjectId} is the opportunity's match id (the id every Opportunities route uses) of a SUGGESTED pair
     * the caller may see. {@code RESUME_RELEASE}: {@code subjectId} is the resume. Anything else is refused (422).
     */
    @Transactional
    public ApprovalRequestDTO open(OrgMembership me, ApprovalRequestDTO.OpenRequest body) {
        MktScope.View view = scope.resolve(me, ApprovalKinds.KEY_REQUEST);
        if (body == null) throw OrgException.invalid("body", "is required");
        String kind = body.kind() == null ? "" : body.kind().strip().toUpperCase(Locale.ROOT);
        Long subjectId = body.subjectId();
        if (subjectId == null || subjectId <= 0) throw OrgException.invalid("subjectId", "is required");
        return switch (kind) {
            case ApprovalKinds.OPPORTUNITY_ASSIGN -> openAssign(me, view, subjectId, body.note());
            case ApprovalKinds.RESUME_RELEASE -> openResume(me, view, subjectId, body.note());
            case ApprovalKinds.DUPLICATE_OVERRIDE -> throw OrgException.invalid("kind", "a duplicate override is asked for by the duplicate warning itself");
            default -> throw OrgException.invalid("kind", "must be OPPORTUNITY_ASSIGN or RESUME_RELEASE");
        };
    }

    private ApprovalRequestDTO openAssign(OrgMembership me, MktScope.View view, Long matchId, String note) {
        Long orgId = me.orgId();
        RequirementMatch m = matches.findByOrgIdAndId(orgId, matchId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, m.getConsultantId());
        if (!"SUGGESTED".equals(m.getStatus())) throw OrgException.coded(409, "NOT_SUGGESTED", "Only a suggested opportunity can be sent for approval.", Map.of("status", m.getStatus()));
        ClientRequirement job = requirements.findByOrgIdAndId(orgId, m.getRequirementId()).orElseThrow(OrgNotFoundException::new);
        MktOpportunity opp = assignment.ensureOpportunity(view, matchId, me.memberId());
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, m.getConsultantId()).orElseThrow(OrgNotFoundException::new);
        String client = clients.findByOrgIdAndId(orgId, job.getClientId()).map(ClientAccount::getName).orElse("a client");
        ObjectNode payload = json.createObjectNode();
        payload.put("jobId", job.getId());
        payload.put("consultantId", consultant.getId());
        payload.put("matchId", matchId);
        payload.put("ownerMemberId", me.memberId());
        payload.put("askInterest", true);
        payload.put("confirmDuplicate", false);
        String title = consultant.getDisplayName() + " to " + client + ", " + (job.getTitle() == null ? "a job" : job.getTitle());
        ApprovalRequestDTO opened = approvals.open(
            me, new ApprovalService.Request(ApprovalKinds.OPPORTUNITY_ASSIGN, ApprovalKinds.SUBJECT_OPPORTUNITY, opp.getId(), consultant.getId(), cut(title), note, payload)
        );
        opp.setApprovalRequestId(opened.id());
        opportunities.save(opp);
        return opened;
    }

    private ApprovalRequestDTO openResume(OrgMembership me, MktScope.View view, Long resumeId, String note) {
        Long orgId = me.orgId();
        scope.resolve(me, "resumes.edit_for"); // the page of the resume's own key as well
        OrgResume r = resumes.findByOrgIdAndId(orgId, resumeId).orElseThrow(OrgNotFoundException::new);
        scope.require(view, r.getConsultantId());
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, r.getConsultantId()).orElseThrow(OrgNotFoundException::new);
        ObjectNode payload = json.createObjectNode();
        payload.put("resumeId", r.getId());
        payload.put("consultantId", consultant.getId());
        String title = consultant.getDisplayName() + ", resume " + (r.getName() == null ? "" : r.getName());
        return approvals.open(
            me, new ApprovalService.Request(ApprovalKinds.RESUME_RELEASE, ApprovalKinds.SUBJECT_RESUME, r.getId(), consultant.getId(), cut(title), note, payload)
        );
    }

    /** The caller's own requests ({@code status} PENDING by default, DECIDED, ALL or one status), newest first. */
    @Transactional(readOnly = true)
    public ApprovalRequestDTO.Page mine(OrgMembership me, String status, Pageable pageable) {
        scope.resolve(me, ApprovalKinds.KEY_REQUEST);
        return ApprovalService.toPage(approvals.mine(me, status, pageable));
    }

    /** Takes a PENDING request of the caller back. */
    @Transactional
    public ApprovalRequestDTO withdraw(OrgMembership me, Long id) {
        scope.resolve(me, ApprovalKinds.KEY_REQUEST);
        return approvals.withdraw(me, id);
    }

    private static String cut(String title) {
        return title.length() > ApprovalKinds.TITLE_MAX ? title.substring(0, ApprovalKinds.TITLE_MAX) : title;
    }
}
