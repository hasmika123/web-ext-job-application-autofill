package com.dossier.api.web.rest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.FillEvent;
import com.dossier.api.repository.FillEventRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Fill telemetry (Phase 10.1). The tests that matter most are the privacy ones: whatever the
 * client sends, only a known ATS family and clamped counts may reach the database.
 */
@IntegrationTest
@AutoConfigureMockMvc
@Transactional
class FillTelemetryResourceIT {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper om;

    @Autowired
    private FillEventRepository fillEventRepository;

    @BeforeEach
    void clean() {
        fillEventRepository.deleteAllInBatch();
    }

    private Map<String, Object> fill(String id) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", id);
        m.put("ats", "workday");
        m.put("adapter", "workday");
        m.put("fieldsFound", 20);
        m.put("fieldsFilled", 17);
        m.put("fieldsFailed", 2);
        m.put("requiredLeftEmpty", 1);
        m.put("extVersion", "0.56.0");
        return m;
    }

    private int send(Map<String, Object> body) throws Exception {
        return mockMvc
            .perform(post("/api/telemetry/fills").contentType(MediaType.APPLICATION_JSON).content(om.writeValueAsBytes(body)))
            .andReturn()
            .getResponse()
            .getStatus();
    }

    @Test
    void requiresAuthentication() throws Exception {
        assertThat(send(fill(UUID.randomUUID().toString()))).isEqualTo(401);
        assertThat(fillEventRepository.count()).isZero();
    }

    @Test
    @WithMockUser(username = "user")
    void recordsOneFillAsCounts() throws Exception {
        String id = UUID.randomUUID().toString();
        assertThat(send(fill(id))).isEqualTo(204);

        FillEvent e = fillEventRepository.findById(id).orElseThrow();
        assertThat(e.getAts()).isEqualTo("workday");
        assertThat(e.getAdapter()).isEqualTo("workday");
        assertThat(e.getFieldsFound()).isEqualTo(20);
        assertThat(e.getFieldsFilled()).isEqualTo(17);
        assertThat(e.getFieldsFailed()).isEqualTo(2);
        assertThat(e.getRequiredLeftEmpty()).isEqualTo(1);
        assertThat(e.getUserCorrected()).isZero();
        assertThat(e.getExtVersion()).isEqualTo("0.56.0");
    }

    /**
     * The privacy line, enforced server-side: a client that sends a hostname (or anything else
     * outside the vocabulary) gets `other`. A company's careers domain would reveal where the user
     * applied; it must never be stored, even if the extension is buggy or impersonated.
     */
    @Test
    @WithMockUser(username = "user")
    void anythingOutsideTheVocabularyIsStoredAsOther() throws Exception {
        String id = UUID.randomUUID().toString();
        Map<String, Object> body = fill(id);
        body.put("ats", "careers.acme-corp.com");
        body.put("adapter", "<script>");
        body.put("extVersion", "1.0; drop table");
        assertThat(send(body)).isEqualTo(204);

        FillEvent e = fillEventRepository.findById(id).orElseThrow();
        assertThat(e.getAts()).isEqualTo("other");
        assertThat(e.getAdapter()).isEqualTo("other");
        assertThat(e.getExtVersion()).isNull();
    }

    @Test
    @WithMockUser(username = "user")
    void countsAreClamped() throws Exception {
        String id = UUID.randomUUID().toString();
        Map<String, Object> body = fill(id);
        body.put("fieldsFound", 9_999_999);
        body.put("fieldsFilled", 9_999_999);
        body.put("fieldsFailed", -5);
        body.put("requiredLeftEmpty", null);
        assertThat(send(body)).isEqualTo(204);

        FillEvent e = fillEventRepository.findById(id).orElseThrow();
        assertThat(e.getFieldsFound()).isEqualTo(500);
        assertThat(e.getFieldsFilled()).isEqualTo(500);
        assertThat(e.getFieldsFailed()).isZero();
        assertThat(e.getRequiredLeftEmpty()).isZero();
    }

    @Test
    @WithMockUser(username = "user")
    void filledCannotExceedFound() throws Exception {
        String id = UUID.randomUUID().toString();
        Map<String, Object> body = fill(id);
        body.put("fieldsFound", 3);
        body.put("fieldsFilled", 10);
        assertThat(send(body)).isEqualTo(204);
        assertThat(fillEventRepository.findById(id).orElseThrow().getFieldsFilled()).isEqualTo(3);
    }

    @Test
    @WithMockUser(username = "user")
    void aMalformedIdIsRejected() throws Exception {
        assertThat(send(fill("not-a-uuid"))).isEqualTo(400);
        assertThat(fillEventRepository.count()).isZero();
    }

    /** The extension may retry; the first report counts and a repeat changes nothing. */
    @Test
    @WithMockUser(username = "user")
    void aRepeatedIdIsIgnored() throws Exception {
        String id = UUID.randomUUID().toString();
        assertThat(send(fill(id))).isEqualTo(204);
        Map<String, Object> again = fill(id);
        again.put("fieldsFilled", 1);
        assertThat(send(again)).isEqualTo(204);

        assertThat(fillEventRepository.count()).isEqualTo(1);
        assertThat(fillEventRepository.findById(id).orElseThrow().getFieldsFilled()).isEqualTo(17);
    }

    // ---- corrections ------------------------------------------------------------------------

    private int correct(String id) throws Exception {
        return mockMvc.perform(post("/api/telemetry/fills/" + id + "/correction")).andReturn().getResponse().getStatus();
    }

    @Test
    @WithMockUser(username = "user")
    void aCorrectionIsCounted() throws Exception {
        String id = UUID.randomUUID().toString();
        send(fill(id));
        assertThat(correct(id)).isEqualTo(204);
        assertThat(correct(id)).isEqualTo(204);
        assertThat(fillEventRepository.findById(id).orElseThrow().getUserCorrected()).isEqualTo(2);
    }

    /** More corrections than fields filled would be a replayed or broken signal. */
    @Test
    @WithMockUser(username = "user")
    void correctionsNeverExceedFieldsFilled() throws Exception {
        String id = UUID.randomUUID().toString();
        Map<String, Object> body = fill(id);
        body.put("fieldsFilled", 2);
        send(body);
        for (int i = 0; i < 5; i++) correct(id);
        assertThat(fillEventRepository.findById(id).orElseThrow().getUserCorrected()).isEqualTo(2);
    }

    /** A change hours later is the user editing their answer, not correcting our fill. */
    @Test
    @WithMockUser(username = "user")
    void aLateCorrectionIsNotCounted() throws Exception {
        String id = UUID.randomUUID().toString();
        send(fill(id));
        FillEvent e = fillEventRepository.findById(id).orElseThrow();
        e.setCreatedAt(Instant.now().minus(2, ChronoUnit.HOURS));
        fillEventRepository.saveAndFlush(e);

        assertThat(correct(id)).isEqualTo(204);
        assertThat(fillEventRepository.findById(id).orElseThrow().getUserCorrected()).isZero();
    }

    /** Always 204, so the endpoint can't be used to probe which fills exist. */
    @Test
    @WithMockUser(username = "user")
    void anUnknownOrMalformedIdIsAQuietNoOp() throws Exception {
        assertThat(correct(UUID.randomUUID().toString())).isEqualTo(204);
        assertThat(correct("nonsense")).isEqualTo(204);
    }
}
