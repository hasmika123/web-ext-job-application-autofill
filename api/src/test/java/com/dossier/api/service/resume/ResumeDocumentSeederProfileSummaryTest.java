package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

/** {@link ResumeDocumentSeeder#seedFromProfile}: a resume made from the profile carries the profile's summary. */
class ResumeDocumentSeederProfileSummaryTest {

    private static final Instant NOW = Instant.parse("2026-10-17T10:00:00Z");

    private static JsonNode bio(String json) {
        return ResumeDocument.parse(json);
    }

    private static JsonNode section(JsonNode doc, String kind) {
        for (JsonNode s : doc.get("sections")) if (kind.equals(s.get("kind").asText())) return s;
        return null;
    }

    @Test
    void theProfileSummaryBecomesTheLeadingSummarySection() {
        JsonNode doc = ResumeDocumentSeeder.seedFromProfile(
            "My CV",
            null,
            bio("{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"summary\":\"  Backend engineer who ships.  \"}"),
            List.of(),
            NOW
        );
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
        assertThat(doc.at("/sections/0/kind").asText()).isEqualTo("SUMMARY");
        assertThat(doc.at("/sections/0/title").asText()).isEqualTo("Summary");
        assertThat(doc.at("/sections/0/items")).hasSize(1);
        assertThat(doc.at("/sections/0/items/0/text").asText()).isEqualTo("Backend engineer who ships.");
        assertThat(doc.at("/sections/0/items/0/src").asText()).isEqualTo("user");
    }

    @Test
    void noSummarySectionWhenTheProfileHasNone() {
        for (String json : new String[] { "{\"firstName\":\"Ada\"}", "{\"firstName\":\"Ada\",\"summary\":\"\"}", "{\"firstName\":\"Ada\",\"summary\":\"   \"}" }) {
            JsonNode doc = ResumeDocumentSeeder.seedFromProfile("CV", null, bio(json), List.of(), NOW);
            assertThat(section(doc, "SUMMARY")).as(json).isNull();
        }
        assertThat(section(ResumeDocumentSeeder.seedFromProfile("CV", null, null, List.of(), NOW), "SUMMARY")).isNull();
    }

    @Test
    void anOverlongSummaryIsClippedToTheValidatorLimit() {
        String huge = "x".repeat(ResumeDocumentValidator.MAX_SUMMARY + 500);
        JsonNode doc = ResumeDocumentSeeder.seedFromProfile("CV", null, bio("{\"firstName\":\"Ada\",\"summary\":\"" + huge + "\"}"), List.of(), NOW);
        assertThat(doc.at("/sections/0/items/0/text").asText()).hasSize(ResumeDocumentValidator.MAX_SUMMARY);
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }

    @Test
    void aScratchResumeStaysABareHeader() {
        JsonNode doc = ResumeDocumentSeeder.seed("CV", null, bio("{\"firstName\":\"Ada\",\"summary\":\"Backend engineer.\"}"), List.of(), NOW);
        assertThat(section(doc, "SUMMARY")).isNull();
    }
}
