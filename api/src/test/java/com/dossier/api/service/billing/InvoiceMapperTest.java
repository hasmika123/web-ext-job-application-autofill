package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.billing.InvoiceLine;
import com.dossier.api.service.billing.InvoiceMapper.PriceRef;
import com.dossier.api.service.billing.StripeWebhookEvent.InvoiceInfo;
import com.dossier.api.service.billing.StripeWebhookEvent.InvoiceLineInfo;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class InvoiceMapperTest {

    private static final Instant T0 = Instant.parse("2026-10-01T00:00:00Z");
    private static final Instant T1 = Instant.parse("2026-11-01T00:00:00Z");

    private static final InvoiceMapper.PriceLookup CATALOG = id ->
        "price_credits".equals(id) ? Optional.of(new PriceRef(42L, "ai.credits_extra")) : "price_pro".equals(id) ? Optional.of(new PriceRef(7L, null)) : Optional.empty();

    private static InvoiceInfo invoice(String status, List<InvoiceLineInfo> lines, long due, long paid) {
        return new InvoiceInfo("in_1", "KIW-0001", status, "usd", due, paid, T0, T1, null, null, "https://pay.example/in_1", "https://pay.example/in_1.pdf", lines);
    }

    private static StripeWebhookEvent event(String type, InvoiceInfo inv) {
        return new StripeWebhookEvent("evt_" + type, type, T0.plusSeconds(60), "invoice", "cus_1", "sub_1", null, null, null, null, null, null, null, "kiwiply", null, null, null, null, List.of(), inv, null, null, null);
    }

    @Test
    void baseAddonAndProrationLinesAreClassifiedStampedAndAddUp() {
        var lines = List.of(
            new InvoiceLineInfo("price_pro", 1, 1999, "Pro", T0, T1, false),
            new InvoiceLineInfo("price_credits", 2, 800, "Extra AI credits x 2", T0, T1, false),
            new InvoiceLineInfo("price_credits", 1, 150, "Unused time on Extra AI credits", T0, T1, true)
        );
        InvoiceInfo inv = invoice("paid", lines, 2949, 2949);
        List<InvoiceLine> out = InvoiceMapper.lines(inv, 5L, "price_pro", 3L, CATALOG);

        assertThat(out).extracting(InvoiceLine::getLineKind).containsExactly("BASE", "ADDON", "PRORATION");
        assertThat(out.get(0).getPlanVersionId()).as("the base line is stamped with the plan version").isEqualTo(3L);
        assertThat(out.get(1).getFeatureKey()).isEqualTo("ai.credits_extra");
        assertThat(out.get(1).getPriceId()).isEqualTo(42L);
        assertThat(out.get(1).getUnitAmountMinor()).isEqualTo(400);
        assertThat(out.get(2).isProration()).isTrue();
        assertThat(out).allSatisfy(l -> assertThat(l.getUserId()).isEqualTo(5L));
        assertThat(InvoiceMapper.linesSumTo(out, inv.amountDue())).as("sum of lines = amount due").isTrue();
        assertThat(out).extracting(InvoiceLine::getSortOrder).containsExactly(0, 1, 2);
    }

    @Test
    void aNegativeLineWithoutAPriceIsADiscountOrACredit() {
        var lines = List.of(new InvoiceLineInfo(null, 1, -200, "20% off for 3 months", null, null, false), new InvoiceLineInfo(null, 1, -300, "Account credit applied", null, null, false), new InvoiceLineInfo("price_unknown", 1, 100, "?", null, null, false));
        List<InvoiceLine> out = InvoiceMapper.lines(invoice("open", lines, 0, 0), 5L, "price_pro", 3L, CATALOG);
        assertThat(out).extracting(InvoiceLine::getLineKind).containsExactly("DISCOUNT", "CREDIT", "OTHER");
    }

    @Test
    void theInvoiceRowFollowsTheEvent() {
        Invoice row = new Invoice();
        InvoiceMapper.apply(row, event("invoice.paid", invoice("open", List.of(), 1999, 1999)));
        assertThat(row.getStatus()).isEqualTo("paid");
        assertThat(row.getCurrency()).isEqualTo("USD");
        assertThat(row.getAmountDueMinor()).isEqualTo(1999);
        assertThat(row.getAmountPaidMinor()).isEqualTo(1999);
        assertThat(row.getPaidAt()).as("a paid invoice without a paid timestamp takes the event's").isEqualTo(T0.plusSeconds(60));
        assertThat(row.getPeriodEnd()).isEqualTo(T1);
        assertThat(row.getHostedInvoiceUrl()).isEqualTo("https://pay.example/in_1");

        assertThat(InvoiceMapper.status("invoice.voided", "open")).isEqualTo("void");
        assertThat(InvoiceMapper.status("invoice.updated", "Uncollectible")).isEqualTo("uncollectible");
        assertThat(InvoiceMapper.status("invoice.created", null)).isEqualTo("open");
    }
}
