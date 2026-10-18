package com.dossier.api.service.billing;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fills {@code subscription.current_period_start} for rows the webhook has not stamped yet (story K8.4, docs/subscriptions/07-stripe-mapping.md section 6
 * step 4; there are no existing subscribers today, decision S-03, so on a fresh database this finds nothing). It is <b>read-only toward Stripe</b>:
 * the only call is {@code listInvoices}, and the period of the newest invoice of the row's own subscription is the current period. It is paged
 * ({@link #PAGE} rows a run), resumable (the cursor is a subscription id; a Stripe outage stops the run at the failing row and the next run, or a rerun
 * from {@link Result#nextCursor()}, continues there) and idempotent (a stamped row is never selected again, a rerun changes nothing). With a blank Stripe
 * key (dev, CI) the job is skipped with one log line.
 */
@Component
public class BackfillPeriodStartJob {

    private static final Logger LOG = LoggerFactory.getLogger(BackfillPeriodStartJob.class);
    static final int PAGE = 50;

    /** @param updated rows stamped; @param skipped rows Stripe had no usable invoice for; @param nextCursor where to continue (0 = start); @param done nothing left to read */
    public record Result(int updated, int skipped, long nextCursor, boolean done, boolean stripeOff) {}

    private final JdbcTemplate jdbc;
    private final StripeGateway gateway;

    public BackfillPeriodStartJob(JdbcTemplate jdbc, StripeGateway gateway) {
        this.jdbc = jdbc;
        this.gateway = gateway;
    }

    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 1_200_000L)
    public void scheduled() {
        try {
            long cursor = 0;
            for (int pages = 0; pages < 20; pages++) {
                Result r = run(cursor);
                if (r.stripeOff() || r.done()) return;
                cursor = r.nextCursor();
            }
        } catch (RuntimeException e) {
            LOG.warn("period start backfill failed: {}", e.toString());
        }
    }

    /** One page, starting after subscription id {@code cursor}. */
    public Result run(long cursor) {
        if (!gateway.isEnabled()) {
            LOG.info("period start backfill skipped: Stripe is not configured");
            return new Result(0, 0, cursor, true, true);
        }
        List<Object[]> rows = jdbc.query(
            "SELECT id, stripe_customer_id, stripe_subscription_id FROM subscription WHERE current_period_start IS NULL AND stripe_customer_id IS NOT NULL " +
            "AND stripe_subscription_id IS NOT NULL AND id > ? ORDER BY id LIMIT " + PAGE,
            (rs, i) -> new Object[] { rs.getLong(1), rs.getString(2), rs.getString(3) },
            cursor
        );
        int updated = 0;
        int skipped = 0;
        long next = cursor;
        for (Object[] row : rows) {
            long id = (Long) row[0];
            try {
                Instant start = periodStartOf((String) row[1], (String) row[2]);
                if (start == null) {
                    skipped++;
                } else {
                    updated += jdbc.update("UPDATE subscription SET current_period_start = ? WHERE id = ? AND current_period_start IS NULL", LocalDateTime.ofInstant(start, ZoneOffset.UTC), id);
                }
                next = id;
            } catch (StripeGatewayException e) {
                // stop here: the cursor stays at the last row that was read, so the next run starts at this one
                LOG.warn("period start backfill stopped at subscription {}: {}", id, e.getMessage());
                return new Result(updated, skipped, next, false, false);
            }
        }
        return new Result(updated, skipped, next, rows.size() < PAGE, false);
    }

    private Instant periodStartOf(String customerId, String subscriptionId) {
        for (StripeGateway.InvoiceSummary inv : gateway.listInvoices(customerId, 5, null)) {
            if (subscriptionId.equals(inv.subscriptionId()) && inv.periodStart() != null) return inv.periodStart();
        }
        return null;
    }
}
