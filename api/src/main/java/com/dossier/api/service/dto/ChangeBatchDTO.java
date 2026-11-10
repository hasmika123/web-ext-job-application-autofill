package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/**
 * The result of confirming a change quote (docs/subscriptions/09-apis.md section 3.1): the batch id the caller's Idempotency-Key became, every change with
 * its status, and what the subscription will bill from now on. A change whose status is FAILED has already been granted in Kiwiply; the retry job finishes
 * the Stripe side with the same idempotency keys.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChangeBatchDTO(String batchId, List<ChangeDTO> changes, long proposedRecurringMinor, Instant nextInvoiceAt) implements Serializable {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ChangeDTO(
        Long id,
        String kind,
        String featureKey,
        Integer quantityFrom,
        Integer quantityTo,
        Instant effectiveAt,
        long prorationMinor,
        String status
    ) implements Serializable {}
}
