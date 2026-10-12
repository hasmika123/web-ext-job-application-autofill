package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.AppSetting;
import com.dossier.api.repository.AppSettingRepository;
import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.dto.PublicConfigDTO;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.RecordComponent;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * E2E-O1.9: the public switches endpoint (no auth, cacheable, booleans only) and the org feature flag it reports:
 * the admin setting flips the whole org API to a generic 404, even for a signed-out probe.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class PublicConfigResourceIT {

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper om;
    @Autowired private AppSettingRepository appSettings;
    @Autowired private ResumeBuilderSettings settings;

    @AfterEach
    void forgetTheCache() {
        settings.invalidate(); // the transaction rolls the row back; the 60 s cache must not remember it
    }

    private void storeOrgsFlag(String value) {
        appSettings.saveAndFlush(new AppSetting(ResumeBuilderSettingKeys.FEATURE_ORGS, value, "test", Instant.now()));
        settings.invalidate();
    }

    @Test
    void itNeedsNoAuthIsCacheableAndCarriesExactlyTwoBooleans() throws Exception {
        String body = mockMvc
            .perform(get("/api/config/public"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", containsString("max-age=300")))
            .andExpect(header().string("Cache-Control", containsString("public")))
            .andExpect(jsonPath("$.orgs").value(true)) // the suite's property default is on
            .andExpect(jsonPath("$.demo").value(false))
            .andReturn()
            .getResponse()
            .getContentAsString();

        JsonNode json = om.readTree(body);
        List<String> names = new ArrayList<>();
        for (Iterator<String> it = json.fieldNames(); it.hasNext();) names.add(it.next());
        assertThat(names).containsExactlyInAnyOrder("orgs", "demo");
        json.fields().forEachRemaining(e -> assertThat(e.getValue().isBoolean()).as(e.getKey()).isTrue());
    }

    @Test
    void thePayloadTypeCanOnlyEverHoldBooleans() {
        for (RecordComponent c : PublicConfigDTO.class.getRecordComponents()) {
            assertThat(c.getType()).as(c.getName() + " must be a primitive boolean").isEqualTo(boolean.class);
        }
        assertThat(PublicConfigDTO.class.getRecordComponents()).extracting(RecordComponent::getName).containsExactlyInAnyOrder("orgs", "demo");
    }

    @Test
    void theAdminSettingTurnsTheOrgFlagOffAndOnWithinTheSameRequestCycle() throws Exception {
        storeOrgsFlag("false");
        mockMvc.perform(get("/api/config/public")).andExpect(status().isOk()).andExpect(jsonPath("$.orgs").value(false));

        storeOrgsFlag("true");
        mockMvc.perform(get("/api/config/public")).andExpect(status().isOk()).andExpect(jsonPath("$.orgs").value(true));
    }

    @Test
    void anInvalidStoredValueFallsBackToThePropertyDefault() throws Exception {
        storeOrgsFlag("maybe");
        mockMvc.perform(get("/api/config/public")).andExpect(jsonPath("$.orgs").value(true));
    }

    @Test
    void whileOffEveryOrgPathIsTheSameGeneric404EvenWhenSignedOut() throws Exception {
        storeOrgsFlag("false");

        for (String path : List.of("/api/orgs/mine", "/api/orgs/7", "/api/orgs/7/groups", "/api/join/abc", "/api/me/orgs", "/api/orgs//7")) {
            mockMvc.perform(get(path)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
            mockMvc.perform(get(path).with(user("alice"))).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        }
        mockMvc
            .perform(post("/api/orgs").with(user("alice")).contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"Acme\",\"type\":\"BOOTCAMP\"}"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.code").value("NOT_FOUND"));
    }

    @Test
    void theDarkBodyIsIndistinguishableFromTheBodyOfAnOrgThatDoesNotExist() throws Exception {
        String real = mockMvc.perform(get("/api/orgs/999999").with(user("alice"))).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        storeOrgsFlag("false");
        var darkResponse = mockMvc.perform(get("/api/orgs/999999").with(user("alice"))).andExpect(status().isNotFound()).andReturn().getResponse();

        assertThat(om.readTree(darkResponse.getContentAsString())).as("same fields, same values").isEqualTo(om.readTree(real));
        assertThat(darkResponse.getContentType()).startsWith("application/problem+json");
    }

    @Test
    void whileOnASignedOutCallerGetsTheNormal401NotA404() throws Exception {
        mockMvc.perform(get("/api/orgs/mine")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/orgs/mine").with(user("alice"))).andExpect(status().isOk());
    }
}
