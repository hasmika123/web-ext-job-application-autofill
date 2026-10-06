package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.StripeEvent;
import com.dossier.api.domain.Subscription;
import com.dossier.api.domain.User;
import com.dossier.api.repository.CustomerNoteRepository;
import com.dossier.api.repository.StripeEventRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin Customers page + timeline + notes (Phase 9.C1): ADMIN-gated, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminCustomerResourceIT {

    private static final String CUSTOMER = "cus_admin_it_1";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private StripeEventRepository stripeEventRepository;

    @Autowired
    private CustomerNoteRepository customerNoteRepository;

    private User user;

    @BeforeEach
    void seed() {
        user = userRepository.findOneByLogin("user").orElseThrow();
        // Rolled back after each test; other ITs (the webhook's) leave rows tied to the same user.
        customerNoteRepository.deleteAll();
        stripeEventRepository.deleteAll();
        subscriptionRepository.deleteAll();

        Subscription sub = new Subscription();
        sub.setUser(user);
        sub.setStripeCustomerId(CUSTOMER);
        sub.setStripeSubscriptionId("sub_admin_it_1");
        sub.setStatus("past_due");
        sub.setCurrentPeriodEnd(Instant.now().plus(10, ChronoUnit.DAYS));
        sub.setCreatedAt(Instant.now());
        sub.setUpdatedAt(Instant.now());
        subscriptionRepository.saveAndFlush(sub);

        stripeEventRepository.saveAndFlush(event("evt_admin_it_paid", "invoice.paid", "Payment received", 1999L, 2));
        stripeEventRepository.saveAndFlush(event("evt_admin_it_failed", "invoice.payment_failed", "Payment failed", 1999L, 1));
    }

    private StripeEvent event(String id, String type, String detail, Long cents, int daysAgo) {
        StripeEvent e = new StripeEvent();
        e.setId(id);
        e.setType(type);
        e.setStatus(StripeEvent.STATUS_OK);
        e.setCustomerId(CUSTOMER);
        e.setUserId(user.getId());
        e.setAmountCents(cents);
        e.setCurrency("usd");
        e.setDetail(detail);
        e.setOccurredAt(Instant.now().minus(daysAgo, ChronoUnit.DAYS));
        e.setReceivedAt(Instant.now());
        return e;
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/customers")).andExpect(status().isForbidden());
        mockMvc.perform(get("/api/admin/customers/user")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void listsAndFiltersCustomersWithWhatTheyPaid() throws Exception {
        mockMvc
            .perform(get("/api/admin/customers"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].login").value("user"))
            .andExpect(jsonPath("$[0].statusGroup").value("PAST_DUE"))
            .andExpect(jsonPath("$[0].totalPaidCents").value(1999));

        mockMvc.perform(get("/api/admin/customers?filter=PAST_DUE")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/admin/customers?filter=CANCELLING")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc
            .perform(get("/api/admin/customers/counts"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.PAST_DUE").value(1))
            .andExpect(jsonPath("$.ALL").value(1));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void timelineShowsBillingAndNotesNewestFirst() throws Exception {
        mockMvc
            .perform(post("/api/admin/customers/user/notes").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Emailed about the card\"}"))
            .andExpect(status().isCreated());
        assertThat(customerNoteRepository.findAllByUserIdOrderByCreatedAtDesc(user.getId())).hasSize(1);

        mockMvc
            .perform(get("/api/admin/customers/user"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.customer.statusGroup").value("PAST_DUE"))
            .andExpect(jsonPath("$.timeline.length()").value(3))
            .andExpect(jsonPath("$.timeline[0].kind").value("NOTE"))
            .andExpect(jsonPath("$.timeline[0].body").value("Emailed about the card"))
            .andExpect(jsonPath("$.timeline[1].title").value("Payment failed"))
            .andExpect(jsonPath("$.timeline[2].amountCents").value(1999));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void badNotesAndUnknownUsersAreRejected() throws Exception {
        mockMvc
            .perform(post("/api/admin/customers/user/notes").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"   \"}"))
            .andExpect(status().isBadRequest());
        mockMvc.perform(get("/api/admin/customers/nobody-here")).andExpect(status().isNotFound());
    }
}
