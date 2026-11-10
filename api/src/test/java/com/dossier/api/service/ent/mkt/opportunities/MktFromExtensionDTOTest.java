package com.dossier.api.service.ent.mkt.opportunities;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.org.OrgException;
import com.dossier.api.service.ent.mkt.opportunities.MktFromExtensionDTO.Request;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The request is a whitelist read with a strict mapper (doc 60 section 4, doc 61 section 8 control 1): anything else is a 400, never ignored. */
class MktFromExtensionDTOTest {

    static final String VALID = "{\"jobUrl\":\"https://example.com/jobs/1\",\"title\":\"Engineer\",\"company\":\"Initech\",\"keyInfo\":\"Note\",\"consultantIds\":[1]";

    static byte[] json(String s) {
        return s.getBytes(StandardCharsets.UTF_8);
    }

    void assert400(String body, String fieldStart) {
        assertThatThrownBy(() -> MktFromExtensionDTO.parse(json(body))).isInstanceOfSatisfying(OrgException.class, e -> {
            assertThat(e.getStatus()).isEqualTo(400);
            assertThat(e.getCode()).isEqualTo("VALIDATION");
            assertThat(e.getMessage()).startsWith(fieldStart);
        });
    }

    @Test
    void aFullBodyReadsIntoTheRecord() {
        Request r = MktFromExtensionDTO.parse(json(VALID + ",\"location\":\"Austin\",\"workMode\":\"REMOTE\",\"payMin\":70,\"payMax\":80,\"payPeriod\":\"HOUR\",\"postedOn\":\"2026-10-10\",\"dueOn\":\"2026-10-20\",\"skills\":[\"Java\"],\"priority\":\"LOW\",\"extensionVersion\":\"1.0.0\"}"));
        assertThat(r.jobUrl()).isEqualTo("https://example.com/jobs/1");
        assertThat(r.payMin()).isEqualTo(70);
        assertThat(r.postedOn()).isEqualTo(LocalDate.parse("2026-10-10"));
        assertThat(r.skills()).containsExactly("Java");
        assertThat(r.consultantIds()).containsExactly(1L);
    }

    @Test
    void theJobDescriptionIsRefusedNotIgnored() {
        assert400(VALID + ",\"jobDescription\":\"The full posting text...\"}", "jobDescription:");
    }

    @Test
    void stateAppliedAtAndDescriptionAreRefused() {
        assert400(VALID + ",\"state\":\"APPLIED\"}", "state:");
        assert400(VALID + ",\"appliedAt\":\"2026-10-10T00:00:00Z\"}", "appliedAt:");
        assert400(VALID + ",\"description\":\"text\"}", "description:");
        assert400(VALID + ",\"status\":\"OPEN\"}", "status:");
        assert400(VALID + ",\"interest\":\"INTERESTED\"}", "interest:");
    }

    @Test
    void aNullDescriptionIsStillAnUnknownField() {
        assert400(VALID + ",\"jobDescription\":null}", "jobDescription:");
    }

    @Test
    void wrongTypesAreRefused() {
        assert400(VALID.replace("\"title\":\"Engineer\"", "\"title\":5") + "}", "body:");
        assert400(VALID + ",\"payMin\":\"70\"}", "body:");
        assert400(VALID + ",\"payMin\":70.5}", "body:");
        assert400(VALID + ",\"postedOn\":\"yesterday\"}", "body:");
        assert400(VALID.replace("[1]", "\"1\"") + "}", "body:");
    }

    @Test
    void notAnObjectOrTrailingContentIsRefused() {
        assert400("[]", "body:");
        assert400("\"x\"", "body:");
        assert400("not json", "body:");
        assert400(VALID + "} {\"a\":1}", "body:");
        assert400("", "body:");
    }

    @Test
    void anEmptyOrMissingBodyIsRefused() {
        assertThatThrownBy(() -> MktFromExtensionDTO.parse(null)).isInstanceOf(OrgException.class);
        assertThatThrownBy(() -> MktFromExtensionDTO.parse(new byte[0])).isInstanceOf(OrgException.class);
    }

    @Test
    void theBodyIsCappedAt8Kilobytes() {
        String ok = VALID + ",\"keyInfo2\":\"\"}";
        assertThat(ok.length()).isLessThan(MktFromExtensionDTO.MAX_BODY_BYTES);
        String pad = "x".repeat(MktFromExtensionDTO.MAX_BODY_BYTES);
        assert400(VALID + ",\"location\":\"" + pad + "\"}", "body:");
        // exactly at the cap is read (and then fails on its own field limits, not on size)
        String at = VALID + ",\"location\":\"";
        String filler = "y".repeat(MktFromExtensionDTO.MAX_BODY_BYTES - at.length() - 2);
        byte[] exactly = json(at + filler + "\"}");
        assertThat(exactly.length).isEqualTo(MktFromExtensionDTO.MAX_BODY_BYTES);
        assertThat(MktFromExtensionDTO.parse(exactly).location()).hasSize(filler.length());
    }

    @Test
    void theWhitelistIsTheContractsNineteenFields() {
        assertThat(MktFromExtensionDTO.FIELDS).hasSize(19).contains("jobUrl", "title", "company", "keyInfo", "consultantIds", "extensionVersion");
    }

    @Test
    void theResultsOmitAReasonThatIsNull() throws Exception {
        String ok = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(new MktFromExtensionDTO.ConsultantResult(1L, 2L, false, null));
        assertThat(ok).isEqualTo("{\"consultantId\":1,\"opportunityId\":2,\"existing\":false}");
        String no = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(new MktFromExtensionDTO.ConsultantResult(1L, null, false, "NOT_IN_SCOPE"));
        assertThat(no).contains("\"reason\":\"NOT_IN_SCOPE\"");
    }

    @Test
    void receivedFieldsListsOnlyWhatWasSent() {
        Request r = MktFromExtensionDTO.parse(json(VALID + "}"));
        assertThat(MktFromExtensionDTO.receivedFields(r).keySet()).containsExactly("jobUrl", "title", "company", "keyInfo", "consultantIds");
        assertThat(List.copyOf(MktFromExtensionDTO.receivedFields(r).values())).doesNotContainNull();
    }
}
