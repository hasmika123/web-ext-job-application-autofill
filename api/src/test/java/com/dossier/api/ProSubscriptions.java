package com.dossier.api;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Seeds the {@code subscription} mirror so an integration test can run as a Pro user (Phase 12.4).
 *
 * <p>Writing the row directly is deliberate: {@code EntitlementService} reads only this mirror, so
 * a test that seeds it is testing the same thing production reads — and it needs neither a Stripe
 * key nor the webhook, which is what lets the suite run on a keyless CI runner.
 */
public final class ProSubscriptions {

    private ProSubscriptions() {}

    /** Make {@code login} Pro: active, with a period end a month out. Returns the saved row. */
    public static Subscription makePro(SubscriptionRepository subscriptions, UserRepository users, String login) {
        User user = users.findOneByLogin(login).orElseThrow();
        Subscription sub = subscriptions.findOneByUserLogin(login).orElseGet(Subscription::new);
        sub.setUser(user);
        sub.setPlan(Subscription.PLAN_PRO);
        sub.setStatus("active");
        sub.setCurrentPeriodEnd(Instant.now().plus(30, ChronoUnit.DAYS));
        return subscriptions.save(sub);
    }
}
