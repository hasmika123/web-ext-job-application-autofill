package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import java.util.List;

/** The source-labelled canonical feed used while the marketer Matches UI moves off {@code requirement_match}. */
public final class MktCanonicalMatchesDto {

    public static final String SOURCE = "OPPORTUNITY_MATCH";

    private MktCanonicalMatchesDto() {}

    public record Response(String source, List<OrgMatchViews.Row> items, int total) {
        public Response {
            source = SOURCE;
            items = items == null ? List.of() : List.copyOf(items);
        }
    }
}
