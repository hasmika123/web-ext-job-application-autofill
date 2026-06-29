package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.repository.BugReportRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Public bug-report submit (Phase 9.A5): permitAll, persists a NEW report, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class BugReportResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BugReportRepository repository;

    @Test
    void anonymousCanSubmit() throws Exception {
        long before = repository.countByStatus(BugStatus.NEW);
        mockMvc
            .perform(
                post("/api/bug-reports")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"source\":\"web\",\"message\":\"Autofill missed a field\",\"category\":\"BUG\",\"url\":\"https://kiwiply.com\"}")
            )
            .andExpect(status().isAccepted());
        assertThat(repository.countByStatus(BugStatus.NEW)).isEqualTo(before + 1);
    }

    @Test
    void emptyMessageIsRejected() throws Exception {
        mockMvc
            .perform(post("/api/bug-reports").contentType(MediaType.APPLICATION_JSON).content("{\"message\":\"  \"}"))
            .andExpect(status().isBadRequest());
    }
}
