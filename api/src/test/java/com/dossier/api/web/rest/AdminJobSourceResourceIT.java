package com.dossier.api.web.rest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.JobSource;
import com.dossier.api.repository.JobSourceRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.jobs.JobBoardClient;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * The job-board pool's admin API (Phase 13.6a) over HTTP: ADMIN only, adding a board after a live
 * check (stubbed here — tests never call the job boards), refusing repeats, switching boards off.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminJobSourceResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JobSourceRepository sources;

    @MockitoBean
    private JobBoardClient client;

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void usersCantSeeIt() throws Exception {
        mockMvc.perform(get("/api/admin/job-sources")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/job-sources/run")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void listsThePool() throws Exception {
        sources.saveAndFlush(new JobSource("greenhouse", "acme-it", "Acme", JobSource.SEED));
        mockMvc
            .perform(get("/api/admin/job-sources"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nightlyEnabled").value(false)) // off outside prod
            .andExpect(jsonPath("$.running").value(false))
            .andExpect(jsonPath("$.freshPostings").value(0))
            .andExpect(jsonPath("$.sources[?(@.boardToken=='acme-it')].companyName").value("Acme"));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void addsABoardAfterALiveCheckAndRefusesARepeat() throws Exception {
        when(client.fetch(eq("lever"), eq("newco-it"), eq("NewCo"), any())).thenReturn(new JobBoardClient.Result(7, List.of()));
        String body = "{\"ats\":\"lever\",\"boardToken\":\"newco-it\",\"companyName\":\"NewCo\"}";
        mockMvc
            .perform(post("/api/admin/job-sources").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.origin").value("ADMIN"))
            .andExpect(jsonPath("$.lastJobCount").value(7));
        mockMvc
            .perform(post("/api/admin/job-sources").contentType(MediaType.APPLICATION_JSON).content(body))
            .andExpect(status().isConflict());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void aBoardThatDoesntAnswerIsRefused() throws Exception {
        when(client.fetch(any(), any(), any(), any())).thenThrow(new JobBoardClient.BoardException("Board not found (404)", true));
        mockMvc
            .perform(
                post("/api/admin/job-sources")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"ats\":\"ashby\",\"boardToken\":\"typo-it\",\"companyName\":\"Typo\"}")
            )
            .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void switchesABoardOff() throws Exception {
        JobSource s = sources.saveAndFlush(new JobSource("ashby", "offco-it", "OffCo", JobSource.SEED));
        mockMvc
            .perform(put("/api/admin/job-sources/" + s.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"enabled\":false}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(false));
    }
}
