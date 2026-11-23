package com.dossier.api.service.ent.mkt.matches;

import com.dossier.api.service.ent.pipeline.OrgMatchViews;
import java.time.LocalDate;
import java.util.List;

/** The source-labelled canonical feed used while the marketer Matches UI moves off {@code requirement_match}. */
public final class MktCanonicalMatchesDto {

    public static final String SOURCE = "OPPORTUNITY_MATCH";

    private MktCanonicalMatchesDto() {}

    public record Consultant(Long memberId, String name, String role, String primarySkill, String availabilityStatus, LocalDate availableFrom) {}

    public record Item(String source, OrgMatchViews.Row match, Consultant consultant) {
        public Item {
            source = SOURCE;
        }
    }

    public record Response(String source, List<Item> items, int total) {
        public Response {
            source = SOURCE;
            items = items == null ? List.of() : List.copyOf(items);
        }
    }
}
