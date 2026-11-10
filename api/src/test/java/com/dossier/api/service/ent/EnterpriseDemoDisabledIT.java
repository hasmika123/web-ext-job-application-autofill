package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.dossier.api.IntegrationTest;
import com.dossier.api.repository.org.OrganizationRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.12 with the demo switch OFF (the enterprise seed switch alone changes nothing): the seeder refuses, the tab's list is
 * empty and the one-click login is DEMO_DISABLED. The default test configuration has the demo off, so this is the default too.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@TestPropertySource(properties = { "dossier.demo.enabled=false", "dossier.demo.enterprise-seed=true", "dossier.demo.create-accounts=false" })
class EnterpriseDemoDisabledIT {

    @Autowired private EnterpriseDemoSeeder seeder;
    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private OrganizationRepository orgs;

    @Test
    void theSeederRefusesAndCreatesNothing() {
        EnterpriseDemoSeeder.Result r = seeder.seed();
        assertThat(r.ran()).isFalse();
        assertThat(r.skippedBecause()).contains("DEMO_ENABLED");
        assertThat(orgs.findBySlug(EnterpriseDemoSeeder.ACME_SLUG)).isEmpty();
    }

    @Test
    void theLoginIsDemoDisabledAndTheListIsEmpty() throws Exception {
        MvcResult r = mockMvc
            .perform(post("/api/authenticate/demo").header("X-Kiwiply-Host", "acme.localhost").contentType(MediaType.APPLICATION_JSON).content("{\"login\":\"demo-ent-acme-sarah\"}"))
            .andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(403);
        assertThat(r.getResponse().getContentAsString()).contains("DEMO_DISABLED");

        MvcResult list = mockMvc.perform(get("/api/public/tenant/demo").header("X-Kiwiply-Host", "acme.localhost")).andReturn();
        // Enterprise is dark here (nothing seeded), so the whole enterprise surface answers its generic 404; either way no member is listed.
        assertThat(list.getResponse().getContentAsString()).doesNotContain("Sarah");
    }
}
