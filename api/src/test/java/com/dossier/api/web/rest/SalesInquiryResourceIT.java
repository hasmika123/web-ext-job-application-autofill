package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.repository.SalesInquiryRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Public "Contact us" submit (Phase 15.6): permitAll, persists a NEW inquiry, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class SalesInquiryResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SalesInquiryRepository repository;

    @Test
    void anonymousCanSubmit() throws Exception {
        long before = repository.countByStatus(InquiryStatus.NEW);
        mockMvc
            .perform(
                post("/api/inquiries")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        "{\"topic\":\"consultancy\",\"name\":\"Dana\",\"email\":\"dana@acme.com\",\"company\":\"Acme\",\"teamSize\":\"11-50\",\"message\":\"Tell me about marketer seats\"}"
                    )
            )
            .andExpect(status().isAccepted());
        assertThat(repository.countByStatus(InquiryStatus.NEW)).isEqualTo(before + 1);
    }

    @Test
    void badEmailIsRejected() throws Exception {
        mockMvc
            .perform(
                post("/api/inquiries").contentType(MediaType.APPLICATION_JSON).content("{\"topic\":\"autopilot\",\"name\":\"Sam\",\"email\":\"nope\"}")
            )
            .andExpect(status().isBadRequest());
    }
}
