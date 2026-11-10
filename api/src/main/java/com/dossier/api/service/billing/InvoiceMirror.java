package com.dossier.api.service.billing;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.billing.InvoiceLine;
import com.dossier.api.repository.sub.InvoiceLineRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Mirrors Stripe's {@code invoice.*} events into {@code invoice} / {@code invoice_line} (story K8.3, docs/subscriptions/07 section 5). Called by
 * {@link UserBillingHandler} inside the webhook's apply transaction; the Stripe webhook is the only writer.
 *
 * <ul>
 *   <li>one row per Stripe invoice (idempotent on {@code stripe_invoice_id}); an event older than the row's {@code last_event_at} is dropped (Stripe does
 *       not guarantee order);</li>
 *   <li>the lines are replaced from the snapshot (or, when the event carried none, read once from Stripe through the gateway) and classified by
 *       {@link InvoiceMapper};</li>
 *   <li>{@code invoice.paid} moves the subscription's {@code paid_through_at} forward to the invoice period end and stamps {@code first_paid_at} once;
 *       subscription events stamp {@code current_period_start};</li>
 *   <li>{@code invoice.upcoming} publishes a {@link RenewalSoon} event (B4.2 sends the mail), once per user and period end.</li>
 * </ul>
 */
@Component
public class InvoiceMirror {

    private static final Logger LOG = LoggerFactory.getLogger(InvoiceMirror.class);

    /** The renewal is close: B4.2's reminder listens to this. */
    public record RenewalSoon(Long userId, Instant periodEnd) {}

    private final InvoiceRepository invoices;
    private final InvoiceLineRepository lines;
    private final StripeGateway gateway;
    private final JdbcTemplate jdbc;
    private final ApplicationEventPublisher events;
    /** user|periodEnd already announced by this process; the listener must be idempotent too, this only stops repeats from Stripe's retries. */
    private final Set<String> announced = ConcurrentHashMap.newKeySet();

    public InvoiceMirror(InvoiceRepository invoices, InvoiceLineRepository lines, StripeGateway gateway, JdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.invoices = invoices;
        this.lines = lines;
        this.gateway = gateway;
        this.jdbc = jdbc;
        this.events = events;
    }

    /** True for the webhook types this mirror reads. */
    public static boolean handles(String type) {
        return type != null && type.startsWith("invoice.");
    }

    /** Mirror one invoice event for the subscription row it belongs to ({@code sub} null: the customer is not ours, nothing to mirror). */
    public void mirror(StripeWebhookEvent event, Subscription sub) {
        StripeWebhookEvent.InvoiceInfo inv = event.invoice();
        if (inv == null || sub == null || sub.getUser() == null) return;
        if ("invoice.upcoming".equals(event.type())) {
            announceRenewal(sub, inv, event);
            return;
        }
        if (inv.id() == null) return;
        Invoice row = invoices.findByStripeInvoiceId(inv.id()).orElse(null);
        if (row != null && row.getLastEventAt() != null && event.created() != null && event.created().isBefore(row.getLastEventAt())) {
            LOG.info("Invoice event {} ({}) is older than the mirrored invoice {} - ignoring", event.id(), event.type(), inv.id());
            return;
        }
        if (row == null) {
            row = new Invoice();
            row.setStripeInvoiceId(inv.id());
            row.setCreatedAt(event.created() == null ? Instant.now() : event.created());
        }
        row.setUserId(sub.getUser().getId());
        row.setSubscriptionId(sub.getId());
        row.setStripeSubscriptionId(sub.getStripeSubscriptionId());
        InvoiceMapper.apply(row, event);
        if ("invoice.payment_failed".equals(event.type())) row.setAttemptCount(row.getAttemptCount() + 1);
        row.setLastEventAt(event.created() == null ? Instant.now() : event.created());
        row = invoices.save(row);

        StripeWebhookEvent.InvoiceInfo withLines = inv.lines().isEmpty() ? fetchLines(inv) : inv;
        if (!withLines.lines().isEmpty()) {
            lines.deleteByInvoiceId(row.getId());
            Long planVersionId = planVersionOf(sub);
            for (InvoiceLine l : InvoiceMapper.lines(withLines, sub.getUser().getId(), sub.getPriceId(), planVersionId, this::priceRef)) {
                l.setInvoiceId(row.getId());
                lines.save(l);
            }
        }
        if ("invoice.paid".equals(event.type())) recordPaid(sub, row, event);
    }

    /** Stamp {@code current_period_start} from a subscription event (never moves it backwards to null). */
    public void recordPeriodStart(Subscription sub, Instant periodStart) {
        if (sub == null || sub.getId() == null || periodStart == null) return;
        jdbc.update("UPDATE subscription SET current_period_start = ? WHERE id = ?", utc(periodStart), sub.getId());
    }

    private void recordPaid(Subscription sub, Invoice row, StripeWebhookEvent event) {
        Instant end = row.getPeriodEnd();
        Instant paidAt = row.getPaidAt() == null ? event.created() : row.getPaidAt();
        if (end != null) {
            jdbc.update(
                "UPDATE subscription SET paid_through_at = ? WHERE id = ? AND (paid_through_at IS NULL OR paid_through_at < ?)",
                utc(end),
                sub.getId(),
                utc(end)
            );
        }
        if (paidAt != null) jdbc.update("UPDATE subscription SET first_paid_at = ? WHERE id = ? AND first_paid_at IS NULL", utc(paidAt), sub.getId());
        if (row.getPeriodStart() != null) recordPeriodStart(sub, row.getPeriodStart());
    }

    private void announceRenewal(Subscription sub, StripeWebhookEvent.InvoiceInfo inv, StripeWebhookEvent event) {
        Instant end = inv.periodEnd() != null ? inv.periodEnd() : sub.getCurrentPeriodEnd();
        Long userId = sub.getUser().getId();
        if (announced.add(userId + "|" + end)) events.publishEvent(new RenewalSoon(userId, end));
    }

    private StripeWebhookEvent.InvoiceInfo fetchLines(StripeWebhookEvent.InvoiceInfo inv) {
        if (!gateway.isEnabled()) return inv;
        try {
            StripeGateway.InvoiceSummary s = gateway.retrieveInvoice(inv.id());
            List<StripeWebhookEvent.InvoiceLineInfo> ls = s.lines().stream()
                .map(l -> new StripeWebhookEvent.InvoiceLineInfo(l.priceId(), l.quantity(), l.amountMinor(), l.description(), l.periodStart(), l.periodEnd(), l.proration()))
                .toList();
            return new StripeWebhookEvent.InvoiceInfo(inv.id(), inv.number(), inv.status(), inv.currency(), inv.amountDue(), inv.amountPaid(), inv.periodStart(), inv.periodEnd(), inv.dueAt(), inv.paidAt(), inv.hostedUrl(), inv.pdfUrl(), ls);
        } catch (RuntimeException e) {
            LOG.warn("Could not read the lines of invoice {} from Stripe: {}", inv.id(), e.toString());
            return inv;
        }
    }

    private Long planVersionOf(Subscription sub) {
        List<Long> r = jdbc.queryForList("SELECT plan_version_id FROM subscription WHERE id = ? AND plan_version_id IS NOT NULL", Long.class, sub.getId());
        return r.isEmpty() ? null : r.get(0);
    }

    private Optional<InvoiceMapper.PriceRef> priceRef(String stripePriceId) {
        List<InvoiceMapper.PriceRef> r = jdbc.query(
            "SELECT pp.id, p.feature_key FROM product_price pp JOIN product p ON p.id = pp.product_id WHERE pp.stripe_price_id = ?",
            (rs, i) -> new InvoiceMapper.PriceRef(rs.getLong(1), rs.getString(2)),
            stripePriceId
        );
        return r.stream().findFirst();
    }

    private static LocalDateTime utc(Instant i) {
        return LocalDateTime.ofInstant(i, ZoneOffset.UTC);
    }
}
