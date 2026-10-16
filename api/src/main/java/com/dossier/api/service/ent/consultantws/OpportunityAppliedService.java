package com.dossier.api.service.ent.consultantws;

import com.dossier.api.domain.ent.consultantws.CwsOpportunityResponse;
import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.consultantws.CwsOpportunityResponseRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.TrackerException;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.consultant.ConOpportunityService;
import com.dossier.api.service.ent.jobs.AssignmentScope;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MKT-24 "I applied" on the consultant's Assigned Opportunities page. The consultant says they applied themselves on the source site; this only RECORDS
 * that: the pipeline overlay of the match becomes APPLIED through {@link ConOpportunityService#applied} (idempotent, one timeline event the marketer's
 * board and activity feed read, one change-audit row {@code CONSULTANT_OPPORTUNITY_APPLIED}). Kiwiply never submits or applies for anyone (E1).
 * The match must be one of the caller's own ASSIGNED matches; anything else is the generic 404.
 */
@Service
public class OpportunityAppliedService {

    private final ConsultantHomeService gate;
    private final AuthorizationService authorization;
    private final RequirementMatchRepository matches;
    private final CwsOpportunityResponseRepository responses;
    private final OpportunityAssignmentService assignment;
    private final ConOpportunityService pipeline;

    public OpportunityAppliedService(
        ConsultantHomeService gate, AuthorizationService authorization, RequirementMatchRepository matches, CwsOpportunityResponseRepository responses,
        OpportunityAssignmentService assignment, ConOpportunityService pipeline
    ) {
        this.gate = gate;
        this.authorization = authorization;
        this.matches = matches;
        this.responses = responses;
        this.assignment = assignment;
        this.pipeline = pipeline;
    }

    @Transactional
    public OpportunitiesDTO.Applied applied(OrgMembership me, long matchId) {
        ConsultantProfile c = gate.requireSelf(me);
        authorization.require(AuthzRequest.of(me.orgId(), List.of(ConsultantHomeService.PERMISSION), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(me));
        Long org = c.getOrgId();
        RequirementMatch m = matches.findByOrgIdAndId(org, matchId).orElseThrow(OrgNotFoundException::new);
        if (!c.getId().equals(m.getConsultantId()) || !"ASSIGNED".equals(m.getStatus())) throw new OrgNotFoundException();
        Optional<CwsOpportunityResponse> resp = responses.findByOrgIdAndConsultantIdAndRequirementId(org, c.getId(), m.getRequirementId());
        if (resp.isPresent() && CwsOpportunityResponse.DECLINED.equals(resp.get().getStatus())) throw TrackerException.invalid("status", "is declined; reopen it first");
        AssignmentScope scope = new AssignmentScope() {
            @Override public Long orgId() { return org; }
            @Override public boolean sees(Long consultantId) { return c.getId().equals(consultantId); }
        };
        MktOpportunity opp = assignment.ensureOpportunity(scope, matchId, m.getAssignedByMemberId());
        var done = pipeline.applied(me, opp.getId(), null, null);
        return new OpportunitiesDTO.Applied(matchId, done.state(), done.appliedAt());
    }
}
