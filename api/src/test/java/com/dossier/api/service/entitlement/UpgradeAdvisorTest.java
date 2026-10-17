package com.dossier.api.service.entitlement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Subscription;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.service.catalog.PublicCatalogService;
import com.dossier.api.service.dto.PublicCatalogDTO;
import com.dossier.api.service.dto.PublicCatalogDTO.Addon;
import com.dossier.api.service.dto.PublicCatalogDTO.Included;
import com.dossier.api.service.dto.PublicCatalogDTO.Plan;
import com.dossier.api.service.dto.PublicCatalogDTO.Price;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** K7.6: the server chooses the cheapest published plan that includes the feature, at the customer's interval, never a draft. */
class UpgradeAdvisorTest {

    private final PublicCatalogService catalog = mock(PublicCatalogService.class);
    private final SubscriptionRepository subs = mock(SubscriptionRepository.class);
    private final UpgradeAdvisor advisor = new UpgradeAdvisor(catalog, subs);

    private static Plan plan(String key, long month, Long quarter, String feature, boolean sunset, List<Addon> optional) {
        Map<String, Price> prices = quarter == null ? Map.of("MONTH", new Price(month, null, null, null)) : Map.of("MONTH", new Price(month, null, null, null), "QUARTER", new Price(quarter, null, null, null));
        return new Plan(key, key.substring(0, 1) + key.substring(1).toLowerCase(), null, null, List.of("MONTH"), prices, List.of(new Included(feature, feature, null, null, null)), optional, sunset);
    }

    private void catalogOf(Plan... plans) {
        when(catalog.catalog(any())).thenReturn(new PublicCatalogDTO(3, "USD", List.of("MONTH"), true, "", List.of(plans), Map.of()));
    }

    @Test
    void cheapestIncludingPlanAtTheMonthlyInterval() {
        catalogOf(plan("AUTOPILOT", 3999, 9999L, "ai.resume_tailoring", false, List.of()), plan("PRO", 1999, 4999L, "ai.resume_tailoring", false, List.of()));
        when(subs.findOneByUserLogin("free")).thenReturn(Optional.empty());
        assertThat(advisor.advise("free", "ai.resume_tailoring")).hasValueSatisfying(u -> {
            assertThat(u.planKey()).isEqualTo("PRO");
            assertThat(u.interval()).isEqualTo("MONTH");
            assertThat(u.amountMinor()).isEqualTo(1999);
            assertThat(u.path()).isEqualTo("/pricing?plan=PRO");
        });
    }

    @Test
    void usesTheCustomersCurrentIntervalWhenThePlanOffersIt() {
        catalogOf(plan("PRO", 1999, 4999L, "ai.resume_tailoring", false, List.of()));
        Subscription s = new Subscription();
        s.setBillingInterval("QUARTER");
        when(subs.findOneByUserLogin("q")).thenReturn(Optional.of(s));
        assertThat(advisor.advise("q", "ai.resume_tailoring")).hasValueSatisfying(u -> {
            assertThat(u.interval()).isEqualTo("QUARTER");
            assertThat(u.amountMinor()).isEqualTo(4999);
        });
    }

    @Test
    void sunsetAndUnpricedPlansAreNeverOffered() {
        catalogOf(plan("OLD", 999, null, "ai.resume_tailoring", true, List.of()), new Plan("FREE", "Free", null, null, List.of(), Map.of(), List.of(), List.of(), false));
        assertThat(advisor.advise(null, "ai.resume_tailoring")).isEmpty();
    }

    @Test
    void anAddOnOnlyFeaturePointsAtTheAddOnPath() {
        Addon support = new Addon("support.priority", "Priority support", null, 1, Map.of("MONTH", new Price(500, null, null, null)));
        catalogOf(plan("PRO", 1999, null, "ai.resume_tailoring", false, List.of(support)));
        assertThat(advisor.advise(null, "support.priority")).hasValueSatisfying(u -> {
            assertThat(u.path()).isEqualTo("/settings/plan?add=support.priority");
            assertThat(u.amountMinor()).isEqualTo(500);
        });
    }

    @Test
    void noFeatureMeansTheCheapestPricedPlanAndABrokenCatalogMeansNothing() {
        catalogOf(plan("AUTOPILOT", 3999, null, "x", false, List.of()), plan("PRO", 1999, null, "x", false, List.of()));
        assertThat(advisor.advise(null, null)).hasValueSatisfying(u -> assertThat(u.planKey()).isEqualTo("PRO"));
        when(catalog.catalog(any())).thenThrow(new IllegalStateException("boom"));
        assertThat(advisor.advise(null, null)).isEmpty();
    }
}
