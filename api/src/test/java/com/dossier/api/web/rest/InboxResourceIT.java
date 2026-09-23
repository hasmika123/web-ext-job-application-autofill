package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.TestInboxKey;
import com.dossier.api.ProSubscriptions;
import com.dossier.api.domain.InboxConnection;
import com.dossier.api.repository.InboxConnectionRepository;
import com.dossier.api.repository.SubscriptionRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.service.inbox.ImapGateway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The inbox connect API (Phase 14.1) over HTTP, with Gmail replaced by a mock gateway and a key
 * generated per run: Pro only, refusals as {code, message}, the password stored only encrypted and
 * never returned, disconnect forgets it.
 */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class InboxResourceIT {

    @DynamicPropertySource
    static void key(DynamicPropertyRegistry r) {
        r.add("dossier.inbox.key", () -> TestInboxKey.VALUE);
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SubscriptionRepository subscriptionRepository;

    @Autowired
    private InboxConnectionRepository connections;

    @MockitoBean
    private ImapGateway imap;

    private static final String BODY = "{\"address\":\"jobs.hunt@gmail.com\",\"appPassword\":\"abcd efgh ijkl mnop\"}";

    @Test
    void notConnectedAtFirst() throws Exception {
        mockMvc
            .perform(get("/api/profile/inbox"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.connected").value(false))
            .andExpect(jsonPath("$.available").value(true));
    }

    @Test
    void aFreeUserIsToldItIsPro() throws Exception {
        mockMvc
            .perform(post("/api/profile/inbox").contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.code").value("PRO_REQUIRED"));
    }

    @Test
    void connectsKeepsThePasswordEncryptedAndNeverShowsIt() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        when(imap.probe(eq("jobs.hunt@gmail.com"), eq("abcdefghijklmnop"))).thenReturn(
            new ImapGateway.Probe(ImapGateway.Outcome.OK, "[Gmail]/Sent Mail")
        );
        String body = mockMvc
            .perform(post("/api/profile/inbox").contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.connected").value(true))
            .andExpect(jsonPath("$.address").value("jobs.hunt@gmail.com"))
            .andExpect(jsonPath("$.status").value("CONNECTED"))
            .andReturn()
            .getResponse()
            .getContentAsString();
        assertThat(body).doesNotContain("abcd").doesNotContain("passwordEnc").doesNotContain("v1:");

        Long id = userRepository.findOneByLogin("user").orElseThrow().getId();
        InboxConnection c = connections.findById(id).orElseThrow();
        assertThat(c.getPasswordEnc()).startsWith("v1:").doesNotContain("abcd");

        mockMvc.perform(delete("/api/profile/inbox")).andExpect(status().isOk());
        assertThat(connections.findById(id)).isEmpty();
    }

    @Test
    void gmailsRefusalComesBackAsACode() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        when(imap.probe(anyString(), anyString())).thenReturn(new ImapGateway.Probe(ImapGateway.Outcome.BAD_CREDENTIALS, null));
        mockMvc
            .perform(post("/api/profile/inbox").contentType(MediaType.APPLICATION_JSON).content(BODY))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("BAD_CREDENTIALS"))
            .andExpect(jsonPath("$.message").exists());
    }

    @Test
    void aNonGmailAddressIsRefusedUpFront() throws Exception {
        ProSubscriptions.makePro(subscriptionRepository, userRepository, "user");
        mockMvc
            .perform(
                post("/api/profile/inbox")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"address\":\"me@company.com\",\"appPassword\":\"abcdefghijklmnop\"}")
            )
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.code").value("NOT_GMAIL"));
    }
}
