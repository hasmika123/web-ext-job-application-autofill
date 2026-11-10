package com.dossier.api.service.ai.engines;

import com.dossier.api.service.ai.engines.ProposalResult.ProposalView;
import com.dossier.api.service.ai.engines.ProposalResult.UsageView;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;
import java.util.List;

/**
 * What the AI Suggestions calls answer with (DESIGN 9.5, R4.6): the same {@code status} vocabulary as
 * {@link ProposalResult}, and the resume's open suggestion cards instead of one proposal. Each card is a full
 * {@link ProposalView} ({@code kind}, {@code title}, {@code body} and its {@code changes}), so Preview needs no second call.
 * {@code contentHash} is the document's hash now; {@code staleAt} is when a card made from an older document is
 * due a refresh ({@code resume.ai.suggestStaleMinutes} after the document last changed), null while none is stale.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProposalListResult(
    String status,
    List<ProposalView> suggestions,
    String contentHash,
    Instant staleAt,
    UsageView usage,
    String cap,
    Integer dropped
) {
    static ProposalListResult of(ProposalResult refusal) {
        return new ProposalListResult(refusal.status(), List.of(), null, null, refusal.usage(), refusal.cap(), refusal.dropped());
    }
}
