package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgAuditService;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.privacy.SensitiveContent;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The canonical review-only lifecycle for {@code opportunity_match}. It is deliberately a small public seam: callers
 * ask for a business action, while the registry, authorization, row locks, guards, audit and status effects stay here.
 * Submission and candidate-recording transitions belong to later pipeline slices.
 */
@Service
public class OpportunityMatchLifecycleService {

    public static final String ENTITY = "opportunity_match";
    public static final String OPPORTUNITY_NOT_OPEN = "OPPORTUNITY_NOT_OPEN";
    public static final String PIPELINE_TRANSITION = "PIPELINE_TRANSITION";
    public static final List<String> DECLINE_REASONS = List.of("NOT_INTERESTED", "LOCATION", "RATE", "ALREADY_APPLIED", "OTHER");
    private static final Set<String> DECLINE_REASON_SET = Set.copyOf(DECLINE_REASONS);
    private static final int DECLINE_NOTE_MAX = 200;

    public enum Target {
        ASSIGNED,
        DISMISSED,
        ACCEPTED,
        DECLINED
    }

    public enum Decision {
        ACCEPT,
        DECLINE
    }

    public record ConsultantDecision(Decision decision, String reason, String note) {
        public static ConsultantDecision accept() {
            return new ConsultantDecision(Decision.ACCEPT, null, null);
        }

        public static ConsultantDecision decline(String reason, String note) {
            return new ConsultantDecision(Decision.DECLINE, reason, note);
        }
    }

    private final OpportunityMatchRepository matches;
    private final JobOpportunityRepository opportunities;
    private final AuthorizationService authorization;
    private final OrgAuditService audit;
    private final Clock clock;

    @Autowired
    public OpportunityMatchLifecycleService(
        OpportunityMatchRepository matches,
        JobOpportunityRepository opportunities,
        AuthorizationService authorization,
        OrgAuditService audit
    ) {
        this(matches, opportunities, authorization, audit, Clock.systemUTC());
    }

    OpportunityMatchLifecycleService(
        OpportunityMatchRepository matches,
        JobOpportunityRepository opportunities,
        AuthorizationService authorization,
        OrgAuditService audit,
        Clock clock
    ) {
        this.matches = matches;
        this.opportunities = opportunities;
        this.authorization = authorization;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public OpportunityMatch assign(OrgMembership actor, Long matchId) {
        return transition(actor, matchId, Target.ASSIGNED, null);
    }

    @Transactional
    public OpportunityMatch dismiss(OrgMembership actor, Long matchId) {
        return transition(actor, matchId, Target.DISMISSED, null);
    }

    @Transactional
    public OpportunityMatch accept(OrgMembership actor, Long matchId) {
        return decide(actor, matchId, ConsultantDecision.accept());
    }

    @Transactional
    public OpportunityMatch decline(OrgMembership actor, Long matchId, String reason, String note) {
        return decide(actor, matchId, ConsultantDecision.decline(reason, note));
    }

    @Transactional
    public OpportunityMatch decide(OrgMembership actor, Long matchId, ConsultantDecision decision) {
        if (decision == null || decision.decision() == null) throw validation("decision", "is required");
        Target target = decision.decision() == Decision.ACCEPT ? Target.ACCEPTED : Target.DECLINED;
        return transition(actor, matchId, target, decision);
    }

    private OpportunityMatch transition(OrgMembership actor, Long matchId, Target target, ConsultantDecision decision) {
        if (actor == null || actor.orgId() == null || actor.memberId() == null || matchId == null) throw new OrgNotFoundException();

        OpportunityMatch match = matches.lockByOrgIdAndId(actor.orgId(), matchId).orElseThrow(OrgNotFoundException::new);
        if (!Objects.equals(actor.orgId(), match.getOrgId())) throw new OrgNotFoundException();
        OpportunityMatchTransitionRegistry.Transition transition = OpportunityMatchTransitionRegistry.authorizationFor(target);
        authorize(actor, match, transition);
        if (target == Target.DECLINED) validateDecline(decision);

        String from = match.getStatus();
        if (Objects.equals(from, target.name())) return match;

        OpportunityMatchTransitionRegistry.find(from, target).orElseThrow(() -> illegal(from, target));
        JobOpportunity opportunity = opportunities.lockByOrgIdAndId(actor.orgId(), match.getOpportunityId()).orElseThrow(OrgNotFoundException::new);
        requireOpen(opportunity);

        Instant now = clock.instant();
        match.setStatus(target.name());
        match.setUpdatedByMemberId(actor.memberId());
        switch (target) {
            case ASSIGNED -> {
                match.setAssignedByMemberId(actor.memberId());
                match.setAssignedAt(now);
                if (!"ASSIGNED".equalsIgnoreCase(opportunity.getStatus())) {
                    opportunity.setStatus("ASSIGNED");
                    opportunity.setUpdatedByMemberId(actor.memberId());
                    opportunities.save(opportunity);
                }
            }
            case ACCEPTED -> {
                match.setConsultantDecidedAt(now);
                match.setDeclineReason(null);
                match.setDeclineNote(null);
            }
            case DECLINED -> {
                match.setConsultantDecidedAt(now);
                match.setDeclineReason(normalizeReason(decision.reason()));
                match.setDeclineNote(normalizeNote(decision.note()));
            }
            case DISMISSED -> { }
        }
        matches.save(match);
        audit.record(actor, auditAction(target), "OPPORTUNITY_MATCH", null, String.valueOf(match.getId()), auditDetails(from, target, decision));
        return match;
    }

    private void authorize(OrgMembership actor, OpportunityMatch match, OpportunityMatchTransitionRegistry.Transition transition) {
        if (transition.actorKind() == OpportunityMatchTransitionRegistry.ActorKind.CONSULTANT) {
            if (!Objects.equals(actor.memberId(), match.getConsultantMemberId())) throw new OrgNotFoundException();
            authorization.require(
                AuthzRequest.of(actor.orgId(), List.of(transition.permissionKey()), Beneficiary.SELF, null, AuthzOperation.WRITE).withActor(actor)
            );
            return;
        }
        authorization.require(
            AuthzRequest.of(
                actor.orgId(),
                List.of(transition.permissionKey()),
                Beneficiary.PATH_MEMBER,
                match.getConsultantMemberId(),
                AuthzOperation.WRITE
            ).withActor(actor)
        );
    }

    private static void requireOpen(JobOpportunity opportunity) {
        if (opportunity.getStatus() == null || "CLOSED".equalsIgnoreCase(opportunity.getStatus())) {
            throw OrgException.coded(409, OPPORTUNITY_NOT_OPEN, "That opportunity is closed.", Map.of("opportunityId", opportunity.getId()));
        }
    }

    private static void validateDecline(ConsultantDecision decision) {
        if (decision == null) throw validation("decision", "is required");
        String reason = normalizeReason(decision.reason());
        if (!DECLINE_REASON_SET.contains(reason)) throw validation("reason", "must be one of " + String.join(", ", DECLINE_REASONS));
        String note = normalizeNote(decision.note());
        if (note != null && note.length() > DECLINE_NOTE_MAX) throw validation("note", "must be at most " + DECLINE_NOTE_MAX + " characters");
        if (note != null) SensitiveContent.check("note", "note", note);
    }

    private static String normalizeReason(String reason) {
        return reason == null ? "" : reason.strip().toUpperCase(Locale.ROOT);
    }

    private static String normalizeNote(String note) {
        if (note == null) return null;
        String clean = note.strip();
        return clean.isEmpty() ? null : clean;
    }

    private static String auditAction(Target target) {
        return switch (target) {
            case ASSIGNED -> "PIPELINE_MATCH_ASSIGN";
            case DISMISSED -> "PIPELINE_MATCH_DISMISS";
            case ACCEPTED -> "PIPELINE_MATCH_ACCEPT";
            case DECLINED -> "PIPELINE_MATCH_DECLINE";
        };
    }

    private static String auditDetails(String from, Target target, ConsultantDecision decision) {
        String details = from + " -> " + target.name();
        if (target == Target.DECLINED && decision != null) details += " (" + normalizeReason(decision.reason()) + ")";
        return details;
    }

    private static OrgException illegal(String from, Target target) {
        return OrgException.coded(
            409,
            PIPELINE_TRANSITION,
            "That transition is not allowed for this opportunity match.",
            Map.of("entity", ENTITY, "from", String.valueOf(from), "to", target.name())
        );
    }

    private static OrgException validation(String field, String message) {
        return OrgException.coded(400, "VALIDATION", field + ": " + message, Map.of("field", field));
    }
}
