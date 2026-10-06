package com.dossier.api.service.inbox;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.InboxMessage;
import com.dossier.api.domain.User;
import com.dossier.api.repository.InboxMessageRepository;
import com.dossier.api.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Inbox data against the real schema (Phase 14.7): mail expires after a year; the export has it. */
@IntegrationTest
@AutoConfigureMockMvc
@WithMockUser(username = "user")
@Transactional
class InboxDataIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private InboxMessageRepository messages;

    @Autowired
    private InboxRetention retention;

    private InboxMessage mail(User owner, String subject, Instant sentAt) {
        InboxMessage m = new InboxMessage();
        m.setUserId(owner.getId());
        m.setFolder("INBOX");
        m.setDirection(InboxMessage.IN);
        m.setUid(1);
        m.setDedupKey(UUID.randomUUID().toString().replace("-", ""));
        m.setSubject(subject);
        m.setFromAddress("no-reply@greenhouse-mail.io");
        m.setSentAt(sentAt);
        m.setJobMail(true);
        m.setBodyText("We received your application.");
        return messages.saveAndFlush(m);
    }

    @Test
    void mailOlderThanAYearIsDeleted() {
        User me = userRepository.findOneByLogin("user").orElseThrow();
        InboxMessage old = mail(me, "From last year", Instant.now().minus(Duration.ofDays(400)));
        InboxMessage recent = mail(me, "From last week", Instant.now().minus(Duration.ofDays(7)));

        assertThat(retention.purge(Instant.now())).isGreaterThanOrEqualTo(1);

        assertThat(messages.findById(old.getId())).isEmpty();
        assertThat(messages.findById(recent.getId())).isPresent();
    }

    @Test
    void theDataExportIncludesTheMail() throws Exception {
        User me = userRepository.findOneByLogin("user").orElseThrow();
        mail(me, "Thank you for applying to Acme", Instant.now().minus(Duration.ofDays(2)));
        String body = mockMvc
            .perform(get("/api/account/export"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.inbox.messages[0].subject").value("Thank you for applying to Acme"))
            .andExpect(jsonPath("$.inbox.messages[0].bodyText").value("We received your application."))
            .andReturn()
            .getResponse()
            .getContentAsString();
        // No inbox connected: no connection in the export (absent or null, whichever the JSON writes).
        JsonNode connection = new ObjectMapper().readTree(body).path("inbox").path("connection");
        assertThat(connection.isMissingNode() || connection.isNull()).isTrue();
    }
}
