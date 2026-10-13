package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.org.OrgAuditEventRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.ent.EnterpriseDemoSeeder;
import com.dossier.api.service.ent.TenantResolver;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * The dashboard against the real demo organization (X1.12 seeder, X2.4): Acme's admin sees real, non-empty Total Consultants, Active
 * Employees and Recent Activity computed from the seeded seats and audit rows, and the modules that have no tables stay honest.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=true", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
@org.junit.jupiter.api.Timeout(90)
class OrgDashboardDemoSeedIT {

    @Autowired private EnterpriseDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgAuditEventRepository audit;
    @Autowired private ResumeBuilderSettings settings;
    @Autowired private TenantResolver resolver;

    @BeforeEach
    void seed() {
        assertThat(seeder.seed().ran()).isTrue();
    }

    @AfterEach
    void forget() {
        settings.invalidate();
        resolver.invalidate();
    }

    private Map<String, JsonNode> widgets(String login, Organization org) throws Exception {
        MvcResult r = mockMvc.perform(get("/api/orgs/" + org.getId() + "/dashboard").with(user(login))).andReturn();
        assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200);
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (JsonNode w : om.readTree(r.getResponse().getContentAsString()).path("widgets")) out.put(w.path("key").asText(), w);
        return out;
    }

    @Test
    void acmeAdminSeesRealNonEmptyNumbersFromTheSeededRows() throws Exception {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        Map<String, JsonNode> w = widgets("demo-ent-acme-sarah", acme);

        JsonNode consultants = w.get("consultants.total");
        assertThat(consultants.path("state").asText()).isEqualTo("ok");
        assertThat(consultants.path("data").path("value").asLong()).as("Anika and Ben are active consultants").isEqualTo(2);
        assertThat(consultants.path("data").path("counts").path("suspended").asLong()).as("Sam").isEqualTo(1);
        assertThat(consultants.path("data").path("counts").path("invited").asLong()).as("Nina").isEqualTo(1);

        JsonNode employees = w.get("employees.active");
        assertThat(employees.path("data").path("value").asLong()).as("Sarah, Omar, Hana, Felix, Amara, Tomas, Eve").isEqualTo(7);
        assertThat(employees.path("data").path("sparkline")).hasSize(8);

        JsonNode activity = w.get("activity.recent");
        assertThat(activity.path("state").asText()).isEqualTo("ok");
        JsonNode items = activity.path("data").path("items");
        assertThat(items.size()).isBetween(5, 10);
        assertThat(items.get(0).path("actorName").asText()).as("a person's name, not a login").isNotBlank().doesNotContain("demo-ent");

        for (String notBuilt : new String[] { "applications.active", "interviews.upcoming", "placements", "finance.summary", "team.performance", "pipeline.overview" }) {
            assertThat(w.get(notBuilt).path("reason").asText()).as(notBuilt).isEqualTo("NOT_ENABLED");
            assertThat(w.get(notBuilt).has("data")).as(notBuilt).isFalse();
        }
    }

    @Test
    void aSecondSeedRunAddsNoActivityRows() {
        Organization acme = orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG).orElseThrow();
        long before = audit.countByOrgId(acme.getId());
        assertThat(before).isGreaterThan(4);
        seeder.seed();
        assertThat(audit.countByOrgId(acme.getId())).isEqualTo(before);
    }

    @Test
    void theOtherDemoOrganizationOnlyCountsItsOwnRows() throws Exception {
        Organization beta = orgs.findBySlug(EnterpriseDemoSeeder.BETA_SLUG).orElseThrow();
        Map<String, JsonNode> w = widgets("demo-ent-beta-bea", beta);
        assertThat(w.get("employees.active").path("data").path("value").asLong()).isEqualTo(1);
        assertThat(w.get("consultants.total").path("state").asText()).isEqualTo("empty");
    }
}
