package com.dossier.api.web.rest;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/** X1.13 (E12): the operational endpoints through the real security chain and the public-host guard. */
@IntegrationTest
@AutoConfigureMockMvc
class ManagementSecurityIT {

    private static final String SCRAPE = "test-scrape-token-test-scrape-token-0123"; // src/test/resources/config/application.yml

    @Autowired private MockMvc mockMvc;

    @Test
    void healthIsPublicEvenThroughTheEdge() throws Exception {
        // MockMvc may not mount the actuator (404 either way); what matters is that neither security nor the host guard refuses it
        mockMvc.perform(get("/management/health")).andExpect(status().is(org.hamcrest.Matchers.not(org.hamcrest.Matchers.anyOf(org.hamcrest.Matchers.is(401), org.hamcrest.Matchers.is(403)))));
        mockMvc.perform(get("/management/health").header("X-Forwarded-Host", "api.kiwiply.com"))
            .andExpect(status().is(org.hamcrest.Matchers.not(org.hamcrest.Matchers.anyOf(org.hamcrest.Matchers.is(401), org.hamcrest.Matchers.is(403)))));
    }

    @Test
    void everyApiResponseCarriesTheSafeHeaders() throws Exception {
        for (String path : new String[] { "/management/health", "/api/profile/version", "/api/does-not-exist" }) {
            mockMvc.perform(get(path))
                .andExpect(header().string("Strict-Transport-Security", "max-age=31536000; includeSubDomains"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Referrer-Policy", "no-referrer"))
                .andExpect(header().exists("Content-Security-Policy"))
                .andExpect(header().exists("Permissions-Policy"))
                .andExpect(header().string("X-Frame-Options", "DENY"));
        }
    }

    @Test
    void prometheusNeedsACredential()throws Exception {
        mockMvc.perform(get("/management/prometheus")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/management/prometheus").header("Authorization", "Bearer wrong")).andExpect(status().isUnauthorized());
    }

    @Test
    void prometheusAcceptsTheScrapeTokenOrAnAdmin() throws Exception {
        mockMvc.perform(get("/management/prometheus").header("Authorization", "Bearer " + SCRAPE)).andExpect(status().is(org.hamcrest.Matchers.not(401)));
        mockMvc.perform(get("/management/prometheus").with(user("root").roles("ADMIN"))).andExpect(status().is(org.hamcrest.Matchers.not(401)));
        mockMvc.perform(get("/management/prometheus").with(user("bob").roles("USER"))).andExpect(status().isForbidden());
    }

    @Test
    void scrapeTokenOpensNothingElse() throws Exception {
        mockMvc.perform(get("/management/info").header("Authorization", "Bearer " + SCRAPE)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/admin/users").header("Authorization", "Bearer " + SCRAPE)).andExpect(status().isUnauthorized());
    }

    @Test
    void infoIsAdminOnly() throws Exception {
        mockMvc.perform(get("/management/info")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/management/info").with(user("bob").roles("USER"))).andExpect(status().isForbidden());
    }

    @Test
    void publicHostsGetTheGenericNotFound() throws Exception {
        // even with a valid credential, a request that came through the edge never reaches the endpoint
        mockMvc.perform(get("/management/prometheus").header("X-Forwarded-Host", "api.kiwiply.com").header("Authorization", "Bearer " + SCRAPE))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/management/info").with(user("root").roles("ADMIN")).header("X-Forwarded-Host", "api.kiwiply.com"))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/internal/tenant-hosts/check").header("X-Forwarded-Host", "api.kiwiply.com").header("X-Internal-Token", "test-internal-token"))
            .andExpect(status().isNotFound());
        mockMvc.perform(get("/management/prometheus").with(request -> { request.setServerName("api.kiwiply.com"); return request; }))
            .andExpect(status().isNotFound());
    }

    @Test
    void internalCallersStillWork() throws Exception {
        mockMvc.perform(get("/api/internal/tenant-hosts/check").param("domain", "nobody.example").with(request -> { request.setServerName("api"); return request; }).header("X-Internal-Token", "test-internal-token"))
            .andExpect(status().is(org.hamcrest.Matchers.not(org.hamcrest.Matchers.anyOf(org.hamcrest.Matchers.is(401), org.hamcrest.Matchers.is(403)))));
    }
}
