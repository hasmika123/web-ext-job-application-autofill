package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.EmailSubscriber;
import com.dossier.api.domain.enumeration.SubscriberStatus;
import com.dossier.api.repository.EmailSubscriberRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public newsletter flow (Phase 9.A4): subscribe (double opt-in) → confirm → unsubscribe, end to
 * end against a real MySQL container. Endpoints are public (no auth).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class NewsletterResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private EmailSubscriberRepository repository;

    @Test
    void subscribeCreatesPendingSubscriber() throws Exception {
        mockMvc
            .perform(post("/api/newsletter/subscribe").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"new@example.com\",\"source\":\"footer\"}"))
            .andExpect(status().isAccepted())
            .andExpect(jsonPath("$.ok").value(true));

        EmailSubscriber s = repository.findByEmailIgnoreCase("new@example.com").orElseThrow();
        assertThat(s.getStatus()).isEqualTo(SubscriberStatus.PENDING);
        assertThat(s.getConfirmToken()).isNotBlank();
    }

    @Test
    void invalidEmailIsRejected() throws Exception {
        mockMvc
            .perform(post("/api/newsletter/subscribe").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"nope\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void confirmThenUnsubscribe() throws Exception {
        mockMvc
            .perform(post("/api/newsletter/subscribe").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"flow@example.com\"}"))
            .andExpect(status().isAccepted());
        EmailSubscriber s = repository.findByEmailIgnoreCase("flow@example.com").orElseThrow();

        mockMvc
            .perform(post("/api/newsletter/confirm").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + s.getConfirmToken() + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.confirmed").value(true));
        assertThat(repository.findByEmailIgnoreCase("flow@example.com").orElseThrow().getStatus()).isEqualTo(SubscriberStatus.CONFIRMED);

        mockMvc
            .perform(post("/api/newsletter/unsubscribe").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"" + s.getUnsubscribeToken() + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.unsubscribed").value(true));
        assertThat(repository.findByEmailIgnoreCase("flow@example.com").orElseThrow().getStatus()).isEqualTo(SubscriberStatus.UNSUBSCRIBED);
    }

    @Test
    void confirmBadTokenIs400() throws Exception {
        mockMvc
            .perform(post("/api/newsletter/confirm").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"bogus\"}"))
            .andExpect(status().isBadRequest());
    }
}
