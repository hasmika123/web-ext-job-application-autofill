package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.domain.billing.Invoice;
import com.dossier.api.domain.billing.InvoiceLine;
import com.dossier.api.repository.sub.InvoiceLineRepository;
import com.dossier.api.repository.sub.InvoiceRepository;
import com.dossier.api.service.billing.StripeWebhookEvent.InvoiceInfo;
import com.dossier.api.service.billing.StripeWebhookEvent.InvoiceLineInfo;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class InvoiceMirrorTest {

    private static final Instant T0 = Instant.parse("2026-10-01T00:00:00Z");
    private static final Instant T1 = Instant.parse("2026-11-01T00:00:00Z");

    private InvoiceRepository invoices;
    private InvoiceLineRepository lines;
    private StripeGateway gateway;
    private JdbcTemplate jdbc;
    private ApplicationEventPublisher events;
    private InvoiceMirror mirror;
    private Subscription sub;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        invoices = mock(InvoiceRepository.class);
        lines = mock(InvoiceLineRepository.class);
        gateway = mock(StripeGateway.class);
        jdbc = mock(JdbcTemplate.class);
        events = mock(ApplicationEventPublisher.class);
        mirror = new InvoiceMirror(invoices, lines, gateway, jdbc, events);
        User u = new User();
        u.setId(5L);
        sub = new Subscription();
        sub.setId(9L);
        sub.setUser(u);
        sub.setStripeSubscriptionId("sub_1");
        sub.setPriceId("price_pro");
        when(invoices.save(any(Invoice.class))).thenAnswer(i -> {
            Invoice inv = i.getArgument(0);
            if (inv.getId() == null) inv.setId(100L);
            return inv;
        });
        when(jdbc.queryForList(anyString(), org.mockito.ArgumentMatchers.<Class<Long>>any(), anyLong())).thenReturn(List.of(3L));
        when(jdbc.query(anyString(), any(RowMapper.class), anyString())).thenReturn(List.of());
    }

    private static StripeWebhookEvent event(String id, String type, Instant created, InvoiceInfo inv) {
        return new StripeWebhookEvent(id, type, created, "invoice", "cus_1", "sub_1", null, null, null, null, null, null, null, "kiwiply", null, null, null, null, List.of(), inv, null, null, null);
    }

    private static InvoiceInfo inv(String status, Instant paidAt, List<InvoiceLineInfo> ls) {
        return new InvoiceInfo("in_1", "KIW-1", status, "usd", 1999, "paid".equals(status) ? 1999 : 0, T0, T1, null, paidAt, null, null, ls);
    }

    private static final List<InvoiceLineInfo> ONE = List.of(new InvoiceLineInfo("price_pro", 1, 1999, "Pro", T0, T1, false));

    @Test
    void aNewInvoiceIsCreatedWithItsLines() {
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.empty());
        mirror.mirror(event("e1", "invoice.created", T0, inv("open", null, ONE)), sub);
        ArgumentCaptor<Invoice> row = ArgumentCaptor.forClass(Invoice.class);
        verify(invoices).save(row.capture());
        assertThat(row.getValue().getUserId()).isEqualTo(5L);
        assertThat(row.getValue().getSubscriptionId()).isEqualTo(9L);
        assertThat(row.getValue().getStatus()).isEqualTo("open");
        verify(lines).deleteByInvoiceId(100L);
        ArgumentCaptor<InvoiceLine> line = ArgumentCaptor.forClass(InvoiceLine.class);
        verify(lines).save(line.capture());
        assertThat(line.getValue().getInvoiceId()).isEqualTo(100L);
        assertThat(line.getValue().getLineKind()).isEqualTo("BASE");
        assertThat(line.getValue().getPlanVersionId()).isEqualTo(3L);
    }

    @Test
    void anOlderEventIsDroppedAndTheSameEventTwiceWritesOneRow() {
        Invoice existing = new Invoice();
        existing.setId(100L);
        existing.setStripeInvoiceId("in_1");
        existing.setLastEventAt(T0.plusSeconds(600));
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.of(existing));
        mirror.mirror(event("e0", "invoice.updated", T0, inv("open", null, ONE)), sub);
        verify(invoices, never()).save(any());

        mirror.mirror(event("e2", "invoice.updated", T0.plusSeconds(700), inv("open", null, ONE)), sub);
        mirror.mirror(event("e2", "invoice.updated", T0.plusSeconds(700), inv("open", null, ONE)), sub);
        verify(invoices, times(2)).save(existing); // the same row both times: the unique stripe_invoice_id is the identity
    }

    @Test
    void paidMovesPaidThroughForwardAndStampsFirstPaidOnce() {
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.empty());
        mirror.mirror(event("e3", "invoice.paid", T0.plusSeconds(5), inv("paid", T0.plusSeconds(4), ONE)), sub);
        verify(jdbc).update(contains("paid_through_at"), any(Object.class), anyLong(), any(Object.class));
        verify(jdbc).update(contains("first_paid_at IS NULL"), any(Object.class), anyLong());
    }

    @Test
    void anUnpaidEventTouchesNeitherPaidThroughNorFirstPaid() {
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.empty());
        mirror.mirror(event("e4", "invoice.payment_failed", T0, inv("open", null, ONE)), sub);
        verify(jdbc, never()).update(contains("paid_through_at"), any(Object.class), anyLong(), any(Object.class));
        ArgumentCaptor<Invoice> row = ArgumentCaptor.forClass(Invoice.class);
        verify(invoices).save(row.capture());
        assertThat(row.getValue().getAttemptCount()).isEqualTo(1);
    }

    @Test
    void anEventForACustomerWeDoNotKnowMirrorsNothing() {
        mirror.mirror(event("e5", "invoice.paid", T0, inv("paid", T0, ONE)), null);
        verify(invoices, never()).save(any());
    }

    @Test
    void anEventWithoutLinesReadsThemOnceFromStripe() {
        when(invoices.findByStripeInvoiceId("in_1")).thenReturn(Optional.empty());
        when(gateway.isEnabled()).thenReturn(true);
        when(gateway.retrieveInvoice("in_1")).thenReturn(new StripeGateway.InvoiceSummary("in_1", "KIW-1", "open", "usd", 1999, 0, T0, T1, null, null, null, null, "sub_1",
            List.of(new StripeGateway.InvoiceLine("price_pro", 1, 1999, "Pro", T0, T1, false))));
        mirror.mirror(event("e6", "invoice.finalized", T0, inv("open", null, List.of())), sub);
        verify(gateway).retrieveInvoice("in_1");
        verify(lines).save(any(InvoiceLine.class));
    }

    @Test
    void upcomingPublishesRenewalSoonOncePerUserAndPeriod() {
        mirror.mirror(event("e7", "invoice.upcoming", T0, new InvoiceInfo(null, null, "draft", "usd", 1999, 0, T0, T1, null, null, null, null, List.of())), sub);
        mirror.mirror(event("e8", "invoice.upcoming", T0, new InvoiceInfo(null, null, "draft", "usd", 1999, 0, T0, T1, null, null, null, null, List.of())), sub);
        verify(events, times(1)).publishEvent(new InvoiceMirror.RenewalSoon(5L, T1));
        verify(invoices, never()).save(any());
    }
}
