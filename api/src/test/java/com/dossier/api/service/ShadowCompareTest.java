package com.dossier.api.service;

import static com.dossier.api.service.entitlement.ResolverFixtures.plan;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dossier.api.domain.Subscription;
import com.dossier.api.service.AiBudgetService.Window;
import com.dossier.api.service.ai.AiPolicy;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.entitlement.EntitlementSet;
import com.dossier.api.service.entitlement.FeatureKeys;
import com.dossier.api.service.entitlement.PlanResolverCore;
import com.dossier.api.service.entitlement.ResolverFixtures;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.Test;

/**
 * The shadow-flip gate (K7.7, docs/subscriptions/06 section 4): over the status x period x interval fixture matrix, the catalog resolver must say exactly
 * what the legacy row logic says - Pro or not, the AI budget in cents, and the window it covers - or the flip of {@code billing.catalog.shadow} is unsafe.
 * Zero mismatches here is the test half of the gate; the other half is zero production mismatches over one release (docs/subscriptions/README.md).
 */
class ShadowCompareTest {

    private static final Instant NOW = Instant.parse("2026-10-15T12:00:00Z");
    private static final String[] STATUSES = { null, "none", "active", "trialing", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused" };
    private static final String[] PRICES = { "price_month", "price_3mo", null };

    @Test
    void theResolverAgreesWithTheLegacyRulesOnTheWholeMatrix() {
        StripeProperties stripe = new StripeProperties();
        stripe.setPriceMonthly("price_month");
        stripe.setPrice3mo("price_3mo");
        AiBudgetService budget = new AiBudgetService(new AiPolicy(), null, null, null, null, null, null, stripe, null, 3);
        int cells = 0;
        Instant[] ends = { null, NOW.minus(1, ChronoUnit.DAYS), NOW.plusSeconds(1), NOW.plus(10, ChronoUnit.DAYS), NOW.plus(80, ChronoUnit.DAYS) };
        for (String status : STATUSES) {
            for (Instant end : ends) {
                for (String price : PRICES) {
                    String interval = price == null ? null : "price_3mo".equals(price) ? "QUARTER" : "MONTH";
                    Subscription sub = new Subscription();
                    sub.setStatus(status == null ? Subscription.STATUS_NONE : status);
                    sub.setCurrentPeriodEnd(end);
                    sub.setPriceId(price);

                    boolean legacyPro = EntitlementService.isProFor(sub.getStatus(), end, NOW);
                    EntitlementSet set = PlanResolverCore.resolvePersonal(ResolverFixtures.personal(sub.getStatus(), null, end, interval, plan("PRO")), NOW);
                    String where = "status=" + status + " end=" + end + " price=" + price;

                    assertThat(set.has(FeatureKeys.Capability.AI_SERVER)).as(where).isEqualTo(legacyPro);
                    assertThat(set.state().entitled()).as(where).isEqualTo(legacyPro);
                    assertThat(set.limit(FeatureKeys.Limit.RESUMES_MAX)).as(where).isEqualTo(legacyPro ? 25 : 3);
                    if (legacyPro) {
                        Window legacy = budget.proWindow(sub, NOW);
                        assertThat(set.aiWindow().budgetCents()).as(where).isEqualTo(legacy.budgetMicros() / 10_000L);
                        assertThat(set.aiWindow().start()).as(where).isEqualTo(legacy.start());
                        assertThat(set.aiWindow().resetsAt()).as(where).isEqualTo(legacy.resetsAt());
                    } else {
                        assertThat(set.aiWindow()).as(where).isNull();
                    }
                    cells++;
                }
            }
        }
        assertThat(cells).isEqualTo(STATUSES.length * ends.length * PRICES.length);
    }

    @Test
    void anEnterpriseAccountNeverHasAPersonalPlanInEitherReader() {
        EntitlementService legacy = new EntitlementService(mock(com.dossier.api.repository.SubscriptionRepository.class), mock(com.dossier.api.service.billing.StripeGateway.class));
        assertThat(legacy.isPro("ent#7#anika")).isFalse();
        var in = new PlanResolverCore.PersonalInputs("ent#7#anika", true, "active", null, NOW.plusSeconds(60), false, "MONTH", plan("PRO"), plan("FREE"), java.util.List.of(), java.util.List.of(), ResolverFixtures.features(), null);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> PlanResolverCore.resolvePersonal(in, NOW)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
