package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Verifies the published OpenAPI contract — the spec a third-party backend implements
 * to be Dossier-compatible. Boots under the {@code api-docs} profile (springdoc is
 * disabled otherwise) and asserts the generated {@code /v3/api-docs} spec covers the
 * auth flow, the user-scoped sync API, the {@code bearer-jwt} security scheme, and the
 * Phase 1.8 tracking fields (so the contract never silently drops them).
 *
 * <p>Also writes a pretty-printed snapshot to {@code api/openapi.json} so the contract
 * is consumable without booting the server or holding ADMIN — that file is the
 * published artifact and should be committed when it changes.
 */
@IntegrationTest
@AutoConfigureMockMvc
@ActiveProfiles("api-docs")
@WithMockUser(authorities = AuthoritiesConstants.ADMIN)
class OpenApiContractIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Test
    void publishesContractCoveringAuthSyncAndTrackingFields() throws Exception {
        MvcResult result = mockMvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andReturn();

        JsonNode spec = om.readTree(result.getResponse().getContentAsString());
        JsonNode paths = spec.path("paths");
        JsonNode schemas = spec.path("components").path("schemas");

        // Publish the snapshot artifact first (working dir is the api module root under
        // Gradle) so it's captured even if an assertion below fails.
        Path out = Path.of("openapi.json");
        Files.writeString(out, om.writerWithDefaultPrettyPrinter().writeValueAsString(spec), StandardCharsets.UTF_8);

        // Dossier identity stamped on the contract (not JHipster's generic default).
        assertThat(spec.path("info").path("title").asText()).as("contract title").isEqualTo("Dossier API");

        // Auth flow.
        assertThat(paths.has("/api/authenticate")).as("authenticate path").isTrue();
        assertThat(paths.path("/api/authenticate").has("post")).as("POST /api/authenticate").isTrue();
        assertThat(paths.has("/api/refresh")).as("refresh path").isTrue();

        // User-scoped sync API.
        assertThat(paths.has("/api/profile")).as("profile path").isTrue();
        assertThat(paths.has("/api/profile/resumes")).as("resumes collection path").isTrue();
        assertThat(paths.has("/api/profile/resumes/{id}")).as("resume item path").isTrue();

        // Security scheme so the contract documents how protected endpoints authenticate.
        JsonNode bearer = spec.path("components").path("securitySchemes").path("bearer-jwt");
        assertThat(bearer.path("scheme").asText()).as("bearer-jwt scheme").isEqualTo("bearer");
        assertThat(paths.path("/api/profile").path("get").has("security")).as("profile GET advertises security").isTrue();

        // Phase 1.8 tracking fields must be in the contract.
        JsonNode appProps = schemas.path("ApplicationDTO").path("properties");
        assertThat(appProps.has("location")).as("ApplicationDTO.location").isTrue();
        assertThat(appProps.has("externalJobId")).as("ApplicationDTO.externalJobId").isTrue();
        assertThat(appProps.has("submissionConfirmed")).as("ApplicationDTO.submissionConfirmed").isTrue();
        assertThat(schemas.path("ResumeDTO").path("properties").has("archived")).as("ResumeDTO.archived").isTrue();

        // ApplicationStatus enum must include the new DRAFT value. springdoc inlines the
        // enum on the property rather than emitting a shared schema, so read it there.
        List<String> statuses = om.convertValue(appProps.path("status").path("enum"), List.class);
        assertThat(statuses).as("ApplicationDTO.status values").contains("DRAFT");
    }
}
