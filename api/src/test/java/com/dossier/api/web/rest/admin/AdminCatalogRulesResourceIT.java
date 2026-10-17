package com.dossier.api.web.rest.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.security.AuthoritiesConstants;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/** K1.2: the dependency editor (replacement, kinds, cycle refusal, anyOf), presets and volume tiers over HTTP on MySQL. */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username = "boss", authorities = AuthoritiesConstants.ADMIN)
class AdminCatalogRulesResourceIT {

    @Autowired private MockMvc mockMvc;

    private void service(String key) throws Exception {
        mockMvc
            .perform(
                post("/api/admin/catalog/services").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"key\":\"" + key + "\",\"name\":\"" + key + "\",\"usageUnit\":\"operations\",\"defaultAllowance\":10,\"audience\":\"BOTH\",\"consumesAi\":false}")
            )
            .andExpect(status().isCreated());
    }

    private static String deps(String... pairs) {
        StringBuilder sb = new StringBuilder("{\"dependencies\":[");
        for (int i = 0; i < pairs.length; i += 2) {
            if (i > 0) sb.append(',');
            sb.append("{\"requiresFeatureKey\":\"").append(pairs[i]).append("\",\"kind\":\"").append(pairs[i + 1]).append("\"}");
        }
        return sb.append("]}").toString();
    }

    @Test
    void aToBToACycleIsRefusedAndTheStoredGraphIsUnchanged() throws Exception {
        service("dep.a");
        service("dep.b");
        mockMvc.perform(put("/api/admin/catalog/services/dep.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("dep.b", "TECHNICAL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].requiresFeatureKey").value("dep.b"))
            .andExpect(jsonPath("$[0].kind").value("TECHNICAL"));
        mockMvc.perform(put("/api/admin/catalog/services/dep.b/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("dep.a", "COMMERCIAL")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DEPENDENCY_CYCLE"))
            .andExpect(jsonPath("$.cycle.length()").value(3));
        mockMvc.perform(get("/api/admin/catalog/services/dep.b/dependencies")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(put("/api/admin/catalog/services/dep.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("dep.a", "TECHNICAL")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("DEPENDENCY_CYCLE"));
    }

    @Test
    void putIsAFullReplacementAndTheFourKindsAndAnyOfAreAccepted() throws Exception {
        service("rep.a");
        service("rep.b");
        service("rep.c");
        mockMvc.perform(put("/api/admin/catalog/services/rep.a/dependencies").contentType(MediaType.APPLICATION_JSON)
                .content(deps("rep.b", "TECHNICAL", "rep.c", "INTEGRATION", "rep.c", "CONSENT", "any:consumes_ai", "COMMERCIAL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(4));
        mockMvc.perform(put("/api/admin/catalog/services/rep.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("rep.c", "COMMERCIAL")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].requiresFeatureKey").value("rep.c"));
        mockMvc.perform(put("/api/admin/catalog/services/rep.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void unknownKeysKindsAndMisuseOfAnyOfAreRefused() throws Exception {
        service("bad.a");
        mockMvc.perform(put("/api/admin/catalog/services/bad.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("no.such", "TECHNICAL")))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
        service("bad.b");
        mockMvc.perform(put("/api/admin/catalog/services/bad.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("bad.b", "SOMETIMES")))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
        mockMvc.perform(put("/api/admin/catalog/services/bad.a/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps("any:consumes_ai", "TECHNICAL")))
            .andExpect(status().isUnprocessableEntity());
        mockMvc.perform(put("/api/admin/catalog/services/not.there/dependencies").contentType(MediaType.APPLICATION_JSON).content(deps()))
            .andExpect(status().isNotFound());
    }

    @Test
    void presetsCarryNoPriceAndRejectUnknownServices() throws Exception {
        service("pre.a");
        service("pre.b");
        mockMvc.perform(post("/api/admin/catalog/presets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"key\":\"IT_PRESET\",\"name\":\"IT preset\",\"featureKeys\":[\"pre.a\",\"pre.b\"],\"active\":false,\"sortOrder\":3}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.key").value("IT_PRESET"))
            .andExpect(jsonPath("$.featureKeys.length()").value(2))
            .andExpect(jsonPath("$.active").value(false));
        mockMvc.perform(post("/api/admin/catalog/presets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"key\":\"IT_PRESET\",\"name\":\"again\",\"featureKeys\":[\"pre.a\"]}"))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("KEY_EXISTS"));
        mockMvc.perform(post("/api/admin/catalog/presets").contentType(MediaType.APPLICATION_JSON)
                .content("{\"key\":\"IT_BAD\",\"name\":\"bad\",\"featureKeys\":[\"no.such\"]}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
        mockMvc.perform(put("/api/admin/catalog/presets/IT_PRESET").contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"IT preset v2\",\"featureKeys\":[\"pre.b\"],\"active\":true}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("IT preset v2"))
            .andExpect(jsonPath("$.active").value(true))
            .andExpect(jsonPath("$.featureKeys.length()").value(1));
        mockMvc.perform(get("/api/admin/catalog/presets")).andExpect(status().isOk());
    }

    @Test
    void volumeTiersShipEmptyAndRefuseOverlappingActiveWindows() throws Exception {
        mockMvc.perform(get("/api/admin/catalog/volume-tiers")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(post("/api/admin/catalog/volume-tiers").contentType(MediaType.APPLICATION_JSON)
                .content("{\"minLicensedConsultants\":10,\"pctOffBp\":500,\"effectiveFrom\":\"2026-01-01T00:00:00Z\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.pctOffBp").value(500));
        mockMvc.perform(post("/api/admin/catalog/volume-tiers").contentType(MediaType.APPLICATION_JSON)
                .content("{\"minLicensedConsultants\":10,\"pctOffBp\":700,\"effectiveFrom\":\"2026-06-01T00:00:00Z\"}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("TIER_OVERLAP"));
        mockMvc.perform(post("/api/admin/catalog/volume-tiers").contentType(MediaType.APPLICATION_JSON)
                .content("{\"minLicensedConsultants\":25,\"pctOffBp\":900}"))
            .andExpect(status().isCreated());
        mockMvc.perform(post("/api/admin/catalog/volume-tiers").contentType(MediaType.APPLICATION_JSON)
                .content("{\"minLicensedConsultants\":10,\"pctOffBp\":9000}"))
            .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("INVALID_VALUE"));
    }
}
