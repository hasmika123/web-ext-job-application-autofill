package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentTextTest {

    @ParameterizedTest
    @ValueSource(strings = { "full", "sparse" })
    void matchesGoldenFile(String name) {
        assertThat(ResumeDocumentText.render(Fixtures.doc(name + ".json"))).isEqualTo(Fixtures.text(name + ".txt"));
    }

    @Test
    void isDeterministic() {
        JsonNode doc = Fixtures.doc("full.json");
        assertThat(ResumeDocumentText.render(doc)).isEqualTo(ResumeDocumentText.render(doc));
    }

    @Test
    void usesOnlyNewlineAndEndsWithExactlyOne() {
        String t = ResumeDocumentText.render(Fixtures.doc("full.json"));
        assertThat(t).doesNotContain("\r").endsWith("\n").doesNotEndWith("\n\n");
        assertThat(t).doesNotContain("\n\n\n");
    }

    @Test
    void emptyDocumentRendersEmptyString() {
        assertThat(ResumeDocumentText.render(ResumeDocument.parse("{}"))).isEmpty();
        assertThat(ResumeDocumentText.render(ResumeDocument.parse("{\"basics\":{},\"sections\":[]}"))).isEmpty();
    }

    @Test
    void customSectionWithoutTitleUsesTheDefaultAndUppercases() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"CUSTOM\",\"items\":[{\"title\":\"Mentor\"}]},"
                + "{\"kind\":\"SKILLS\",\"title\":\"tech stack\",\"items\":[{\"skills\":[\"Go\",\" \",\"Rust\"]}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("ADDITIONAL INFORMATION\nMentor\n\nTECH STACK\nGo, Rust\n");
    }

    @Test
    void currentRoleWithoutStartSaysPresent() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"EXPERIENCE\",\"items\":[{\"title\":\"Dev\",\"current\":true,\"end\":\"2020\"}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("EXPERIENCE\nDev · Present\n");
    }
}
