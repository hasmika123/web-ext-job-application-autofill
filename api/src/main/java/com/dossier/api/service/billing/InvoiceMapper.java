package com.dossier.api.service.billing;

import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.billing.InvoiceLine;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Pure mapping from a Stripe invoice snapshot to the mirror rows (story K8.3, docs/subscriptions/07-stripe-mapping.md section 5): no repository, so the
 * line classification and the "lines add up to the amount" rule are unit-tested without a database.
 */
public final class InvoiceMapper {

    /** What the catalog knows about a Stripe price: our price row and the service it sells (null for a plan base). */
    public record PriceRef(Long priceId, String featureKey) {}

    /** Looks a Stripe price id up in the catalog. */
    @FunctionalInterface
    public interface PriceLookup {
        Optional<PriceRef> byStripePrice(String stripePriceId);
    }

    private InvoiceMapper() {}

    /** The invoice row's status: the webhook type wins for voided and paid, else Stripe's own status, else open. */
    public static String status(String eventType, String stripeStatus) {
        if ("invoice.voided".equals(eventType)) return "void";
        if ("invoice.paid".equals(eventType)) return "paid";
        return stripeStatus == null || stripeStatus.isBlank() ? "open" : stripeStatus.toLowerCase(Locale.ROOT);
    }

    /** Copy the snapshot's scalar fields onto {@code row}; the identity (user, subscription, ids) is set by the caller. */
    public static void apply(Invoice row, StripeWebhookEvent event) {
        StripeWebhookEvent.InvoiceInfo inv = event.invoice();
        row.setStatus(status(event.type(), inv.status()));
        if (inv.number() != null) row.setNumber(inv.number());
        row.setCurrency(inv.currency() == null ? "USD" : inv.currency().toUpperCase(Locale.ROOT));
        row.setAmountDueMinor(inv.amountDue());
        row.setAmountPaidMinor(inv.amountPaid());
        if (inv.periodStart() != null) row.setPeriodStart(inv.periodStart());
        if (inv.periodEnd() != null) row.setPeriodEnd(inv.periodEnd());
        Instant paidAt = inv.paidAt();
        if (paidAt == null && "invoice.paid".equals(event.type())) paidAt = event.created();
        if (paidAt != null) row.setPaidAt(paidAt);
        if (inv.hostedUrl() != null) row.setHostedInvoiceUrl(inv.hostedUrl());
        if (inv.pdfUrl() != null) row.setInvoicePdfUrl(inv.pdfUrl());
        row.setNextPaymentAttempt(null);
    }

    /**
     * Classify and snapshot the lines. BASE is the subscription's own price (stamped with its plan version); ADDON is any other catalog price that sells a
     * service; a prorated line is PRORATION whatever it sells; a negative line with no price is DISCOUNT (CREDIT when its description says so); the rest
     * is OTHER.
     */
    public static List<InvoiceLine> lines(StripeWebhookEvent.InvoiceInfo inv, long userId, String basePriceId, Long planVersionId, PriceLookup lookup) {
        List<InvoiceLine> out = new ArrayList<>();
        int order = 0;
        for (StripeWebhookEvent.InvoiceLineInfo l : inv.lines()) {
            InvoiceLine line = new InvoiceLine();
            line.setUserId(userId);
            line.setStripePriceId(l.priceId());
            line.setDescription(l.description() == null ? null : l.description().length() > 500 ? l.description().substring(0, 500) : l.description());
            line.setQuantity((int) Math.max(1, l.quantity()));
            line.setAmountMinor(l.amount());
            line.setUnitAmountMinor(l.quantity() > 0 && l.amount() % l.quantity() == 0 ? l.amount() / l.quantity() : l.amount());
            line.setPeriodStart(l.periodStart());
            line.setPeriodEnd(l.periodEnd());
            line.setProration(l.proration());
            line.setSortOrder(order++);

            Optional<PriceRef> ref = l.priceId() == null ? Optional.empty() : lookup.byStripePrice(l.priceId());
            ref.ifPresent(r -> {
                line.setPriceId(r.priceId());
                line.setFeatureKey(r.featureKey());
            });
            boolean base = l.priceId() != null && l.priceId().equals(basePriceId);
            if (base) line.setPlanVersionId(planVersionId);
            if (l.proration()) line.setLineKind(InvoiceLine.PRORATION);
            else if (base) line.setLineKind(InvoiceLine.BASE);
            else if (ref.isPresent() && ref.get().featureKey() != null) line.setLineKind(InvoiceLine.ADDON);
            else if (l.priceId() == null && l.amount() < 0) {
                String d = l.description() == null ? "" : l.description().toLowerCase(Locale.ROOT);
                line.setLineKind(d.contains("credit") ? InvoiceLine.CREDIT : InvoiceLine.DISCOUNT);
            } else line.setLineKind(InvoiceLine.OTHER);
            out.add(line);
        }
        return out;
    }

    /** True when the lines add up to {@code amountMinor} (the invoice total before tax and discount, which this mirror carries as lines). */
    public static boolean linesSumTo(List<InvoiceLine> lines, long amountMinor) {
        return lines.stream().mapToLong(InvoiceLine::getAmountMinor).sum() == amountMinor;
    }
}
