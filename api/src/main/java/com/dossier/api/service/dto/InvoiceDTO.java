package com.dossier.api.service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.io.Serializable;
import java.time.Instant;
import java.util.List;

/** One invoice of the signed-in personal account (docs/subscriptions/09-apis.md section 3.3). {@code lines[].kind} is BASE, ADDON, PRORATION or OTHER. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record InvoiceDTO(
    String number,
    String status,
    long amountPaidMinor,
    String currency,
    Instant periodStart,
    Instant periodEnd,
    Instant paidAt,
    String hostedUrl,
    String pdfUrl,
    List<Line> lines
) implements Serializable {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record Line(String kind, String description, long quantity, Long unitAmountMinor, long amountMinor, boolean proration) implements Serializable {}
}
