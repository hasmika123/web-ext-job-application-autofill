package com.dossier.api.service.billing.personal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Account erasure for the personal subscription mirror (subscription-merge; DataMap rows {@code subscription_addon}, {@code personal_subscription_change},
 * {@code subscription_quote}). Those three tables hold foreign keys to the {@code subscription} row (and, for add-ons, to {@code jhi_user}) with no cascade, so
 * {@code AccountDeletionService.endBilling} calls this BEFORE it deletes the subscription row, after Stripe has cancelled the subscription. It is not a
 * second writer of the mirror in the sense of {@code PersonalAddonWritersTest}: it runs only inside an account erasure, deletes by user id with plain SQL, and
 * writes nothing else. The remaining personal billing tables ({@code entitlement_grant}, {@code personal_usage_*}, {@code service_lock}, {@code billing_notice},
 * {@code plan_retirement_item}) cascade from the user row; {@code invoice} and {@code invoice_line} are pseudonymised, not deleted.
 */
@Component
public class PersonalBillingErasure {

    private final JdbcTemplate jdbc;

    public PersonalBillingErasure(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Removes the person's add-on rows, change records and priced quotes. Returns the number of rows removed. */
    public int eraseFor(Long userId) {
        if (userId == null) return 0;
        int n = jdbc.update("delete from subscription_addon where user_id = ?", userId);
        n += jdbc.update("delete from personal_subscription_change where user_id = ?", userId);
        n += jdbc.update("delete from subscription_quote where user_id = ?", userId);
        return n;
    }
}
