package com.dossier.api.service.catalog;

import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.catalog.seed.SubscriptionBackfill;
import java.util.HashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Keeps every personal {@code subscription} row pointing at a plan version (story K2.1): the migration links the rows that exist; this links the rows the
 * Stripe webhook writes afterwards, which still leave {@code plan_version_id} empty until the later personal stories write it themselves. It runs the same
 * idempotent {@link SubscriptionBackfill} the migration runs, with the price ids from {@link StripeProperties}, so it changes only rows that are still
 * unlinked and never touches the {@code plan} label or a Stripe column. Hourly, plus once on demand ({@link #link()}).
 */
@Component
public class SubscriptionPlanLinker {

    private static final Logger LOG = LoggerFactory.getLogger(SubscriptionPlanLinker.class);

    private final JdbcTemplate jdbc;
    private final StripeProperties stripe;

    public SubscriptionPlanLinker(JdbcTemplate jdbc, StripeProperties stripe) {
        this.jdbc = jdbc;
        this.stripe = stripe;
    }

    /** Link the unlinked rows now; returns how many were linked. */
    public int link() {
        Map<String, String> intervals = new HashMap<>();
        if (stripe.getPriceMonthly() != null && !stripe.getPriceMonthly().isBlank()) intervals.put(stripe.getPriceMonthly().trim(), "MONTH");
        if (stripe.getPrice3mo() != null && !stripe.getPrice3mo().isBlank()) intervals.put(stripe.getPrice3mo().trim(), "QUARTER");
        SubscriptionBackfill.Result r = jdbc.execute((ConnectionCallback<SubscriptionBackfill.Result>) c -> SubscriptionBackfill.run(c, intervals));
        return r == null ? 0 : r.total();
    }

    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 900_000L)
    public void scheduled() {
        try {
            int n = link();
            if (n > 0) LOG.info("subscription plan linker: {} row(s) linked to a plan version", n);
        } catch (RuntimeException e) {
            LOG.warn("subscription plan linker failed: {}", e.toString());
        }
    }
}
