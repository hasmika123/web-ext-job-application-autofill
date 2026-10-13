package com.dossier.api.web.rest.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.web.rest.org.OrgFixtures;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import java.time.Instant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

/**
 * X1.1 through the real filter chain: with {@code flag.enterprise} off (the shipped default) the enterprise surface is a
 * generic 404 BEFORE authentication, and everything that existed before Enterprise V2 answers exactly as it did. With the
 * flag on the filter steps aside (the request then meets the normal security rules).
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class EnterpriseEnabledFilterIT {

    private static final String WHO = "ent-flag-it";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private AppSettingRepository rows;

    @Autowired
    private ResumeBuilderSettings cache;

    @Autowired
    private UserRepository users;

    @Autowired
    private OrganizationRepository orgs;

    @Autowired
    private OrgMemberRepository members;

    @BeforeEach
    @AfterEach
    void clean() {
        for (AppSetting s : rows.findAll()) if (WHO.equals(s.getUpdatedBy())) rows.delete(s);
        cache.invalidate();
    }

    private void master(String json) {
        rows.save(new AppSetting(EnterpriseSettingKeys.FLAG_ENTERPRISE, json, WHO, Instant.now()));
        cache.invalidate();
    }

    private void assertGeneric404(MvcResult r, String what) throws Exception {
        String body = r.getResponse().getContentAsString();
        assertThat(r.getResponse().getStatus()).as(what + " -> " + body).isEqualTo(404);
        assertThat(r.getResponse().getContentType()).startsWith("application/problem+json");
        assertThat(body).contains("\"code\":\"NOT_FOUND\"").contains("\"message\":\"error.org\"").doesNotContain("forbidden").doesNotContain("flag");
    }

    @Test
    void withTheFlagOffTheEnterpriseSurfaceIsA404BeforeAuthentication() throws Exception {
        for (String uri : new String[] { "/api/public/tenant", "/api/ent/anything", "/api/orgs/1/enterprise/roles", "/api/ent;x=1/anything", "/api//ent/anything", "/api/./ent/x" }) {
            assertGeneric404(mockMvc.perform(get(uri)).andReturn(), "anonymous " + uri);
            assertGeneric404(mockMvc.perform(get(uri).with(user("somebody"))).andReturn(), "signed-in " + uri);
        }
    }

    @Test
    void aFlagThatIsOnlyAnAllowListWithOnFalseStaysOff() throws Exception {
        master("{\"on\":false,\"allow\":[1]}");
        assertGeneric404(mockMvc.perform(get("/api/ent/anything")).andReturn(), "master kill switch");
    }

    @Test
    void withTheFlagOnTheFilterStepsAsideAndNormalSecurityApplies() throws Exception {
        master("{\"on\":true}");
        mockMvc.perform(get("/api/ent/anything")).andExpect(status().isUnauthorized()); // not the filter's 404: security answers
    }

    @Test
    void withTheFlagOffEverythingThatExistedBeforeBehavesAsBefore() throws Exception {
        // public switches: same body, same status
        mockMvc.perform(get("/api/config/public")).andExpect(status().isOk()).andExpect(jsonPath("$.orgs").exists()).andExpect(jsonPath("$.demo").exists());
        // the org API (its own flag is on in tests) is untouched by the enterprise wall
        new OrgFixtures(users, orgs, members).user("personal-user");
        mockMvc.perform(get("/api/orgs/mine").with(user("personal-user"))).andExpect(status().isOk());
        // an org route that is not under /enterprise keeps its generic org 404 for a stranger, and an unauthenticated 401
        mockMvc.perform(get("/api/orgs/999999")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/orgs/999999").with(user("personal-user"))).andExpect(status().isNotFound());
        // an unrelated authenticated personal route still answers
        mockMvc.perform(get("/api/ent-nothing")).andExpect(status().isUnauthorized()); // prefix look-alike is not the enterprise path
    }
}
