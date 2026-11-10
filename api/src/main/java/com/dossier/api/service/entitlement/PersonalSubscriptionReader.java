package com.dossier.api.service.entitlement;

import com.dossier.api.service.billing.StripeProperties;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Reads the personal {@code subscription} mirror together with the plan columns K2.1 added ({@code plan_version_id}, {@code billing_interval},
 * {@code current_period_start}). It reads by SQL on purpose: those columns are not mapped on the {@code Subscription} entity (the webhook is its only
 * writer and the add-on stream owns the mapping), and a read-only resolver needs no entity.
 */
@Component
public class PersonalSubscriptionReader {

    /** One account's subscription state; the subscription fields are null for a user who never checked out. */
    public record Row(
        long userId,
        String login,
        String status,
        String plan,
        String priceId,
        Instant currentPeriodEnd,
        boolean cancelAtPeriodEnd,
        Long planVersionId,
        String billingInterval,
        Instant currentPeriodStart
    ) {
        public boolean hasSubscription() {
            return status != null;
        }
    }

    private static final String SQL =
        "SELECT u.id, u.login, s.status, s.plan, s.price_id, s.current_period_end, s.cancel_at_period_end, s.plan_version_id, s.billing_interval, " +
        "s.current_period_start FROM jhi_user u LEFT JOIN subscription s ON s.user_id = u.id WHERE u.login = ?";

    private final JdbcTemplate jdbc;
    private final StripeProperties stripe;

    public PersonalSubscriptionReader(JdbcTemplate jdbc, StripeProperties stripe) {
        this.jdbc = jdbc;
        this.stripe = stripe;
    }

    /** The row for a login; empty when no such user exists. */
    public Optional<Row> byLogin(String login) {
        if (login == null) return Optional.empty();
        List<Row> rows = jdbc.query(SQL, (rs, i) -> map(rs), login);
        return rows.stream().findFirst();
    }

    /**
     * The billing interval of a row: the mirrored {@code billing_interval} when it has one, else what the Stripe price id says (the 3-month price is
     * QUARTER, any other price MONTH), else null. This is the rule the legacy AI budget used, so the resolver agrees with it from day one.
     */
    public String intervalOf(Row r) {
        if (r.billingInterval() != null && !r.billingInterval().isBlank()) return r.billingInterval();
        String priceId = r.priceId();
        if (priceId == null || priceId.isBlank()) return null;
        String threeMonth = stripe.getPrice3mo();
        if (threeMonth != null && !threeMonth.isBlank() && threeMonth.trim().equals(priceId.trim())) return "QUARTER";
        return "MONTH";
    }

    private static Row map(ResultSet rs) throws SQLException {
        return new Row(
            rs.getLong(1),
            rs.getString(2),
            rs.getString(3),
            rs.getString(4),
            rs.getString(5),
            instant(rs, 6),
            rs.getBoolean(7),
            nullableLong(rs, 8),
            rs.getString(9),
            instant(rs, 10)
        );
    }

    private static Long nullableLong(ResultSet rs, int col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }

    private static Instant instant(ResultSet rs, int col) throws SQLException {
        LocalDateTime t = rs.getObject(col, LocalDateTime.class);
        return t == null ? null : t.toInstant(ZoneOffset.UTC);
    }
}
