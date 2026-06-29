package com.dossier.api.web.rest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The admin audit-log read endpoint (Phase 9.A1): ADMIN-only, paginated, and surfaces persisted
 * events. Also exercises the {@code admin_audit_event} migration on a real MySQL container.
 */
@IntegrationTest
@AutoConfigureMockMvc
class AdminAuditResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AdminAuditEventRepository repository;

    private AdminAuditEvent persistedEvent() {
        AdminAuditEvent e = new AdminAuditEvent();
        e.setActorLogin("boss");
        e.setAction(com.dossier.api.service.AdminAuditService.USER_DELETE);
        e.setTargetType(com.dossier.api.service.AdminAuditService.TARGET_USER);
        e.setTargetId("victim");
        e.setReason("cleanup");
        e.setCreatedDate(Instant.now());
        return repository.saveAndFlush(e);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void normalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/audit")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminSeesAuditEvents() throws Exception {
        persistedEvent();
        mockMvc
            .perform(get("/api/admin/audit?sort=createdDate,desc"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.[*].action").value(org.hamcrest.Matchers.hasItem("USER_DELETE")))
            .andExpect(jsonPath("$.[*].actorLogin").value(org.hamcrest.Matchers.hasItem("boss")));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void adminCanFilterByActor() throws Exception {
        persistedEvent();
        mockMvc
            .perform(get("/api/admin/audit?actor=nobody-such"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }
}
