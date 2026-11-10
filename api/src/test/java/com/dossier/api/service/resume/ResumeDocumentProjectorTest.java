package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentProjectorTest {

    @ParameterizedTest
    @ValueSource(strings = { "full", "sparse", "full-v2" })
    void matchesGoldenFile(String name) {
        JsonNode doc = Fixtures.doc(name + ".json");
        assertThat(ResumeDocumentProjector.toStructuredPretty(doc)).isEqualTo(Fixtures.text(name + ".structured.json"));
    }

    @Test
    void v2ContentOutsideTheSixSlotsAndAllFormattingNeverReachesTheProjection() {
        JsonNode doc = Fixtures.doc("full-v2.json");
        String projected = ResumeDocumentProjector.toStructuredJson(doc);
        assertThat(projected).doesNotContain("Chess").doesNotContain("Trail").doesNotContain("resume-photos");

        // strip every mark, list setting and the photo: a formatting-only change must not move parsed_json
        com.fasterxml.jackson.databind.node.ObjectNode plain = (com.fasterxml.jackson.databind.node.ObjectNode) doc.deepCopy();
        stripFormatting(plain);
        assertThat(ResumeDocumentProjector.toStructuredJson(plain)).isEqualTo(projected);
    }

    @Test
    void aListSummaryProjectsAsItsTrimmedNonEmptyLines() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"  one \\n\\n  two\\r\\n \\nthree  \",\"list\":\"number\"}]}]}"
        );
        assertThat(ResumeDocumentProjector.toStructured(doc).get("summary").textValue()).isEqualTo("one\ntwo\nthree");
        JsonNode plain = ResumeDocument.parse("{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"  one \\n\\n  two  \"}]}]}");
        assertThat(ResumeDocumentProjector.toStructured(plain).get("summary").textValue()).isEqualTo("one \n\n  two");
    }

    private static void stripFormatting(JsonNode n) {
        if (n.isObject()) {
            com.fasterxml.jackson.databind.node.ObjectNode o = (com.fasterxml.jackson.databind.node.ObjectNode) n;
            o.remove("marks");
            o.remove("list");
            o.remove("listStyle");
            o.remove("photo");
            o.elements().forEachRemaining(ResumeDocumentProjectorTest::stripFormatting);
        } else if (n.isArray()) {
            n.elements().forEachRemaining(ResumeDocumentProjectorTest::stripFormatting);
        }
    }

    @Test
    void compactFormIsWhatParsedJsonStoresAndRoundTripsToTheGolden() {
        JsonNode doc = Fixtures.doc("full.json");
        String compact = ResumeDocumentProjector.toStructuredJson(doc);
        assertThat(compact).doesNotContain("\n").startsWith("{\"summary\":\"Results-driven");
        assertThat(ResumeDocumentJson.write(ResumeDocument.parse(compact), 2) + "\n")
            .isEqualTo(Fixtures.text("full.structured.json"));
    }

    @Test
    void topLevelKeyOrderMatchesTheExtensionsEmptyResume() {
        JsonNode out = ResumeDocumentProjector.toStructured(Fixtures.doc("sparse.json"));
        assertThat(out.fieldNames()).toIterable().containsExactly(
            "summary", "skills", "experience", "education", "languages", "projects"
        );
    }

    @Test
    void currentWinsOverEnd() {
        JsonNode out = ResumeDocumentProjector.toStructured(Fixtures.doc("full.json"));
        JsonNode first = out.get("experience").get(0);
        assertThat(first.get("current").booleanValue()).isTrue();
        assertThat(first.get("endDate").textValue()).isEmpty();
    }

    @Test
    void hiddenSectionsAndItemsNeverAppear() {
        String json = ResumeDocumentProjector.toStructuredJson(Fixtures.doc("full.json"));
        assertThat(json).doesNotContain("Initech").doesNotContain("COBOL").doesNotContain("hidden alternative");
        assertThat(json).doesNotContain("Solutions Architect").doesNotContain("Code.org").doesNotContain("hackathon");
    }

    @Test
    void toleratesGarbageWithoutThrowing() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[null,5,{\"kind\":\"EXPERIENCE\",\"items\":[7,{\"title\":3,\"org\":\"Org\",\"bullets\":\"no\"}]}]}"
        );
        assertThat(ResumeDocumentProjector.toStructuredJson(doc)).isEqualTo(
            "{\"summary\":\"\",\"skills\":[],\"experience\":[{\"company\":\"Org\",\"title\":\"\",\"location\":\"\","
                + "\"startDate\":\"\",\"endDate\":\"\",\"current\":false,\"bullets\":[]}],"
                + "\"education\":[],\"languages\":[],\"projects\":[]}"
        );
    }

    @Test
    void emptyDocumentProjectsToAllSixKeys() {
        assertThat(ResumeDocumentProjector.toStructuredJson(ResumeDocument.parse("{}"))).isEqualTo(
            "{\"summary\":\"\",\"skills\":[],\"experience\":[],\"education\":[],\"languages\":[],\"projects\":[]}"
        );
    }

    @Test
    void firstVisibleNonEmptySummaryWins() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"  \"},{\"text\":\" hi  \",\"hidden\":true},{\"text\":\" yes \"}]}]}"
        );
        assertThat(ResumeDocumentProjector.toStructured(doc).get("summary").textValue()).isEqualTo("yes");
    }
}
