package com.dossier.api.web.rest.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.sub.CatalogChangeRepository;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** K1.1: the admin services API on MySQL: authz, create/update/retire, the refusal codes, and the change + audit rows. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class AdminCatalogServicesResourceIT {

    private static final String BODY = """
        {"key":"%s","name":"Resume tailoring","description":"Tailor a resume to a posting.","usageUnit":"tailorings","defaultAllowance":%s,
         "allowancePeriod":"MONTH","audience":"BOTH","category":"RESUME","aiBudgetCents":125,"consumesAi":true,"entitlementKeys":["ai.server"],"sortOrder":5}
        """;

    @Autowired private MockMvc mockMvc;
    @Autowired private CatalogChangeRepository changes;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private jakarta.persistence.EntityManager em;

    private static String body(String key, String allowance) {
        return BODY.formatted(key, allowance);
    }

    @Test
    @WithMockUser(username = "leak", authorities = AuthoritiesConstants.USER)
    void aNormalUserIsForbidden() throws Exception {
        mockMvc.perform(get("/api/admin/catalog/services")).andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("ai.x", "1"))).andExpect(status().isForbidden());
    }

    @Test
    void anonymousIsRefused() throws Exception {
        mockMvc.perform(get("/api/admin/catalog/services")).andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void createListUpdateAndRetireLeaveChangeAndAuditRows() throws Exception {
        long changesBefore = changes.count();
        long auditBefore = jdbc.queryForObject("select count(*) from admin_audit_event where target_type = 'CATALOG'", Long.class);

        mockMvc
            .perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("ai.resume_tailoring_it", "40")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.key").value("ai.resume_tailoring_it"))
            .andExpect(jsonPath("$.audience").value("BOTH"))
            .andExpect(jsonPath("$.entitlementKeys[0]").value("ai.server"))
            .andExpect(jsonPath("$.active").value(true));

        mockMvc
            .perform(get("/api/admin/catalog/services?audience=INDIVIDUAL&q=resume_tailoring_it"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].defaultAllowance").value(40));

        mockMvc
            .perform(put("/api/admin/catalog/services/ai.resume_tailoring_it").contentType(MediaType.APPLICATION_JSON).content(body("ai.resume_tailoring_it", "60").replace("\"BOTH\"", "\"ORG\"")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.defaultAllowance").value(60))
            .andExpect(jsonPath("$.audience").value("ORG"));

        mockMvc
            .perform(post("/api/admin/catalog/services/ai.resume_tailoring_it/retire").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Replaced by the v2 tailoring service\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.active").value(false));

        em.flush(); // the JDBC reads below must see the JPA writes of this transaction
        assertThat(changes.count() - changesBefore).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where target_type = 'CATALOG'", Long.class) - auditBefore).isEqualTo(3);
        assertThat(jdbc.queryForObject("select count(*) from admin_audit_event where action = 'CATALOG_SERVICE_RETIRE' and details like '%risk=HIGH%'", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select active from feature_definition where feature_key = 'ai.resume_tailoring_it'", Boolean.class)).isFalse();
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void refusalsCarryMachineReadableCodes() throws Exception {
        mockMvc
            .perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("AI.Tailor", "1")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("KEY_FORMAT"));
        mockMvc
            .perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("ai.no_allowance", "null")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("ALLOWANCE_REQUIRED"));
        mockMvc.perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("ai.dup_it", "5"))).andExpect(status().isCreated());
        mockMvc
            .perform(post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON).content(body("ai.dup_it", "5")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("KEY_EXISTS"));
        mockMvc
            .perform(put("/api/admin/catalog/services/ai.dup_it").contentType(MediaType.APPLICATION_JSON).content(body("ai.other_key", "5")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("KEY_IMMUTABLE"));
        mockMvc
            .perform(post("/api/admin/catalog/services/ai.dup_it/retire").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"no\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("REASON_REQUIRED"));
        mockMvc
            .perform(post("/api/admin/catalog/services/not.there/retire").contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Does not exist anyway\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    @WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
    void foundationRowsKeepWorkingWithAudienceOrg() throws Exception {
        jdbc.update(
            "insert into feature_definition (feature_key, name, usage_type, usage_unit, default_allowance, allowance_period, active, sort_order, demo_data, created_at) "
                + "values ('legacy_it_row', 'Legacy', 'AI_FEATURE', 'requests', 10, 'MONTH', true, 0, true, now(6))"
        );
        mockMvc
            .perform(get("/api/admin/catalog/services?q=legacy_it_row"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].audience").value("ORG"))
            .andExpect(jsonPath("$[0].poolMode").value("PER_CONSULTANT"))
            .andExpect(jsonPath("$[0].visibility").value("PUBLIC"))
            .andExpect(jsonPath("$[0].demoData").value(true));
    }
}
