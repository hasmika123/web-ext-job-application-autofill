package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TalentDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.dossier.api.service.ent.mkt.opportunities.MktOpportunityDemoSeeder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * "Save for consultant" on the real stack (MySQL via Testcontainers): the migration, the tenant wall, several consultants in one call, the replay, the
 * composite foreign key of the job data ledger, and the admin audit read of what the call wrote. NOT executed on the machine that wrote it (no Docker
 * there): it compiles, run it in CI. Not {@code @Transactional}: the job insert is a transaction of its own ({@code REQUIRES_NEW}) by design, so the test
 * cleans up what it created.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(240)
class FromExtensionIT {

    private static final String MARKETER = "demo-ent-acme-jessica"; // Marketing Specialist: ASSIGNED scope
    private static final String ADMIN = "demo-ent-acme-sarah"; // Org Admin + Marketing Manager: ORG scope
    private static final String BETA_MARKETER = "demo-ent-beta-bea";

    @Autowired private EnterpriseDemoSeeder baseSeeder;
    @Autowired private TalentDemoSeeder talentSeeder;
    @Autowired private MktOpportunityDemoSeeder oppSeeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    private Long acme;
    private Long beta;
    private final List<Long> createdJobs = new ArrayList<>();
    private String link;

    @BeforeEach
    void seed() {
        assertThat(baseSeeder.seed().ran()).isTrue();
        assertThat(talentSeeder.seed().ran()).isTrue();
        oppSeeder.seed();
        acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).map(Organization::getId).orElseThrow();
        beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).map(Organization::getId).orElseThrow();
        link = "https://boards.greenhouse.io/it-" + UUID.randomUUID() + "/jobs/4012345";
    }

    @AfterEach
    void cleanUp() {
        for (Long job : createdJobs) {
            jdbc.update("delete from mkt_opportunity_event where opportunity_id in (select o.id from mkt_opportunity o join requirement_match m on m.org_id = o.org_id and m.id = o.match_id where m.requirement_id = ?)", job);
            jdbc.update("delete from mkt_opportunity where match_id in (select id from requirement_match where requirement_id = ?)", job);
            jdbc.update("delete from requirement_match where requirement_id = ?", job);
            jdbc.update("delete from requirement_skill where requirement_id = ?", job);
            jdbc.update("delete from job_data_event where requirement_id = ?", job);
            jdbc.update("delete from client_requirement where id = ?", job);
        }
        jdbc.update("delete from idempotency_record where org_id in (?, ?)", acme, beta);
        settings.invalidate();
        resolver.invalidate();
    }

    private String body(List<Long> consultantIds) throws Exception {
        return om.writeValueAsString(
            java.util.Map.of(
                "jobUrl", link,
                "title", "Senior Java Engineer",
                "company", "Acme Integration Test Corp",
                "location", "Austin, TX",
                "payLabel", "$70-80/hr",
                "atsPlatform", "greenhouse",
                "externalJobId", UUID.randomUUID().toString().substring(0, 8),
                "keyInfo", "Lead with the payments work.",
                "consultantIds", consultantIds,
                "extensionVersion", "1.4.2"
            )
        );
    }

    private MvcResult save(String login, Long org, String key, String body) throws Exception {
        return mockMvc.perform(
            post("/api/orgs/" + org + "/mkt/opportunities/from-extension").with(user(login)).header("Idempotency-Key", key).contentType(MediaType.APPLICATION_JSON).content(body)
        ).andReturn();
    }

    private JsonNode ok(MvcResult r) throws Exception {
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        JsonNode n = om.readTree(r.getResponse().getContentAsString());
        createdJobs.add(n.path("jobId").asLong());
        return n;
    }

    private List<Long> consultantsOf(String login, Long org) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org + "/mkt/opportunities/options").with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        List<Long> ids = new ArrayList<>();
        for (JsonNode c : om.readTree(r.getResponse().getContentAsString()).path("consultants")) ids.add(c.path("id").asLong());
        return ids;
    }

    @Test
    void theMigrationAddsTheProvenanceColumnsAndTheLedgerWithTheTenantKeys() {
        for (String c : new String[] { "captured_at", "capture_method", "extension_version", "capture_payload_hash", "detail_level", "detail_level_changed_at", "detail_level_changed_by" }) {
            assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = 'client_requirement' and column_name = ?", Long.class, c)).as(c).isEqualTo(1L);
        }
        assertThat(jdbc.queryForObject("select column_default from information_schema.columns where table_schema = database() and table_name = 'client_requirement' and column_name = 'detail_level'", String.class)).isEqualTo("MINIMAL");
        assertThat(jdbc.queryForObject("select count(*) from information_schema.columns where table_schema = database() and table_name = 'job_data_event' and column_name = 'org_id' and is_nullable = 'NO'", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.key_column_usage where table_schema = database() and table_name = 'job_data_event' and referenced_table_name = 'client_requirement' and ordinal_position = 1 and column_name = 'org_id'", Long.class))
            .as("composite tenant FK to client_requirement").isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from information_schema.statistics where table_schema = database() and table_name = 'job_data_event' and index_name like 'ix\\_jde%' and seq_in_index = 1 and column_name <> 'org_id'", Long.class))
            .as("every ledger index starts with org_id").isEqualTo(0L);
    }

    @Test
    void aMarketerOfAnotherOrganizationGetsTheGeneric404AndNothingIsWritten() throws Exception {
        List<Long> consultants = consultantsOf(MARKETER, acme);
        assertThat(consultants).isNotEmpty();
        MvcResult r = save(BETA_MARKETER, acme, UUID.randomUUID().toString(), body(List.of(consultants.get(0))));
        assertThat(r.getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbc.queryForObject("select count(*) from client_requirement where org_id = ? and job_url = ?", Long.class, acme, link)).isZero();
    }

    @Test
    void oneCallAssignsSeveralConsultantsReportsTheOnesOutsideTheScopeAndReplaysOnRetry() throws Exception {
        List<Long> mine = consultantsOf(MARKETER, acme);
        Set<Long> visible = new HashSet<>(mine);
        Long foreign = consultantsOf(ADMIN, acme).stream().filter(id -> !visible.contains(id)).findFirst().orElse(null);
        assertThat(foreign).as("Acme has a consultant that jessica does not market").isNotNull();
        List<Long> ask = new ArrayList<>(mine.subList(0, Math.min(2, mine.size())));
        ask.add(foreign);
        String key = UUID.randomUUID().toString();
        String payload = body(ask);

        MvcResult first = save(MARKETER, acme, key, payload);
        JsonNode out = ok(first);
        assertThat(out.path("existingJob").asBoolean()).isFalse();
        assertThat(out.path("results")).hasSize(ask.size());
        JsonNode last = out.path("results").get(ask.size() - 1);
        assertThat(last.path("consultantId").asLong()).isEqualTo(foreign);
        assertThat(last.path("reason").asText()).isEqualTo("NOT_IN_SCOPE");
        assertThat(last.has("opportunityId")).isFalse();

        // the ledger: one CAPTURED, one ASSIGNED per assigned consultant
        long jobId = out.path("jobId").asLong();
        assertThat(jdbc.queryForObject("select count(*) from job_data_event where org_id = ? and requirement_id = ? and event_type = 'CAPTURED'", Long.class, acme, jobId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from job_data_event where org_id = ? and requirement_id = ? and event_type = 'ASSIGNED'", Long.class, acme, jobId)).isEqualTo((long) ask.size() - 1);
        assertThat(jdbc.queryForObject("select detail_level from client_requirement where id = ?", String.class, jobId)).isEqualTo("MINIMAL");
        assertThat(jdbc.queryForObject("select capture_method from client_requirement where id = ?", String.class, jobId)).isEqualTo("USER_CLICK");

        // a retry with the same key replays the first reply and writes nothing more
        MvcResult retry = save(MARKETER, acme, key, payload);
        assertThat(retry.getResponse().getStatus()).isEqualTo(200);
        assertThat(retry.getResponse().getHeader("Idempotent-Replayed")).isEqualTo("true");
        assertThat(om.readTree(retry.getResponse().getContentAsString())).isEqualTo(om.readTree(first.getResponse().getContentAsString()));
        assertThat(jdbc.queryForObject("select count(*) from job_data_event where org_id = ? and requirement_id = ?", Long.class, acme, jobId)).isEqualTo(1L + ask.size() - 1);

        // the same job again with a new key and the same consultants: existing everywhere, no new ledger rows
        JsonNode again = ok(save(MARKETER, acme, UUID.randomUUID().toString(), payload));
        assertThat(again.path("existingJob").asBoolean()).isTrue();
        assertThat(again.path("jobId").asLong()).isEqualTo(jobId);
        assertThat(again.path("results").get(0).path("existing").asBoolean()).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from job_data_event where org_id = ? and requirement_id = ?", Long.class, acme, jobId)).isEqualTo(1L + ask.size() - 1);
    }

    @Test
    void theLedgerRefusesARowThatNamesAnotherOrganizationsJob() throws Exception {
        List<Long> mine = consultantsOf(MARKETER, acme);
        long jobId = ok(save(MARKETER, acme, UUID.randomUUID().toString(), body(List.of(mine.get(0))))).path("jobId").asLong();
        assertThatThrownBy(() ->
            jdbc.update("insert into job_data_event (org_id, requirement_id, event_type, actor_kind, occurred_at) values (?, ?, 'EDITED', 'MEMBER', now(6))", beta, jobId)
        ).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void anUnknownFieldIsRefusedAndNothingIsStored() throws Exception {
        List<Long> mine = consultantsOf(MARKETER, acme);
        String bad = body(List.of(mine.get(0))).replaceFirst("\\{", "{\"jobDescription\":\"the whole posting\",");
        MvcResult r = save(MARKETER, acme, UUID.randomUUID().toString(), bad);
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(jdbc.queryForObject("select count(*) from client_requirement where org_id = ? and job_url = ?", Long.class, acme, link)).isZero();
    }

    @Test
    void onlyAnOrganizationAdministratorReadsTheJobDataAudit() throws Exception {
        List<Long> mine = consultantsOf(MARKETER, acme);
        long jobId = ok(save(MARKETER, acme, UUID.randomUUID().toString(), body(List.of(mine.get(0))))).path("jobId").asLong();

        MvcResult admin = mockMvc.perform(get("/api/orgs/" + acme + "/audit/job-data?jobId=" + jobId).with(user(ADMIN))).andReturn();
        assertThat(admin.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = om.readTree(admin.getResponse().getContentAsString());
        assertThat(body.path("items").get(0).path("job").path("captureSource").asText()).isEqualTo("EXTENSION");
        assertThat(body.path("items").get(0).path("job").path("extensionVersion").asText()).isEqualTo("1.4.2");
        assertThat(body.path("items").get(0).path("events")).hasSize(2);

        assertThat(mockMvc.perform(get("/api/orgs/" + acme + "/audit/job-data").with(user(MARKETER))).andReturn().getResponse().getStatus()).isEqualTo(404);
        assertThat(mockMvc.perform(get("/api/orgs/" + acme + "/audit/job-data?jobId=" + jobId).with(user(BETA_MARKETER))).andReturn().getResponse().getStatus()).isEqualTo(404);
    }
}
