package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.billing.StripeGateway;
import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.StripePriceInfo;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.catalog.StripePriceImportService.ImportRequest;
import com.dossier.api.service.catalog.StripePriceImportService.ImportResult;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.transaction.annotation.Transactional;

/** B-01: the launch Stripe prices become DRAFT rows of PRO v1, once, without overwriting anything, and the plan still publishes under the guard. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class StripePriceImportIT extends PlanItSupport {

    @MockBean private StripeGateway gateway;
    @Autowired private StripePriceImportService importer;
    @Autowired private StripeProperties props;

    @BeforeEach
    void stripeOn() {
        when(gateway.isEnabled()).thenReturn(true);
        props.setPriceMonthly("price_launch_month");
        props.setPrice3mo("price_launch_3mo");
        when(gateway.retrievePrice("price_launch_month")).thenReturn(new StripePriceInfo("price_launch_month", "prod_old", "USD", 1999, true, PriceInterval.MONTH, Map.of()));
        when(gateway.retrievePrice("price_launch_3mo")).thenReturn(new StripePriceInfo("price_launch_3mo", "prod_old", "USD", 4999, true, PriceInterval.QUARTER, Map.of()));
    }

    @AfterEach
    void clear() {
        props.setPriceMonthly("");
        props.setPrice3mo("");
    }

    private static void assertCode(Runnable r, int status, String code) {
        assertThatThrownBy(r::run).isInstanceOfSatisfying(CatalogException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(status);
            assertThat(e.getCode()).isEqualTo(code);
        });
    }

    @Test
    void createsTheTwoDraftRowsFromStripeAndIsIdempotent() {
        ImportResult first = importer.importPrices("PRO", 1, new ImportRequest("Cut-over: import the launch prices"));
        assertThat(first.rows()).extracting(r -> r.interval() + ":" + r.outcome()).containsExactly("MONTH:CREATED", "QUARTER:CREATED");
        Map<String, Object> month = jdbc.queryForMap("select pp.amount_minor, pp.currency, pp.stripe_price_id, pp.active, pp.published_at from product_price pp join product p on p.id = pp.product_id where p.code = 'PRO' and pp.billing_interval = 'MONTH'");
        assertThat(((Number) month.get("amount_minor")).longValue()).isEqualTo(1999);
        assertThat(month.get("stripe_price_id")).isEqualTo("price_launch_month");
        assertThat(month.get("published_at")).isNull();

        ImportResult again = importer.importPrices("PRO", 1, new ImportRequest("Cut-over: run the import again"));
        assertThat(again.rows()).extracting(r -> r.outcome()).containsExactly("SKIPPED_EXISTS", "SKIPPED_EXISTS");
        assertThat(jdbc.queryForObject("select count(*) from product_price pp join product p on p.id = pp.product_id where p.code = 'PRO'", Integer.class)).isEqualTo(2);
    }

    @Test
    void neverOverwritesAnExistingRowAndPlanPublishStillRunsTheGuard() {
        var typed = draft("PRO", "INDIVIDUAL", "MONTH", 2500);
        ImportResult r = importer.importPrices("PRO", 1, new ImportRequest("Cut-over: month row already typed"));
        assertThat(r.rows().get(0).outcome()).isEqualTo("SKIPPED_EXISTS");
        assertThat(r.rows().get(1).outcome()).isEqualTo("CREATED");
        assertThat(row(typed.id()).getAmountMinor()).isEqualTo(2500);
        assertThat(row(typed.id()).getStripePriceId()).isNull();
    }

    @Test
    void refusesWhenStripeIsOffOrThePriceIsTheWrongShape() {
        when(gateway.isEnabled()).thenReturn(false);
        assertCode(() -> importer.importPrices("PRO", 1, new ImportRequest("Cut-over: stripe is off here")), 503, "BILLING_DISABLED");
        when(gateway.isEnabled()).thenReturn(true);
        when(gateway.retrievePrice("price_launch_3mo")).thenReturn(new StripePriceInfo("price_launch_3mo", "prod_old", "USD", 4999, true, PriceInterval.MONTH, Map.of()));
        assertCode(() -> importer.importPrices("PRO", 1, new ImportRequest("Cut-over: the 3mo id is wrong")), 422, "STRIPE_PRICE_MISMATCH");
        assertCode(() -> importer.importPrices("PRO", 1, new ImportRequest("short")), 422, "REASON_REQUIRED");
        assertCode(() -> importer.importPrices("AUTOPILOT", 1, new ImportRequest("Cut-over: not a launch plan")), 422, "IMPORT_NOT_SUPPORTED");
    }
}
