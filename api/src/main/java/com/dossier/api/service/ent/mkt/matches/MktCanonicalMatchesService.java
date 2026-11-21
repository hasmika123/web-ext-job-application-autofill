package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.service.ent.mkt.MktScope;
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

    public MktCanonicalMatchesService(MktScope scope, OrgMatchQueryService canonical) {
        this.scope = scope;
        this.canonical = canonical;
    }

    @Transactional(readOnly = true)
    public MktCanonicalMatchesDto.Response list(OrgMembership actor, OrgMatchViews.Query query) {
        scope.resolve(actor, MktMatchesService.PAGE_KEY);
        OrgMatchViews.Response response = canonical.list(actor, query == null ? new OrgMatchViews.Query(null, null) : query);
        return new MktCanonicalMatchesDto.Response(MktCanonicalMatchesDto.SOURCE, response.items(), response.total());
    }
}
