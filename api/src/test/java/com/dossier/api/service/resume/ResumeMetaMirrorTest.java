package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

class ResumeMetaMirrorTest {

    private final ObjectMapper om = new ObjectMapper();

    private JsonNode json(String s) throws Exception {
        return om.readTree(s);
    }

    @Test
    void overwritesTheTitleAndTargetTheClientSent() throws Exception {
        JsonNode doc = json("{\"meta\":{\"title\":\"Hacked\",\"target\":\"Other\"}}");
        assertThat(ResumeMetaMirror.apply(doc, "Backend resume", "Backend SWE")).isTrue();
        assertThat(doc.at("/meta/title").asText()).isEqualTo("Backend resume");
        assertThat(doc.at("/meta/target").asText()).isEqualTo("Backend SWE");
    }

    @Test
    void removesTheTargetWhenTheResumeHasNone() throws Exception {
        JsonNode doc = json("{\"meta\":{\"title\":\"T\",\"target\":\"Other\"}}");
        assertThat(ResumeMetaMirror.apply(doc, "T", null)).isTrue();
        assertThat(doc.at("/meta").has("target")).isFalse();
    }

    @Test
    void reportsNoChangeWhenAlreadyInSync() throws Exception {
        JsonNode doc = json("{\"meta\":{\"title\":\"T\",\"target\":\"X\"}}");
        assertThat(ResumeMetaMirror.apply(doc, "T", "X")).isFalse();
    }

    @Test
    void leavesADocumentWithoutMetaAlone() throws Exception {
        JsonNode doc = json("{\"basics\":{}}");
        assertThat(ResumeMetaMirror.apply(doc, "T", "X")).isFalse();
        assertThat(doc.has("meta")).isFalse();
        assertThat(ResumeMetaMirror.apply(null, "T", "X")).isFalse();
    }
}
