package com.dossier.api.service.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

class BackfillPeriodStartJobTest {

    private static final Instant START = Instant.parse("2026-10-01T00:00:00Z");

    private JdbcTemplate jdbc;
    private StripeGateway gateway;
    private BackfillPeriodStartJob job;

    @BeforeEach
    void setUp() {
        jdbc = mock(JdbcTemplate.class);
        gateway = mock(StripeGateway.class);
        job = new BackfillPeriodStartJob(jdbc, gateway);
        when(gateway.isEnabled()).thenReturn(true);
    }

    @SuppressWarnings("unchecked")
    private void rows(Object[]... r) {
        when(jdbc.query(anyString(), any(RowMapper.class), anyLong())).thenReturn(List.of(r));
    }

    private static StripeGateway.InvoiceSummary invoice(String subscriptionId, Instant start) {
        return new StripeGateway.InvoiceSummary("in_1", null, "paid", "usd", 1999, 1999, start, null, null, null, null, null, subscriptionId, List.of());
    }

    @Test
    void aBlankStripeKeySkipsTheJobWithoutTouchingAnything() {
        when(gateway.isEnabled()).thenReturn(false);
        var r = job.run(0);
        assertThat(r.stripeOff()).isTrue();
        assertThat(r.done()).isTrue();
        verify(jdbc, never()).update(anyString(), any(Object[].class));
    }

    @Test
    void itStampsTheNewestInvoicePeriodOfTheRowsOwnSubscriptionAndNeverWritesToStripe() {
        rows(new Object[] { 1L, "cus_1", "sub_1" }, new Object[] { 2L, "cus_2", "sub_2" });
        when(gateway.listInvoices("cus_1", 5, null)).thenReturn(List.of(invoice("sub_other", START.minusSeconds(99)), invoice("sub_1", START)));
        when(gateway.listInvoices("cus_2", 5, null)).thenReturn(List.of());
        when(jdbc.update(anyString(), any(Object.class), anyLong())).thenReturn(1);
        var r = job.run(0);
        assertThat(r.updated()).isEqualTo(1);
        assertThat(r.skipped()).isEqualTo(1);
        assertThat(r.nextCursor()).isEqualTo(2L);
        assertThat(r.done()).as("fewer rows than a page: nothing left").isTrue();
        verify(gateway).listInvoices(eq("cus_1"), anyInt(), any());
        verify(gateway, never()).setSubscriptionItems(any(), any(), any());
        verify(gateway, never()).createSubscription(any(), any(), any(), any(), any());
        verify(gateway, never()).cancelSubscription(any());
        verify(gateway, never()).createInvoiceItem(any(), anyLong(), any(), any(), any(), any(), any());
    }

    @Test
    void aStripeOutageStopsTheRunAtTheFailingRowAndLeavesAResumableCursor() {
        rows(new Object[] { 1L, "cus_1", "sub_1" }, new Object[] { 2L, "cus_2", "sub_2" }, new Object[] { 3L, "cus_3", "sub_3" });
        when(gateway.listInvoices("cus_1", 5, null)).thenReturn(List.of(invoice("sub_1", START)));
        when(gateway.listInvoices("cus_2", 5, null)).thenThrow(new StripeGatewayException("down"));
        when(jdbc.update(anyString(), any(Object.class), anyLong())).thenReturn(1);
        var r = job.run(0);
        assertThat(r.updated()).isEqualTo(1);
        assertThat(r.nextCursor()).as("continue after row 1, i.e. retry row 2").isEqualTo(1L);
        assertThat(r.done()).isFalse();
        verify(gateway, never()).listInvoices(eq("cus_3"), anyInt(), any());
    }

    @Test
    void aRerunWithNothingLeftChangesNothing() {
        rows();
        var r = job.run(0);
        assertThat(r.updated()).isZero();
        assertThat(r.done()).isTrue();
        verify(gateway, never()).listInvoices(any(), anyInt(), any());
    }
}
