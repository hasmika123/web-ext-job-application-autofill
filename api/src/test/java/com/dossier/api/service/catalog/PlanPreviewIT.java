package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.margin.MarginCalculator;
import com.dossier.api.service.billing.margin.MarginCheck;
import com.dossier.api.service.catalog.dto.PlanDTOs.ComponentRequest;
import com.dossier.api.service.catalog.dto.PlanPreviewDTO;
import com.dossier.api.service.pricing.Audience;
import com.dossier.api.service.pricing.BillingInterval;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/**
 * K2.3 on MySQL: the preview of a draft is priced from the DRAFT rows it will publish, its worst case is the guard's own composition check (the same row
 * MarginCalculatorTest asserts), a failing row carries exact levers, the yearly price is derived under the discount, an organization roster reproduces the
 * golden total G1 (7992), and the impact lists what publishing would create. (PlanPreviewServiceTest of the story.)
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class PlanPreviewIT extends PlanItSupport {

    @Autowired private MarginCalculator calculator;

    private void proWithCredits(long creditsMonth) {
        draft("PRO", "INDIVIDUAL", "MONTH", 1999);
        draft("PRO", "INDIVIDUAL", "QUARTER", 4999);
        draft("FEAT_AI_CREDITS", "INDIVIDUAL", "MONTH", creditsMonth);
        List<ComponentRequest> list = new ArrayList<>(componentsOf(plans.getVersion("PRO", 1)).stream().filter(c -> !c.role().equals("OPTIONAL")).toList());
        list.add(optional("ai.credits_extra", "FEAT_AI_CREDITS", 4));
        withComponents("PRO", 1, list);
        patch("PRO", 1, "{\"intervals\":[\"MONTH\",\"QUARTER\",\"YEAR\"]}");
    }

    @Test
    void theWorstCaseIsTheGuardsOwnCompositionRow() {
        proWithCredits(499);
        PlanPreviewDTO p = preview.preview("PRO", 1, "MONTH", "USD", null);
        assertThat(p.baseMinor()).isEqualTo(1999);
        assertThat(p.includedAiCapCents()).isEqualTo(300);
        assertThat(p.optional()).singleElement().satisfies(o -> {
            assertThat(o.featureKey()).isEqualTo("ai.credits_extra");
            assertThat(o.unitMinor()).isEqualTo(499);
            assertThat(o.maxQuantity()).isEqualTo(4);
            assertThat(o.ok()).isTrue();
        });
        // base 1999 + 4 credits x 499 = 3995, AI 300 + 4 x 75 = 600, one invoice so one fixed fee
        MarginCheck expected = calculator.checkBase("PRO", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", 3995, 600);
        assertThat(p.worstCase().totalMinor()).isEqualTo(3995);
        assertThat(p.worstCase().aiCents()).isEqualTo(600);
        assertThat(p.worstCase().feeMinor()).isEqualTo(expected.feeMinor());
        assertThat(p.worstCase().marginBp()).isEqualTo(expected.marginBp());
        assertThat(p.worstCase().ok()).isTrue();
        assertThat(p.checks()).extracting(c -> c.id()).containsExactly("structure", "deps", "prices", "margin");
        assertThat(p.checks()).allMatch(c -> c.ok());
    }

    @Test
    void aFailingRowCarriesLeversThatPassAtTheLimitAndFailJustBelow() {
        proWithCredits(199); // an add-on priced under its own AI cost
        PlanPreviewDTO p = preview.preview("PRO", 1, "MONTH", "USD", null);
        assertThat(p.optional()).singleElement().satisfies(o -> {
            assertThat(o.ok()).isFalse();
            assertThat(o.levers()).isNotNull();
            long min = o.levers().minPriceMinor();
            assertThat(min).isGreaterThan(199);
            assertThat(calculator.checkFeature("x", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", min, 75).pass()).isTrue();
            assertThat(calculator.checkFeature("x", Audience.INDIVIDUAL, BillingInterval.MONTH, "USD", min - 1, 75).pass()).isFalse();
        });
        assertThat(p.checks()).filteredOn(c -> c.id().equals("margin")).singleElement().satisfies(c -> {
            assertThat(c.ok()).isFalse();
            assertThat(c.failing()).isNotEmpty();
        });
    }

    @Test
    void theYearlyPriceIsDerivedUnderTheDiscountWithItsOwnChecks() {
        proWithCredits(499);
        PlanPreviewDTO p = preview.preview("PRO", 1, "YEAR", "USD", null);
        assertThat(p.interval()).isEqualTo("YEAR");
        assertThat(p.baseMinor()).isEqualTo(21589);
        assertThat(p.includedAiCapCents()).isEqualTo(3600);
        assertThat(p.annual().enabled()).isTrue();
        assertThat(p.annual().derived()).isTrue();
        assertThat(p.annual().discountBp()).isEqualTo(1000);
        assertThat(p.annual().baseYearMinor()).isEqualTo(21589);
        assertThat(p.annual().monthlyEquivalentMinor()).isEqualTo(1799);
        assertThat(p.annual().savingsMinor()).isEqualTo(23988 - 21589);
        assertThat(p.annual().checks()).singleElement().satisfies(c -> assertThat(c.ok()).isTrue());
        patch("PRO", 1, "{\"annualDiscountBp\":1500}");
        PlanPreviewDTO bad = preview.preview("PRO", 1, "YEAR", "USD", null);
        assertThat(bad.annual().checks()).singleElement().satisfies(c -> assertThat(c.ok()).isFalse());
        assertThat(bad.annual().discountBp()).isEqualTo(1500);
    }

    @Test
    void theImpactListsTheStripeObjectsPublishingWouldCreateAndTheCatalogVersionAfter() {
        proWithCredits(499);
        PlanPreviewDTO p = preview.preview("PRO", 1, "MONTH", "USD", null);
        assertThat(p.impact().grandfathered()).isTrue();
        assertThat(p.impact().catalogVersionAfter()).isEqualTo(catalog.currentVersion() + 1);
        assertThat(p.impact().stripeObjectsToCreate()).extracting(o -> o.kind() + ":" + o.productCode() + ":" + o.interval()).contains("price:PRO:MONTH", "price:PRO:QUARTER", "price:PRO:YEAR", "price:FEAT_AI_CREDITS:MONTH", "product:PRO:null");
        assertThat(p.impact().stripeObjectsToCreate()).filteredOn(o -> o.interval() != null && o.interval().equals("YEAR")).allMatch(o -> o.priceRowId() == null);
        assertThat(p.impact().subscribersByVersion()).isEmpty();
    }

    @Test
    void anIntervalTheVersionDoesNotListAndAnUnofferedCurrencyAreRefused() {
        proWithCredits(499);
        patch("PRO", 1, "{\"intervals\":[\"MONTH\"]}");
        assertThatThrownBy(() -> preview.preview("PRO", 1, "QUARTER", "USD", null)).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("INTERVAL_NOT_AVAILABLE"));
        assertThatThrownBy(() -> preview.preview("PRO", 1, "MONTH", "EUR", null)).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("CURRENCY_NOT_OFFERED"));
        assertThatThrownBy(() -> preview.preview("NOPE", 1, null, null, null)).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getStatus()).isEqualTo(404));
    }

    @Test
    void anOrganizationRosterReproducesTheGoldenTotalOfSevenThousandNineHundredNinetyTwo() throws Exception {
        draft("ORG_BASE_LICENSE", "ORG", "MONTH", 1499);
        draft("FEAT_AI_JOB_MATCHING", "ORG", "MONTH", 499);
        draft("FEAT_AI_RESUME_TAILORING", "ORG", "MONTH", 799);
        draft("FEAT_INBOX_MONITORING", "ORG", "MONTH", 499);
        draft("FEAT_MARKETING_ASSISTED", "ORG", "MONTH", 699);
        draft("FEAT_INTERVIEW_AI_PREP", "ORG", "MONTH", 999);
        patch(
            "ORG_STANDARD",
            1,
            "{\"intervals\":[\"MONTH\"],\"presets\":["
                + "{\"key\":\"A\",\"name\":\"Job search plus tailoring\",\"addons\":[{\"featureKey\":\"ai.job_matching\",\"quantity\":1},{\"featureKey\":\"ai.resume_tailoring\",\"quantity\":1}]},"
                + "{\"key\":\"B\",\"name\":\"Inbox, marketing, interviews\",\"addons\":[{\"featureKey\":\"inbox.monitoring\",\"quantity\":1},{\"featureKey\":\"marketing.assisted_applications\",\"quantity\":1},{\"featureKey\":\"interview.ai_prep\",\"quantity\":1}]}]}"
        );
        PlanPreviewDTO p = preview.preview("ORG_STANDARD", 1, "MONTH", "USD", "A,B,BASE");
        assertThat(p.audience()).isEqualTo("ORG");
        assertThat(p.seats().seatBaseMinor()).isEqualTo(1499);
        assertThat(p.seats().roster().lines()).extracting(l -> l.token() + "=" + l.seatTotalMinor()).containsExactly("A=2797", "B=3696", "BASE=1499");
        assertThat(p.seats().roster().orgRecurringMinor()).isEqualTo(7992);
        assertThat(p.seats().presets()).extracting(s -> s.key() + "=" + s.seatTotalMinor()).contains("A=2797", "B=3696");
        PlanPreviewDTO counted = preview.preview("ORG_STANDARD", 1, "MONTH", "USD", "2A,3BASE");
        assertThat(counted.seats().roster().orgRecurringMinor()).isEqualTo(2L * 2797 + 3L * 1499);
        assertThatThrownBy(() -> preview.preview("ORG_STANDARD", 1, "MONTH", "USD", "NOPE")).isInstanceOfSatisfying(CatalogException.class, e -> assertThat(e.getCode()).isEqualTo("INVALID_VALUE"));
    }
}
