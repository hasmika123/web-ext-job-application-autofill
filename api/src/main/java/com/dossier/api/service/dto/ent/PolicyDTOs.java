package com.dossier.api.service.dto.ent;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/** Wire shapes of the tenant policy pages (docs/enterprise-v2/62). */
public final class PolicyDTOs {

    private PolicyDTOs() {}

    /** A kind in the public index. */
    public record KindLink(String kind, String title, String path) {}

    /**
     * What a visitor of a tenant host sees (host-resolved, anonymous). {@code source} is PUBLISHED (the organization's approved text)
     * or TEMPLATE (the neutral text, until it publishes one). Never a draft, a state or a comment.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PublicPolicy(
        String kind,
        String title,
        String body,
        String source,
        Integer version,
        Instant publishedAt,
        String orgName,
        String supportEmail
    ) {}

    /** One row of the Org Admin's Policies list. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Row(
        String kind,
        String title,
        String path,
        String state,
        Integer liveVersion,
        Instant liveSince,
        String reviewComment,
        Instant updatedAt
    ) {}

    public record ListView(boolean requireReview, int maxChars, List<Row> policies) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record VersionRow(
        int versionNo,
        String status,
        Instant submittedAt,
        Instant reviewedAt,
        String reviewComment,
        Instant publishedAt
    ) {}

    /** One policy for editing: the draft, what is live, the history. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Detail(
        String kind,
        String title,
        String path,
        String state,
        int draftVersion,
        String draftBody,
        String liveBody,
        Integer liveVersion,
        String reviewComment,
        boolean requireReview,
        int maxChars,
        List<VersionRow> versions
    ) {}

    /** The review queue row: which organization asks to publish what. */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record QueueRow(
        Long id,
        Long orgId,
        String orgName,
        String kind,
        String title,
        int versionNo,
        String status,
        Instant submittedAt,
        boolean hasLive
    ) {}

    /** One submission for review: the proposed body and the live one to compare against (null when never published). */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ReviewDetail(
        Long id,
        Long orgId,
        String orgName,
        String kind,
        String title,
        int versionNo,
        String status,
        Instant submittedAt,
        String proposedBody,
        String liveBody,
        Integer liveVersion,
        String reviewComment
    ) {}
}
