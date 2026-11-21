package com.dossier.api.service.ent.pipeline;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.ent.pipeline.JobOpportunity;
import com.dossier.api.domain.ent.pipeline.OpportunityMatch;
import com.dossier.api.repository.ent.pipeline.JobOpportunityRepository;
import com.dossier.api.repository.ent.pipeline.OpportunityMatchRepository;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.ent.authz.ScopeEvaluator;
import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Reads canonical organization suggestions while keeping dynamic permission and consultant scope in one service seam. */
@Service
public final class OrgMatchQueryService {

    public static final String PERMISSION = "matches.run";
    private static final int MAX_ITEMS = 100;
    private static final Set<String> STATUSES = Set.of("SUGGESTED", "ASSIGNED", "DISMISSED", "ACCEPTED", "DECLINED", "WITHDRAWN");

    private final OpportunityMatchRepository matches;
    private final JobOpportunityRepository opportunities;
    private final AuthorizationService authorization;
    private final ScopeEvaluator scopes;

    public OrgMatchQueryService(
        OpportunityMatchRepository matches,
        JobOpportunityRepository opportunities,
        AuthorizationService authorization,
        ScopeEvaluator scopes
    ) {
        this.matches = matches;
        this.opportunities = opportunities;
        this.authorization = authorization;
        this.scopes = scopes;
    }

    @Transactional(readOnly = true)
    public OrgMatchViews.Response list(OrgMembership actor, OrgMatchViews.Query query) {
        requireActor(actor);
        OrgMatchViews.Query safeQuery = query == null ? new OrgMatchViews.Query(null, null) : query;
        String status = normalizeStatus(safeQuery.status());
        authorize(actor, safeQuery.consultantMemberId());

        PermissionScope scope = actor.scopeFor(PERMISSION).orElseThrow(OrgNotFoundException::new);
        List<OrgMatchViews.Row> rows = matches.findByOrgIdOrderByUpdatedAtDesc(actor.orgId()).stream()
            .filter(match -> safeQuery.consultantMemberId() == null
                ? scopes.inScope(actor, scope, match.getConsultantMemberId())
                : safeQuery.consultantMemberId().equals(match.getConsultantMemberId()))
            .filter(match -> status == null || status.equals(normalizeStoredStatus(match.getStatus())))
            .sorted(Comparator.comparing(OpportunityMatch::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
            .limit(MAX_ITEMS)
            .map(this::rowOrNull)
            .filter(java.util.Objects::nonNull)
            .toList();
        return new OrgMatchViews.Response(rows, rows.size());
    }

    /** Maps a lifecycle result after the caller has already been authorized by that lifecycle service. */
    @Transactional(readOnly = true)
    public OrgMatchViews.Row row(OpportunityMatch match) {
        if (match == null || match.getOrgId() == null || match.getId() == null) throw new OrgNotFoundException();
        OrgMatchViews.Row row = rowOrNull(match);
        if (row == null) throw new OrgNotFoundException();
        return row;
    }

    private void authorize(OrgMembership actor, Long consultantMemberId) {
        authorization.require(
            AuthzRequest.of(
                actor.orgId(),
                List.of(PERMISSION),
                consultantMemberId == null ? Beneficiary.NONE : Beneficiary.PATH_MEMBER,
                consultantMemberId,
                AuthzOperation.READ
            ).withActor(actor)
        );
    }

    private OrgMatchViews.Row rowOrNull(OpportunityMatch match) {
        if (match.getOpportunityId() == null) return null;
        JobOpportunity opportunity = opportunities.findByOrgIdAndId(match.getOrgId(), match.getOpportunityId()).orElse(null);
        if (opportunity == null) return null;
        return new OrgMatchViews.Row(
            match.getId(),
            match.getConsultantMemberId(),
            opportunity.getId(),
            opportunity.getKind(),
            opportunity.getTitle(),
            opportunity.getCompany(),
            opportunity.getLocation(),
            opportunity.getUrl(),
            opportunity.getApplyUrl(),
            opportunity.getSourceLabel(),
            match.getScore(),
            match.getReason(),
            match.getModel(),
            match.getSource(),
            match.getStatus(),
            match.getCreatedAt(),
            match.getUpdatedAt()
        );
    }

    private static void requireActor(OrgMembership actor) {
        if (actor == null || actor.orgId() == null || actor.memberId() == null) throw new OrgNotFoundException();
    }

    private static String normalizeStatus(String raw) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.strip().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(value)) throw OrgException.invalid("status", "must be one of " + STATUSES);
        return value;
    }

    private static String normalizeStoredStatus(String raw) {
        return raw == null ? "" : raw.strip().toUpperCase(Locale.ROOT);
    }
}
