package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.SalesInquiry;
import com.dossier.api.domain.enumeration.InquiryStatus;
import com.dossier.api.repository.SalesInquiryRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** Admin "Contact us" queue (Phase 15.6): ADMIN-gated list/counts/update, on real MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminSalesInquiryResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private SalesInquiryRepository repository;

    private SalesInquiry seed() {
        SalesInquiry s = new SalesInquiry();
        s.setTopic("autopilot");
        s.setName("Sam");
        s.setEmail("sam@x.com");
        s.setStatus(InquiryStatus.NEW);
        s.setCreatedDate(Instant.now());
        return repository.saveAndFlush(s);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/inquiries")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminListsCountsAndUpdates() throws Exception {
        SalesInquiry s = seed();

        mockMvc
            .perform(get("/api/admin/inquiries"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));
        mockMvc.perform(get("/api/admin/inquiries/counts")).andExpect(status().isOk()).andExpect(jsonPath("$.NEW").isNumber());

        mockMvc
            .perform(
                put("/api/admin/inquiries/" + s.getId())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"status\":\"CONTACTED\",\"adminNotes\":\"Call booked\"}")
            )
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("CONTACTED"))
            .andExpect(jsonPath("$.adminNotes").value("Call booked"));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void updateRequiresValidStatus() throws Exception {
        SalesInquiry s = seed();
        mockMvc
            .perform(put("/api/admin/inquiries/" + s.getId()).contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BOGUS\"}"))
            .andExpect(status().isBadRequest());
    }
}
