package com.dossier.api.service.retirement;

import com.dossier.api.domain.Subscription;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Who owns a subscription row, without touching the lazy {@code Subscription.user} association. The retirement services receive subscriptions that were loaded in one
 * transaction and used in another (the Stripe calls between them must not sit inside a database transaction), where the lazy association is closed; the owner's id and
 * login are two small columns, read on demand. Read-only.
 */
@Component
public class SubscriptionOwners {

    /** The owning account's id and login. */
    public record Owner(Long userId, String login) {}

    private final JdbcTemplate jdbc;

    public SubscriptionOwners(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Owner of(Subscription sub) {
        return of(sub.getId());
    }

    public Owner of(Long subscriptionId) {
        return jdbc.queryForObject(
            "SELECT u.id, u.login FROM subscription s JOIN jhi_user u ON u.id = s.user_id WHERE s.id = ?",
            (rs, i) -> new Owner(rs.getLong("id"), rs.getString("login")),
            subscriptionId
        );
    }
}
