package com.dossier.api.service.ent.pipeline;

import java.time.Instant;
import java.util.List;

/** Non-PII wire shapes for the organization match review surface. */
public final class OrgMatchViews {

    private OrgMatchViews() {}

    public record Query(Long consultantMemberId, String status) {}

    public record Response(List<Row> items, int total) {
        public Response {
            items = items == null ? List.of() : List.copyOf(items);
        }
    }

    public record Row(
        Long id,
        Long consultantMemberId,
        Long opportunityId,
        String opportunityKind,
        String title,
        String company,
        String location,
        String url,
        String applyUrl,
        String sourceLabel,
        Integer score,
        String reason,
        String model,
        String source,
        String status,
        Instant createdAt,
        Instant updatedAt
    ) {}
}
