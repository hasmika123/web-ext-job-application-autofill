package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.ent.pipeline.OpportunityMatchLifecycleService;
import com.dossier.api.service.ent.pipeline.OrgMatchQueryService;
import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import com.dossier.api.service.org.OrgMembership;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Compatibility boundary for the marketer workspace while its older board is still backed by {@code requirement_match}.
 * The canonical query service remains the owner of tenant, dynamic permission, and consultant-scope filtering.
 */
@Service
public final class MktCanonicalMatchesService {

    private final MktScope scope;
    private final OrgMatchQueryService canonical;
    private final OpportunityMatchLifecycleService lifecycle;

    public MktCanonicalMatchesService(MktScope scope, OrgMatchQueryService canonical, OpportunityMatchLifecycleService lifecycle) {
        this.scope = scope;
        this.canonical = canonical;
        this.lifecycle = lifecycle;
    }

    @Transactional(readOnly = true)
    public MktCanonicalMatchesDto.Response list(OrgMembership actor, OrgMatchViews.Query query) {
        scope.resolve(actor, MktMatchesService.PAGE_KEY);
        OrgMatchViews.Response response = canonical.list(actor, query == null ? new OrgMatchViews.Query(null, null) : query);
        return new MktCanonicalMatchesDto.Response(MktCanonicalMatchesDto.SOURCE, response.items(), response.total());
    }

    @Transactional(readOnly = true)
    public OrgMatchViews.Row detail(OrgMembership actor, Long matchId) {
        scope.resolve(actor, MktMatchesService.PAGE_KEY);
        return canonical.get(actor, matchId);
    }

    @Transactional
    public OrgMatchViews.Row assign(OrgMembership actor, Long matchId) {
        scope.resolve(actor, MktMatchesService.PAGE_KEY);
        return canonical.row(lifecycle.assign(actor, matchId));
    }

    @Transactional
    public OrgMatchViews.Row dismiss(OrgMembership actor, Long matchId) {
        scope.resolve(actor, MktMatchesService.PAGE_KEY);
        return canonical.row(lifecycle.dismiss(actor, matchId));
    }
}
