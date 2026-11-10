package com.dossier.api.web.rest.ent.mkt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.service.ent.mkt.opportunities.FromExtensionWorld;
import com.dossier.api.service.ent.mkt.MktScope;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.ent.EntConflictAdvice;
import com.dossier.api.web.rest.errors.ExceptionTranslator;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** The REST layer of "Save for consultant" over the real service (standalone MockMvc, in-memory repositories): headers, status codes, JSON shape, the 8 KB cap. */
class MktFromExtensionResourceTest {

    static final String URL = "/api/orgs/7/mkt/opportunities/from-extension";
    static final String KEY = "0b9d5c1e-1111-4222-8333-444455556666";
    static final String BODY = "{\"jobUrl\":\"https://boards.greenhouse.io/acme/jobs/4012345\",\"title\":\"Senior Java Engineer\",\"company\":\"Acme Corp\",\"location\":\"Austin, TX\","
        + "\"workMode\":\"HYBRID\",\"payMin\":70,\"payMax\":80,\"payPeriod\":\"HOUR\",\"externalJobId\":\"4012345\",\"atsPlatform\":\"greenhouse\",\"skills\":[\"Java\"],"
        + "\"keyInfo\":\"Strong fit.\",\"priority\":\"HIGH\",\"consultantIds\":[10,11],\"extensionVersion\":\"1.4.2\"}";

    FromExtensionWorld w;
    MockMvc mvc;

    @BeforeEach
    void setup() {
        w = new FromExtensionWorld();
        w.consultant(10);
        w.consultant(11);
        ExceptionTranslator translator = new ExceptionTranslator(new MockEnvironment());
        mvc = MockMvcBuilders.standaloneSetup(new MktFromExtensionResource(w.service)).setControllerAdvice(new EntConflictAdvice(translator), translator).build();
    }

    MockHttpServletRequestBuilder call(String body) {
        return post(URL).contentType(MediaType.APPLICATION_JSON).content(body).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, w.me);
    }

    @Test
    void aSaveAnswers200WithTheContractShape() throws Exception {
        mvc.perform(call(BODY).header("Idempotency-Key", KEY))
            .andExpect(status().isOk())
            .andExpect(header().doesNotExist("Idempotent-Replayed"))
            .andExpect(jsonPath("$.jobId").isNumber())
            .andExpect(jsonPath("$.existingJob").value(false))
            .andExpect(jsonPath("$.results.length()").value(2))
            .andExpect(jsonPath("$.results[0].consultantId").value(10))
            .andExpect(jsonPath("$.results[0].opportunityId").isNumber())
            .andExpect(jsonPath("$.results[0].existing").value(false))
            .andExpect(jsonPath("$.results[0].reason").doesNotExist());
    }

    @Test
    void aRetryWithTheSameKeyIsAReplayWithTheSameBodyAndAHeader() throws Exception {
        String first = mvc.perform(call(BODY).header("Idempotency-Key", KEY)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String second = mvc.perform(call(BODY).header("Idempotency-Key", KEY))
            .andExpect(status().isOk())
            .andExpect(header().string("Idempotent-Replayed", "true"))
            .andReturn().getResponse().getContentAsString();
        assertThat(second).isEqualTo(first);
        assertThat(w.world.jobs).hasSize(1);
    }

    @Test
    void theSameJobWithANewKeyIs200WithExistingTrue() throws Exception {
        mvc.perform(call(BODY).header("Idempotency-Key", KEY)).andExpect(status().isOk());
        mvc.perform(call(BODY).header("Idempotency-Key", "0b9d5c1e-1111-4222-8333-444455557777"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.existingJob").value(true))
            .andExpect(jsonPath("$.results[0].existing").value(true))
            .andExpect(jsonPath("$.results[1].existing").value(true));
    }

    @Test
    void aMissingKeyIs400IdempotencyKeyMissing() throws Exception {
        mvc.perform(call(BODY)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_MISSING"));
        assertThat(w.world.jobs).isEmpty();
    }

    @Test
    void aMalformedKeyIs400() throws Exception {
        mvc.perform(call(BODY).header("Idempotency-Key", "short")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_KEY_INVALID"));
    }

    @Test
    void anUnknownFieldIs400EvenForTheFieldsTheContractForbids() throws Exception {
        for (String extra : new String[] { "\"jobDescription\":\"full text\"", "\"state\":\"APPLIED\"", "\"appliedAt\":\"2026-10-10T00:00:00Z\"", "\"description\":\"x\"", "\"surprise\":1" }) {
            String body = BODY.substring(0, BODY.length() - 1) + "," + extra + "}";
            mvc.perform(call(body).header("Idempotency-Key", KEY))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION"));
        }
        assertThat(w.world.jobs).isEmpty();
        assertThat(w.committed).isEmpty();
    }

    @Test
    void aBodyOverEightKilobytesIs400() throws Exception {
        String big = BODY.substring(0, BODY.length() - 1) + ",\"location2\":\"" + "x".repeat(9000) + "\"}";
        mvc.perform(call(big).header("Idempotency-Key", KEY)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION"));
    }

    @Test
    void aNonHttpsOrIpLinkIs400() throws Exception {
        mvc.perform(call(BODY.replace("https://boards.greenhouse.io", "http://boards.greenhouse.io")).header("Idempotency-Key", KEY)).andExpect(status().isBadRequest());
        mvc.perform(call(BODY.replace("boards.greenhouse.io", "169.254.169.254")).header("Idempotency-Key", KEY)).andExpect(status().isBadRequest());
        mvc.perform(call(BODY.replace("boards.greenhouse.io", "localhost")).header("Idempotency-Key", KEY)).andExpect(status().isBadRequest());
    }

    @Test
    void sensitiveTextIs422() throws Exception {
        mvc.perform(call(BODY.replace("Strong fit.", "SSN 123-45-6789")).header("Idempotency-Key", KEY))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.code").value("SENSITIVE_CONTENT"));
    }

    @Test
    void aClosedExistingJobIs409JobNotOpen() throws Exception {
        mvc.perform(call(BODY).header("Idempotency-Key", KEY)).andExpect(status().isOk());
        w.world.jobs.values().iterator().next().setStatus("CLOSED");
        mvc.perform(call(BODY).header("Idempotency-Key", "0b9d5c1e-1111-4222-8333-444455557777"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("JOB_NOT_OPEN"));
    }

    @Test
    void aConsultantOutOfScopeIsReportedInResultsNotA404() throws Exception {
        w.view = new MktScope.View(7L, 70L, false, Set.of(10L));
        mvc.perform(call(BODY).header("Idempotency-Key", KEY))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.results[0].reason").doesNotExist())
            .andExpect(jsonPath("$.results[1].consultantId").value(11))
            .andExpect(jsonPath("$.results[1].reason").value("NOT_IN_SCOPE"))
            .andExpect(jsonPath("$.results[1].opportunityId").doesNotExist());
    }

    @Test
    void aCallerWithoutThePermissionGetsTheGeneric404() throws Exception {
        org.mockito.Mockito.when(w.scope.resolve(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.eq("opportunities.manage"))).thenThrow(new OrgNotFoundException());
        mvc.perform(call(BODY).header("Idempotency-Key", KEY)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        assertThat(w.world.jobs).isEmpty();
    }

    @Test
    void theRouteIsGuardedByTheOrgPermissionAnnotationAndIsPostOnly() throws Exception {
        java.lang.reflect.Method m = null;
        for (java.lang.reflect.Method c : MktFromExtensionResource.class.getDeclaredMethods()) if (c.getName().equals("fromExtension")) m = c;
        assertThat(m).isNotNull();
        assertThat(m.isAnnotationPresent(OrgPermissionRequired.class)).isTrue();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(URL).requestAttr(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, w.me)).andExpect(status().isMethodNotAllowed());
    }
}
