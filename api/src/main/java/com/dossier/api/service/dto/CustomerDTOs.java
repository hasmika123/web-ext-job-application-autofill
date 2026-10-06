package com.dossier.api.service.dto;

import java.time.Instant;
import java.util.List;

/** The admin Customers page and timeline (Phase 9.C1). Records, so Jackson writes them as-is. */
public final class CustomerDTOs {

    private CustomerDTOs() {}

    /**
     * One row on the Customers page.
     *
     * @param statusGroup     ACTIVE, PAST_DUE (payment failed), CANCELLING or LAPSED
     * @param stripeStatus    Stripe's own status, for the tooltip
     * @param billing         MONTHLY, QUARTERLY, or null when the price isn't one we know
     * @param currentPeriodEnd renewal date, or the end date when cancelling
     * @param totalPaidCents  the sum of recorded {@code invoice.paid} amounts (0 if none recorded)
     * @param since           when the subscription row was created
     * @param stripeUrl       the customer in the Stripe dashboard (test or live)
     */
    public record Customer(
        String login,
        String email,
        String name,
        String statusGroup,
        String stripeStatus,
        String billing,
        Instant currentPeriodEnd,
        boolean cancelAtPeriodEnd,
        long totalPaidCents,
        String currency,
        Instant since,
        String stripeUrl
    ) {}

    /**
     * One line on a customer's timeline.
     *
     * @param kind  BILLING (a Stripe event) or NOTE (an admin note)
     * @param title what happened ("Payment received") or the note's author
     * @param failed true when our handler failed to apply the event — worth a look
     */
    public record TimelineEntry(String kind, Instant at, String title, String body, Long amountCents, String currency, boolean failed) {}

    /** The user page's Billing section: the summary when they are or were a customer, and the timeline. */
    public record Detail(Customer customer, List<TimelineEntry> timeline) {}
}
