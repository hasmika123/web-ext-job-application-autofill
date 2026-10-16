package com.dossier.api.service.catalog.seed;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import liquibase.change.custom.CustomTaskChange;
import liquibase.database.Database;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.CustomChangeException;
import liquibase.exception.ValidationErrors;
import liquibase.resource.ResourceAccessor;

/**
 * Liquibase wrapper of {@link SubscriptionBackfill} ({@code 20261101040000_sub_backfill.xml}, changeSet {@code sub-backfill-subscriptions}). The Stripe price
 * ids come from the same environment the application reads them from ({@code STRIPE_PRICE_MONTHLY}, {@code STRIPE_PRICE_3MO}, or the system properties
 * {@code dossier.stripe.price-monthly} / {@code dossier.stripe.price3mo}). A Pro row that matches neither is linked without an interval and logged; set
 * {@code SUBSCRIPTION_BACKFILL_STRICT=true} (or the system property {@code dossier.subscription.backfill.strict}) to make that a failed migration instead.
 */
public class SubscriptionBackfillChange implements CustomTaskChange {

    @Override
    public void execute(Database database) throws CustomChangeException {
        try {
            Connection c = ((JdbcConnection) database.getConnection()).getUnderlyingConnection();
            SubscriptionBackfill.Result r = SubscriptionBackfill.run(c, priceIntervals(System.getenv(), System.getProperties()));
            if (!r.unmapped().isEmpty() && strict(System.getenv(), System.getProperties())) {
                throw new CustomChangeException("subscription backfill: Pro rows match no configured price id: " + r.unmapped());
            }
        } catch (SQLException e) {
            throw new CustomChangeException("subscription backfill failed: " + e.getMessage(), e);
        }
    }

    static Map<String, String> priceIntervals(Map<String, String> env, java.util.Properties props) {
        Map<String, String> m = new HashMap<>();
        put(m, first(env.get("STRIPE_PRICE_MONTHLY"), props.getProperty("dossier.stripe.price-monthly")), "MONTH");
        put(m, first(env.get("STRIPE_PRICE_3MO"), props.getProperty("dossier.stripe.price3mo")), "QUARTER");
        return m;
    }

    static boolean strict(Map<String, String> env, java.util.Properties props) {
        return "true".equalsIgnoreCase(first(env.get("SUBSCRIPTION_BACKFILL_STRICT"), props.getProperty("dossier.subscription.backfill.strict")));
    }

    private static void put(Map<String, String> m, String id, String interval) {
        if (id != null && !id.isBlank()) m.put(id.trim(), interval);
    }

    private static String first(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }

    @Override
    public String getConfirmationMessage() {
        return "Personal subscriptions linked to the plan version they bought (idempotent)";
    }

    @Override
    public void setUp() {
        // nothing to configure
    }

    @Override
    public void setFileOpener(ResourceAccessor resourceAccessor) {
        // not used
    }

    @Override
    public ValidationErrors validate(Database database) {
        return new ValidationErrors();
    }
}
