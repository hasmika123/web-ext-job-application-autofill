package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.BugReport;
import com.dossier.api.domain.enumeration.BugCategory;
import com.dossier.api.domain.enumeration.BugStatus;
import com.dossier.api.repository.BugReportRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin bug-report triage (Phase 9.A5): ADMIN-gated list/counts/update, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminBugReportResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private BugReportRepository repository;

    private BugReport seed() {
        BugReport b = new BugReport();
        b.setSource("web");
        b.setMessage("Something broke");
        b.setCategory(BugCategory.BUG);
        b.setStatus(BugStatus.NEW);
        b.setCreatedDate(Instant.now());
        return repository.saveAndFlush(b);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/bug-reports")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminListsCountsAndTriages() throws Exception {
        BugReport b = seed();

        mockMvc.perform(get("/api/admin/bug-reports")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        mockMvc.perform(get("/api/admin/bug-reports/counts")).andExpect(status().isOk()).andExpect(jsonPath("$.NEW").isNumber());

        mockMvc
            .perform(
                put("/api/admin/bug-reports/" + b.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"RESOLVED\",\"severity\":\"LOW\",\"adminNotes\":\"dupe\"}")
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("RESOLVED"))
            .andExpect(jsonPath("$.severity").value("LOW"));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void triageRequiresValidStatus() throws Exception {
        BugReport b = seed();
        mockMvc
            .perform(put("/api/admin/bug-reports/" + b.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BOGUS\"}"))
            .andExpect(status().isBadRequest());
    }
}
