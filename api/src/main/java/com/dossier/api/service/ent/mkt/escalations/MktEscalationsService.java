package com.dossier.api.service.ent.mkt.escalations;

import com.dossier.api.domain.ent.mkt.MktOpportunity;
import com.dossier.api.domain.ent.talent.ClientRequirement;
import com.dossier.api.domain.ent.talent.ConsultantProfile;
import com.dossier.api.domain.ent.talent.RequirementMatch;
import com.dossier.api.repository.ent.talent.ClientRequirementRepository;
import com.dossier.api.repository.ent.talent.ConsultantProfileRepository;
import com.dossier.api.repository.ent.talent.MarketerAssignmentRepository;
import com.dossier.api.repository.ent.talent.RequirementMatchRepository;
import com.dossier.api.service.ent.jobs.OpportunityAssignmentService;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.Locale;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The marketer's side of the escalations (MM-05): "Escalate to my manager" on an opportunity or a consultant. Gated like the Opportunities page
 * ({@code opportunities.manage}, the consultants the caller may see); a consultant or opportunity outside that set is the generic 404. A person raises only a
 * MANUAL escalation (the rules raise the others); the row names the consultant's marketer (the raiser when the consultant has none) so the managers of that
 * marketer see it. The title and detail are the marketer's words and are scanned for sensitive data. Nothing here submits an application (E1).
 */
@Service
public class MktEscalationsService {

    static final String KEY = "opportunities.manage";

    private final MktScope scope;
    private final EscalationService escalations;
    private final RequirementMatchRepository matches;
    private final ClientRequirementRepository requirements;
    private final ConsultantProfileRepository consultants;
    private final MarketerAssignmentRepository assignments;
    private final OpportunityAssignmentService assignment;
    private final OrgAuditService audit;

    public MktEscalationsService(
        MktScope scope,
        EscalationService escalations,
        RequirementMatchRepository matches,
        ClientRequirementRepository requirements,
        ConsultantProfileRepository consultants,
        MarketerAssignmentRepository assignments,
        OpportunityAssignmentService assignment,
        OrgAuditService audit
    ) {
        this.scope = scope;
        this.escalations = escalations;
        this.matches = matches;
        this.requirements = requirements;
        this.consultants = consultants;
        this.assignments = assignments;
        this.assignment = assignment;
        this.audit = audit;
    }

    /** The write gate: the page's scope (the generic 404 for everyone outside it). */
    public void gate(OrgMembership me) {
        scope.resolve(me, KEY);
    }

    /**
     * Raises a MANUAL escalation. {@code subjectType} MKT_OPPORTUNITY ({@code subjectId} is the opportunity's id as the Opportunities routes use it: its match id) or
     * CONSULTANT ({@code subjectId} is the profile). {@code severity} defaults to MEDIUM.
     */
    @Transactional
    public EscalationDTO raise(OrgMembership me, EscalationDTO.RaiseRequest body) {
        MktScope.View view = scope.resolve(me, KEY);
        if (body == null) throw OrgException.invalid("body", "is required");
        String kind = body.kind() == null || body.kind().isBlank() ? "MANUAL" : body.kind().strip().toUpperCase(Locale.ROOT);
        if (!"MANUAL".equals(kind)) throw OrgException.invalid("kind", "a person raises MANUAL escalations; the others are raised by the rules");
        String severity = body.severity() == null || body.severity().isBlank() ? "MEDIUM" : body.severity();
        String type = body.subjectType() == null ? "" : body.subjectType().strip().toUpperCase(Locale.ROOT);
        Long subjectId = body.subjectId();
        if (subjectId == null || subjectId <= 0) throw OrgException.invalid("subjectId", "is required");
        Long orgId = me.orgId();
        Long consultantId;
        Long storedSubject;
        String about;
        switch (type) {
            case "MKT_OPPORTUNITY" -> {
                RequirementMatch m = matches.findByOrgIdAndId(orgId, subjectId).orElseThrow(OrgNotFoundException::new);
                scope.require(view, m.getConsultantId());
                MktOpportunity opp = assignment.ensureOpportunity(view, m.getId(), me.memberId());
                consultantId = m.getConsultantId();
                storedSubject = opp.getId();
                about = requirements.findByOrgIdAndId(orgId, m.getRequirementId()).map(ClientRequirement::getTitle).orElse(null);
            }
            case "CONSULTANT" -> {
                scope.require(view, subjectId);
                consultantId = subjectId;
                storedSubject = subjectId;
                about = null;
            }
            default -> throw OrgException.invalid("subjectType", "must be MKT_OPPORTUNITY or CONSULTANT");
        }
        ConsultantProfile consultant = consultants.findByOrgIdAndId(orgId, consultantId).orElseThrow(OrgNotFoundException::new);
        Long marketer = assignments.findByOrgIdAndConsultantId(orgId, consultantId).map(a -> a.getMarketerMemberId()).orElse(me.memberId());
        EscalationDTO created = escalations.raise(
            orgId, new EscalationService.Raise(kind, severity, type, storedSubject, consultantId, marketer, body.title(), body.detail(), null, me.memberId())
        );
        audit.record(
            me.orgId(), me.login(), me.role(), EscalationService.AUDIT_RAISE, EscalationService.TARGET, null, String.valueOf(created.id()),
            "kind=MANUAL severity=" + created.severity() + " subject=" + type + ":" + storedSubject + " consultant=" + consultant.getId() + (about == null ? "" : " about=" + about), null, null, null, "LOW"
        );
        return created;
    }
}
