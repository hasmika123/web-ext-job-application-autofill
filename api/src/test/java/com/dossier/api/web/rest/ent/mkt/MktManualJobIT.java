package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * MKT-40 on the real stack: a Marketing Specialist (who holds opportunities.manage and NOT requirements.manage) adds a job by hand. The job is org-owned with
 * source MANUAL, de-duplicated on a second entry, written to the job data ledger and the audit log, and refused (generic 404) to another organization's
 * marketer. Like {@code FromExtensionIT} it needs Docker (Testcontainers) and cleans up what it creates.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false", "spring.datasource.hikari.maximum-pool-size=4" })
@org.junit.jupiter.api.Timeout(240)
class MktManualJobIT {

    private static final String MARKETER = "demo-ent-acme-jessica";
    private static final String BETA_MARKETER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private org.springframework.transaction.PlatformTransactionManager txManager;

    private Long acme;
    private Long beta;
    private final List<Long> createdJobs = new ArrayList<>();
    private String title;

    @BeforeEach
    @org.junit.jupiter.api.Timeout(240)
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
        title = "Hand entered Platform Engineer " + UUID.randomUUID().toString().substring(0, 8);
    }

    @AfterEach
    void cleanUp() {
        new org.springframework.transaction.support.TransactionTemplate(txManager).executeWithoutResult(status -> {
            for (Long job : createdJobs) {
                jdbc.update("delete from requirement_skill where requirement_id = ?", job);
                jdbc.update("delete from job_data_event where requirement_id = ?", job);
                jdbc.update("delete from client_requirement where id = ?", job);
            }
            jdbc.update("delete from idempotency_record where org_id in (?, ?)", acme, beta);
        });
    }

    private String body() throws Exception {
        return om.writeValueAsString(
            java.util.Map.of("title", title, "company", "Acme Hand Entry Corp", "location", "Austin, TX", "workMode", "HYBRID", "description", "Found on a partner's careers page.", "skills", List.of("Java", "Kubernetes"))
        );
    }

    private MvcResult add(String login, Long org, String key, String body) throws Exception {
        return mockMvc.perform(post("/api/orgs/" + org + "/mkt/opportunities/job").with(user(login)).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    @Test
    void aMarketerAddsAJobByHandWithoutRequirementsManage() throws Exception {
        MvcResult r = add(MARKETER, acme, UUID.randomUUID().toString(), body());
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(201);
        JsonNode n = om.readTree(r.getResponse().getContentAsString());
        long id = n.path("jobId").asLong();
        createdJobs.add(id);
        assertThat(n.path("existingJob").asBoolean()).isFalse();
        assertThat(n.path("source").asText()).isEqualTo("MANUAL");
        assertThat(jdbc.queryForObject("select org_id from client_requirement where id = ?", Long.class, id)).isEqualTo(acme);
        assertThat(jdbc.queryForObject("select source from client_requirement where id = ?", String.class, id)).isEqualTo("MANUAL");
        assertThat(jdbc.queryForObject("select count(*) from job_data_event where requirement_id = ? and event_type = 'CAPTURED' and actor_kind = 'MEMBER'", Integer.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from org_audit_event where org_id = ? and action = 'MARKETER_JOB_CREATE' and target_id = ?", Integer.class, acme, String.valueOf(id))).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from requirement_skill where requirement_id = ?", Integer.class, id)).isEqualTo(2);
    }

    @Test
    void theSameJobEnteredTwiceIsOneJob() throws Exception {
        JsonNode first = om.readTree(add(MARKETER, acme, UUID.randomUUID().toString(), body()).getResponse().getContentAsString());
        createdJobs.add(first.path("jobId").asLong());
        MvcResult again = add(MARKETER, acme, UUID.randomUUID().toString(), body());
        JsonNode second = om.readTree(again.getResponse().getContentAsString());
        assertThat(second.path("jobId").asLong()).isEqualTo(first.path("jobId").asLong());
        assertThat(second.path("existingJob").asBoolean()).isTrue();
    }

    @Test
    void refusalsKeepTheirCodesAndAStrangerGetsTheGeneric404() throws Exception {
        assertThat(add(MARKETER, acme, UUID.randomUUID().toString(), om.writeValueAsString(java.util.Map.of("title", "x", "company", "C", "location", "L", "workMode", "REMOTE", "description", "d"))).getResponse().getStatus()).isEqualTo(400);
        assertThat(add(MARKETER, acme, UUID.randomUUID().toString(), om.writeValueAsString(java.util.Map.of("title", title, "company", "C", "location", "L", "workMode", "REMOTE", "description", "My SSN is 123-45-6789"))).getResponse().getStatus()).isEqualTo(422);
        assertThat(add(MARKETER, acme, UUID.randomUUID().toString(), om.writeValueAsString(java.util.Map.of("title", title, "company", "C", "location", "L", "workMode", "REMOTE", "description", "d", "jobUrl", "http://insecure.example.com/x"))).getResponse().getStatus()).isEqualTo(400);
        assertThat(add(BETA_MARKETER, acme, UUID.randomUUID().toString(), body()).getResponse().getStatus()).isEqualTo(404);
    }
}
