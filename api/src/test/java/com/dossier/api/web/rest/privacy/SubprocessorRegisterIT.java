package com.dossier.api.web.rest.privacy;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.domain.AppSettingHistory;
import com.dossier.api.repository.AppSettingHistoryRepository;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.security.AuthoritiesConstants;
import com.dossier.api.service.ResumeBuilderSettings;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * The subprocessor register (T1.5) end to end: the public page's feed (no sign-in, no DPA status), the admin view (ADMIN only, with the DPA status), and an edit
 * through the settings route taking effect on the next read. Not {@code @Transactional}: the commit is what drops the settings cache.
 */
@IntegrationTest
@AutoConfigureMockMvc
@TestPropertySource(properties = { "spring.datasource.hikari.maximum-pool-size=4" })
class SubprocessorRegisterIT {

    private static final String ADMIN = "subproc-admin";
    private static final RequestPostProcessor ADMIN_USER = user(ADMIN).authorities(new SimpleGrantedAuthority(AuthoritiesConstants.ADMIN));
    private static final RequestPostProcessor NORMAL_USER = user("user").authorities(new SimpleGrantedAuthority(AuthoritiesConstants.USER));

    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper mapper;
    @Autowired private AppSettingRepository rows;
    @Autowired private AppSettingHistoryRepository history;
    @Autowired private ResumeBuilderSettings cache;

    @BeforeEach
    @AfterEach
    void sweep() {
        for (AppSetting s : rows.findAll()) if (ADMIN.equals(s.getUpdatedBy())) rows.delete(s);
        for (AppSettingHistory h : history.findAll()) if (ADMIN.equals(h.getActorLogin())) history.delete(h);
        cache.invalidate();
    }

    private JsonNode publicItems() throws Exception {
        return mapper.readTree(mvc.perform(get("/api/public/legal/subprocessors")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("items");
    }

    @Test
    void thePublicFeedListsTheRealSubprocessorsWithoutSigningInAndWithoutTheDpaStatus() throws Exception {
        JsonNode items = publicItems();
        assertThat(items).hasSize(6);
        List<String> names = new ArrayList<>();
        items.forEach(i -> names.add(i.get("name").asText()));
        assertThat(names)
            .anyMatch(n -> n.contains("Amazon Web Services"))
            .anyMatch(n -> n.equals("Brevo"))
            .anyMatch(n -> n.equals("Stripe"))
            .anyMatch(n -> n.equals("Cloudflare"))
            .anyMatch(n -> n.contains("Gemini"))
            .anyMatch(n -> n.contains("GitHub"));
        for (JsonNode i : items) {
            assertThat(i.get("purpose").asText()).isNotBlank();
            assertThat(i.get("data").asText()).isNotBlank();
            assertThat(i.get("location").asText()).isNotBlank();
            assertThat(i.get("link").asText()).startsWith("https://");
            assertThat(i.has("dpaStatus")).as("the DPA tracker is the admin's own and is not published").isFalse();
        }
    }

    @Test
    void theAdminViewIsAdminOnlyAndCarriesTheDpaStatusAndEveryTwelveSlots() throws Exception {
        mvc.perform(get("/api/admin/privacy/subprocessors")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/privacy/subprocessors").with(NORMAL_USER)).andExpect(status().isForbidden());
        mvc
            .perform(get("/api/admin/privacy/subprocessors").with(ADMIN_USER))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(12))
            .andExpect(jsonPath("$.items[0].slot").value(1))
            .andExpect(jsonPath("$.items[0].key").value("legal.subprocessor.01"))
            .andExpect(jsonPath("$.items[0].dpaStatus").value("To be confirmed"))
            .andExpect(jsonPath("$.items[6].empty").value(true));
    }

    @Test
    void anEditThroughTheSettingsRouteShowsOnThePublicFeedAtOnceAndAnEmptyObjectRemovesAnEntry() throws Exception {
        String entry = "{\"name\":\"Acme Mail\",\"purpose\":\"Sends receipts.\",\"data\":\"E-mail address.\",\"location\":\"Germany\",\"link\":\"https://acme.example/privacy\",\"dpaStatus\":\"Signed 2026-11\"}";
        mvc.perform(put("/api/admin/settings/legal.subprocessor.07").with(ADMIN_USER).contentType(MediaType.APPLICATION_JSON).content("{\"value\":" + entry + "}")).andExpect(status().isOk());
        JsonNode items = publicItems();
        assertThat(items).hasSize(7);
        assertThat(items.get(6).get("name").asText()).isEqualTo("Acme Mail");
        mvc.perform(get("/api/admin/privacy/subprocessors").with(ADMIN_USER)).andExpect(jsonPath("$.items[6].dpaStatus").value("Signed 2026-11"));

        // removing a default entry: an empty object (a reset would only bring the default back)
        mvc.perform(put("/api/admin/settings/legal.subprocessor.03").with(ADMIN_USER).contentType(MediaType.APPLICATION_JSON).content("{\"value\":{}}")).andExpect(status().isOk());
        assertThat(publicItems()).hasSize(6);
        mvc.perform(delete("/api/admin/settings/legal.subprocessor.03").with(ADMIN_USER)).andExpect(status().isOk());
        assertThat(publicItems()).hasSize(7);
    }

    @Test
    void aBadEntryIsRefusedAndNothingIsStored() throws Exception {
        String base = "\"name\":\"Acme\",\"purpose\":\"p\"";
        String[] bad = {
            "{" + base + ",\"link\":\"http://acme.example\"}", // not https
            "{" + base + ",\"link\":\"javascript:alert(1)\"}",
            "{" + base + ",\"extra\":\"x\"}", // unknown field
            "{\"purpose\":\"no name\"}",
            "{" + base + ",\"data\":\"SSN 123-45-6789\"}", // never collected, never stored
            "{" + base + ",\"dpaStatus\":\"" + "x".repeat(101) + "\"}",
            "\"just text\"",
        };
        for (String b : bad) {
            mvc.perform(put("/api/admin/settings/legal.subprocessor.08").with(ADMIN_USER).contentType(MediaType.APPLICATION_JSON).content("{\"value\":" + b + "}")).andExpect(status().isBadRequest());
        }
        assertThat(rows.findById("legal.subprocessor.08")).isEmpty();
        assertThat(publicItems()).hasSize(6);
    }
}
