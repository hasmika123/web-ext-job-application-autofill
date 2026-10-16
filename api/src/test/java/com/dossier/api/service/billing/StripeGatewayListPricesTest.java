package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.billing.StripeGateway.PriceInterval;
import com.dossier.api.service.billing.StripeGateway.StripePriceInfo;
import com.dossier.api.service.billing.StripeGatewayImplTest.Recorder;
import com.stripe.StripeClient;
import java.util.List;
import org.junit.jupiter.api.Test;

/** K1.5: the read the catalog reconciler uses. Recorded fixtures through the same stub response getter as StripeGatewayImplTest. */
class StripeGatewayListPricesTest {

    private static StripeProperties props(String key) {
        StripeProperties p = new StripeProperties();
        p.setSecretKey(key);
        return p;
    }

    private static final String PAGE =
        "{\"object\":\"list\",\"has_more\":false,\"data\":[" +
        "{\"id\":\"price_m\",\"object\":\"price\",\"active\":true,\"currency\":\"usd\",\"unit_amount\":1999,\"product\":\"prod_1\",\"metadata\":{\"app\":\"kiwiply\",\"price_row_id\":\"11\"},\"recurring\":{\"interval\":\"month\",\"interval_count\":1}}," +
        "{\"id\":\"price_q\",\"object\":\"price\",\"active\":false,\"currency\":\"usd\",\"unit_amount\":4999,\"product\":\"prod_1\",\"metadata\":{\"app\":\"kiwiply\"},\"recurring\":{\"interval\":\"month\",\"interval_count\":3}}," +
        "{\"id\":\"price_y\",\"object\":\"price\",\"active\":true,\"currency\":\"usd\",\"unit_amount\":21589,\"product\":\"prod_1\",\"metadata\":{\"app\":\"kiwiply\"},\"recurring\":{\"interval\":\"month\",\"interval_count\":12}}," +
        "{\"id\":\"price_o\",\"object\":\"price\",\"active\":true,\"currency\":\"usd\",\"unit_amount\":49900,\"product\":\"prod_2\",\"metadata\":{\"app\":\"kiwiply\"}}," +
        "{\"id\":\"price_other\",\"object\":\"price\",\"active\":true,\"currency\":\"usd\",\"unit_amount\":100,\"product\":\"prod_9\",\"metadata\":{\"app\":\"beecompete\"}}," +
        "{\"id\":\"price_bare\",\"object\":\"price\",\"active\":true,\"currency\":\"usd\",\"unit_amount\":100,\"product\":\"prod_9\"}]}";

    @Test
    void onlyKiwiplyPricesComeBackWithTheirIntervalMappedBack() {
        Recorder rec = new Recorder();
        rec.responses.put("/v1/prices", PAGE);
        StripeGateway gateway = new StripeGatewayImpl(props("sk_test_unit"), new StripeClient(rec));
        List<StripePriceInfo> out = gateway.listPrices(100);
        assertThat(out).extracting(StripePriceInfo::id).containsExactly("price_m", "price_q", "price_y", "price_o");
        assertThat(out).extracting(StripePriceInfo::interval).containsExactly(PriceInterval.MONTH, PriceInterval.QUARTER, PriceInterval.YEAR, PriceInterval.ONE_TIME);
        assertThat(out.get(0).currency()).isEqualTo("USD");
        assertThat(out.get(0).unitAmountMinor()).isEqualTo(1999);
        assertThat(out.get(1).active()).isFalse();
        assertThat(out.get(0).metadata()).containsEntry("price_row_id", "11");
        assertThat(rec.calls).hasSize(1);
        assertThat(rec.calls.get(0).method()).isEqualTo("GET");
        assertThat(rec.writes()).as("a read never writes").isEmpty();
        assertThat(rec.calls.get(0).options().getIdempotencyKey()).isNull();
    }

    @Test
    void theMaximumStopsTheListEarly() {
        Recorder rec = new Recorder();
        rec.responses.put("/v1/prices", PAGE);
        StripeGateway gateway = new StripeGatewayImpl(props("sk_test_unit"), new StripeClient(rec));
        assertThat(gateway.listPrices(2)).hasSize(2);
    }

    @Test
    void withBillingDisabledItRefuses() {
        StripeGateway off = new StripeGatewayImpl(props(""));
        assertThatThrownBy(() -> off.listPrices(10)).isInstanceOf(StripeGatewayException.class).satisfies(e -> assertThat(((StripeGatewayException) e).getKind()).isEqualTo(StripeGatewayException.Kind.NOT_ENABLED));
    }
}
