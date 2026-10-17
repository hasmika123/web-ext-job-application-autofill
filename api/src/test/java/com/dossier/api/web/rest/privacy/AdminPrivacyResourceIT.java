package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AdminAuditEvent;
import com.dossier.api.repository.AdminAuditEventRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.time.Instant;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** The admin view of privacy operations: ADMIN only, dry run by default, and a real purge only when asked for. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminPrivacyResourceIT {

    @Autowired private MockMvc mvc;
    @Autowired private AdminAuditEventRepository audit;

    private AdminAuditEvent oldAudit() {
        AdminAuditEvent e = new AdminAuditEvent();
        e.setActorLogin("old-admin");
        e.setAction("TEST");
        e.setCreatedDate(Instant.now().atZone(ZoneOffset.UTC).minusMonths(40).toInstant());
        return audit.saveAndFlush(e);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void anOrdinaryAccountCannotReachAnyOfIt() throws Exception {
        mvc.perform(get("/api/admin/privacy/retention")).andExpect(status().isForbidden());
        mvc.perform(post("/api/admin/privacy/retention/run?dryRun=false")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/privacy/deletion-reports")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/privacy/deletion-requests")).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/privacy/data-map")).andExpect(status().isForbidden());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void theRetentionPageListsEveryJobWithItsWindow() throws Exception {
        mvc
            .perform(get("/api/admin/privacy/retention"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.enabled").value(true))
            .andExpect(jsonPath("$.dryRun").value(false))
            .andExpect(jsonPath("$.jobs.length()").value(5))
            .andExpect(jsonPath("$.jobs[?(@.job=='ADMIN_AUDIT')].window").value(24))
            .andExpect(jsonPath("$.jobs[?(@.job=='AI_CALL')].window").value(13))
            .andExpect(jsonPath("$.jobs[?(@.job=='REFRESH_TOKEN')].unit").value("days"));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void aManualRunIsADryRunUnlessAskedOtherwiseAndEitherWayIsAudited() throws Exception {
        AdminAuditEvent old = oldAudit();

        mvc.perform(post("/api/admin/privacy/retention/run?job=ADMIN_AUDIT")).andExpect(status().isOk()).andExpect(jsonPath("$[0].dryRun").value(true)).andExpect(jsonPath("$[0].deleted").value(0));
        assertThat(audit.existsById(old.getId())).as("a dry run deletes nothing").isTrue();

        mvc.perform(post("/api/admin/privacy/retention/run?job=ADMIN_AUDIT&dryRun=false")).andExpect(status().isOk()).andExpect(jsonPath("$[0].dryRun").value(false));
        assertThat(audit.existsById(old.getId())).isFalse();

        mvc.perform(get("/api/admin/privacy/retention/runs?job=ADMIN_AUDIT")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2))).andExpect(jsonPath("$[0].actor").value("boss"));
        assertThat(audit.findAll()).anyMatch(e -> "RETENTION_PURGE".equals(e.getAction()) && "boss".equals(e.getActorLogin()));
        assertThat(audit.findAll()).anyMatch(e -> "RETENTION_DRY_RUN".equals(e.getAction()) && "boss".equals(e.getActorLogin()));

        mvc.perform(post("/api/admin/privacy/retention/run?job=NOPE")).andExpect(status().isNotFound());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void reportsRequestsAndTheDataMapAreReadable() throws Exception {
        mvc.perform(get("/api/admin/privacy/deletion-reports")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/privacy/deletion-requests")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/privacy/data-map")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.table=='jhi_user')].class").value("ACCOUNT_ROOT")).andExpect(jsonPath("$[?(@.table=='bug_report')].retentionJob").value("BUG_REPORT"));
    }
}
