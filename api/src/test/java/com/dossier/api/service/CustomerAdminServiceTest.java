package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.CustomerNote;
import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.CustomerNoteRepository;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.billing.StripeProperties;
import com.dossier.api.service.dto.CustomerDTOs.Customer;
import com.dossier.api.service.dto.CustomerDTOs.Detail;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/** Unit tests for the admin Customers page + timeline (Phase 9.C1). */
class CustomerAdminServiceTest {

    private static final Instant NOW = Instant.now();

    private SubscriptionRepository subscriptions;
    private StripeEventRepository events;
    private CustomerNoteRepository notes;
    private UserRepository users;
    private StripeProperties props;
    private AdminAuditService audit;
    private CustomerAdminService service;

    @BeforeEach
    void setUp() {
        subscriptions = Mockito.mock(SubscriptionRepository.class);
        events = Mockito.mock(StripeEventRepository.class);
        notes = Mockito.mock(CustomerNoteRepository.class);
        users = Mockito.mock(UserRepository.class);
        audit = Mockito.mock(AdminAuditService.class);
        props = new StripeProperties();
        props.setPriceMonthly("price_m");
        props.setPrice3mo("price_q");
        props.setSecretKey("sk_test_abc");
        service = new CustomerAdminService(subscriptions, events, notes, users, props, audit);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static User user(long id, String login) {
        User u = new User();
        u.setId(id);
        u.setLogin(login);
        u.setEmail(login + "@x.com");
        u.setFirstName("Pat");
        u.setLastName(login);
        return u;
    }

    private static Subscription sub(User u, String status, Instant periodEnd, boolean cancelAtEnd, Instant created) {
        Subscription s = new Subscription();
        s.setUser(u);
        s.setStripeCustomerId("cus_" + u.getLogin());
        s.setStripeSubscriptionId("sub_" + u.getLogin());
        s.setStatus(status);
        s.setCurrentPeriodEnd(periodEnd);
        s.setCancelAtPeriodEnd(cancelAtEnd);
        s.setPriceId("price_m");
        s.setCreatedAt(created);
        return s;
    }

    private static Instant future() {
        return NOW.plus(10, ChronoUnit.DAYS);
    }

    // ---- status groups -----------------------------------------------------------------------

    @Test
    void statusGroups() {
        User u = user(1, "a");
        assertThat(CustomerAdminService.statusGroup(sub(u, "active", future(), false, NOW), NOW)).isEqualTo("ACTIVE");
        assertThat(CustomerAdminService.statusGroup(sub(u, "active", future(), true, NOW), NOW)).isEqualTo("CANCELLING");
        assertThat(CustomerAdminService.statusGroup(sub(u, "canceled", future(), false, NOW), NOW)).isEqualTo("CANCELLING");
        assertThat(CustomerAdminService.statusGroup(sub(u, "past_due", future(), false, NOW), NOW)).isEqualTo("PAST_DUE");
        assertThat(CustomerAdminService.statusGroup(sub(u, "unpaid", null, false, NOW), NOW)).isEqualTo("PAST_DUE");
        assertThat(CustomerAdminService.statusGroup(sub(u, "canceled", NOW.minus(1, ChronoUnit.DAYS), true, NOW), NOW)).isEqualTo("LAPSED");
    }

    // ---- list + counts -----------------------------------------------------------------------

    @Test
    void listShowsOnlyRealCustomersNewestFirstWithTotals() {
        Subscription older = sub(user(1, "old"), "active", future(), false, NOW.minus(40, ChronoUnit.DAYS));
        Subscription newer = sub(user(2, "new"), "past_due", future(), false, NOW);
        Subscription checkoutOnly = sub(user(3, "browsing"), "none", null, false, NOW);
        checkoutOnly.setStripeSubscriptionId(null); // started a checkout, never subscribed
        when(subscriptions.findAll()).thenReturn(List.of(older, newer, checkoutOnly));
        List<Object[]> totals = new ArrayList<>();
        totals.add(new Object[] { "cus_old", 5997L, "usd" });
        when(events.sumPaidByCustomer(anyCollection())).thenReturn(totals);

        Page<Customer> page = service.list("", PageRequest.of(0, 20));

        assertThat(page.getTotalElements()).isEqualTo(2);
        assertThat(page.getContent()).extracting(Customer::login).containsExactly("new", "old");
        Customer old = page.getContent().get(1);
        assertThat(old.totalPaidCents()).isEqualTo(5997L);
        assertThat(old.billing()).isEqualTo("MONTHLY");
        assertThat(old.name()).isEqualTo("Pat old");
        assertThat(old.stripeUrl()).isEqualTo("https://dashboard.stripe.com/test/customers/cus_old");
        assertThat(page.getContent().get(0).totalPaidCents()).isZero();
    }

    @Test
    void filtersByGroupAndNew() {
        Subscription active = sub(user(1, "a"), "active", future(), false, NOW.minus(60, ChronoUnit.DAYS));
        Subscription failed = sub(user(2, "f"), "past_due", future(), false, NOW.minus(60, ChronoUnit.DAYS));
        Subscription fresh = sub(user(3, "n"), "active", future(), false, NOW);
        when(subscriptions.findAll()).thenReturn(List.of(active, failed, fresh));
        when(events.sumPaidByCustomer(anyCollection())).thenReturn(List.of());

        assertThat(service.list("past_due", PageRequest.of(0, 20)).getContent()).extracting(Customer::login).containsExactly("f");
        assertThat(service.list("NEW", PageRequest.of(0, 20)).getContent()).extracting(Customer::login).containsExactly("n");
        assertThat(service.counts()).containsEntry("ACTIVE", 2L).containsEntry("PAST_DUE", 1L).containsEntry("NEW", 1L).containsEntry("ALL", 3L);
    }

    @Test
    void liveKeyLinksToTheLiveDashboard() {
        props.setSecretKey("sk_live_abc");
        assertThat(service.stripeUrl("cus_1")).isEqualTo("https://dashboard.stripe.com/customers/cus_1");
        assertThat(service.stripeUrl(null)).isNull();
    }

    // ---- detail + notes ----------------------------------------------------------------------

    @Test
    void detailMergesBillingAndNotesNewestFirst() {
        User u = user(7, "pat");
        when(users.findOneByLogin("pat")).thenReturn(Optional.of(u));
        when(subscriptions.findOneByUserId(7L)).thenReturn(Optional.of(sub(u, "active", future(), false, NOW)));
        when(events.sumPaidByCustomer(anyCollection())).thenReturn(List.of());

        StripeEvent paid = new StripeEvent();
        paid.setId("evt_1");
        paid.setType("invoice.paid");
        paid.setDetail("Payment received");
        paid.setAmountCents(1999L);
        paid.setCurrency("usd");
        paid.setOccurredAt(NOW.minus(2, ChronoUnit.DAYS));
        StripeEvent failed = new StripeEvent();
        failed.setId("evt_2");
        failed.setType("customer.subscription.updated");
        failed.setStatus(StripeEvent.STATUS_FAILED);
        failed.setOccurredAt(NOW.minus(3, ChronoUnit.DAYS));
        when(events.findTimeline(eq(7L), eq("cus_pat"), any())).thenReturn(List.of(paid, failed));

        CustomerNote note = new CustomerNote();
        note.setAuthorLogin("boss");
        note.setBody("Called about the card");
        note.setCreatedAt(NOW.minus(1, ChronoUnit.DAYS));
        when(notes.findAllByUserIdOrderByCreatedAtDesc(7L)).thenReturn(List.of(note));

        Detail d = service.detail("pat");

        assertThat(d.customer()).isNotNull();
        assertThat(d.timeline()).extracting(e -> e.kind()).containsExactly("NOTE", "BILLING", "BILLING");
        assertThat(d.timeline().get(0).body()).isEqualTo("Called about the card");
        assertThat(d.timeline().get(1).amountCents()).isEqualTo(1999L);
        // No stored description falls back to the event type, and a failed apply is flagged.
        assertThat(d.timeline().get(2).title()).isEqualTo("customer.subscription.updated");
        assertThat(d.timeline().get(2).failed()).isTrue();
    }

    @Test
    void detailForANonCustomerHasNoSummary() {
        User u = user(8, "free");
        when(users.findOneByLogin("free")).thenReturn(Optional.of(u));
        when(subscriptions.findOneByUserId(8L)).thenReturn(Optional.empty());
        when(events.findTimeline(eq(8L), isNull(), any())).thenReturn(List.of());
        when(notes.findAllByUserIdOrderByCreatedAtDesc(8L)).thenReturn(List.of());

        Detail d = service.detail("free");
        assertThat(d.customer()).isNull();
        assertThat(d.timeline()).isEmpty();
    }

    @Test
    void unknownUserIs404() {
        when(users.findOneByLogin("ghost")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.detail("ghost")).isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void addNoteSavesTrimmedAndAudits() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("boss", null));
        when(users.findOneByLogin("pat")).thenReturn(Optional.of(user(7, "pat")));

        service.addNote("pat", "  Refunded as goodwill  ");

        ArgumentCaptor<CustomerNote> captor = ArgumentCaptor.forClass(CustomerNote.class);
        verify(notes).save(captor.capture());
        assertThat(captor.getValue().getBody()).isEqualTo("Refunded as goodwill");
        assertThat(captor.getValue().getAuthorLogin()).isEqualTo("boss");
        assertThat(captor.getValue().getUserId()).isEqualTo(7L);
        verify(audit).record(eq(AdminAuditService.CUSTOMER_NOTE_ADD), eq(AdminAuditService.TARGET_USER), eq("pat"), isNull(), eq("length=20"));
    }

    @Test
    void emptyOrHugeNotesAreRejected() {
        when(users.findOneByLogin("pat")).thenReturn(Optional.of(user(7, "pat")));
        assertThatThrownBy(() -> service.addNote("pat", "   ")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> service.addNote("pat", "x".repeat(4001))).isInstanceOf(ResponseStatusException.class);
        verify(notes, never()).save(any());
    }
}
