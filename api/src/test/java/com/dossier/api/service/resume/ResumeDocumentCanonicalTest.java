package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentCanonicalTest {

    @ParameterizedTest
    @ValueSource(strings = { "full", "sparse", "full-v2" })
    void hashMatchesTheGoldenValue(String name) {
        // The golden value was computed independently with Node (sorted keys, JSON.stringify, sha256).
        assertThat(ResumeDocumentCanonical.contentHash(Fixtures.doc(name + ".json")))
            .isEqualTo(Fixtures.text(name + ".hash.txt").trim());
    }

    @Test
    void marksAreSortedByStartEndThenTypeAndOnlyUnderTheMarksKey() {
        JsonNode shuffled = ResumeDocument.parse(
            "{\"marks\":[{\"t\":\"u\",\"e\":9,\"s\":4},{\"s\":0,\"e\":5,\"t\":\"i\"},{\"s\":0,\"e\":5,\"t\":\"b\"},{\"s\":0,\"e\":2,\"t\":\"u\"}],\"other\":[3,1,2]}"
        );
        assertThat(ResumeDocumentCanonical.canonicalJson(shuffled)).isEqualTo(
            "{\"marks\":[{\"e\":2,\"s\":0,\"t\":\"u\"},{\"e\":5,\"s\":0,\"t\":\"b\"},{\"e\":5,\"s\":0,\"t\":\"i\"},{\"e\":9,\"s\":4,\"t\":\"u\"}],\"other\":[3,1,2]}"
        );
        // a "marks" array that is not a well-formed mark list keeps its order
        JsonNode odd = ResumeDocument.parse("{\"marks\":[{\"s\":2,\"e\":3},{\"s\":1,\"e\":2,\"t\":\"b\"}]}");
        assertThat(ResumeDocumentCanonical.canonicalJson(odd)).isEqualTo("{\"marks\":[{\"e\":3,\"s\":2},{\"e\":2,\"s\":1,\"t\":\"b\"}]}");
    }

    @Test
    void theOrderMarksWereAddedInNeverMovesTheHash() {
        JsonNode a = Fixtures.doc("full-v2.json");
        JsonNode b = Fixtures.doc("full-v2.json");
        com.fasterxml.jackson.databind.node.ArrayNode marks = (com.fasterxml.jackson.databind.node.ArrayNode) b.at("/sections/0/items/0/marks");
        java.util.List<JsonNode> reversed = new java.util.ArrayList<>();
        marks.forEach(reversed::add);
        java.util.Collections.reverse(reversed);
        marks.removeAll();
        reversed.forEach(marks::add);
        assertThat(ResumeDocumentJson.write(a, 0)).isNotEqualTo(ResumeDocumentJson.write(b, 0));
        assertThat(ResumeDocumentCanonical.contentHash(b)).isEqualTo(ResumeDocumentCanonical.contentHash(a));
    }

    @Test
    void hashIsStableAcrossKeyOrder() {
        JsonNode a = ResumeDocument.parse("{\"b\":1,\"a\":{\"y\":[1,{\"q\":true,\"p\":null}],\"x\":\"s\"}}");
        JsonNode b = ResumeDocument.parse("{\"a\":{\"x\":\"s\",\"y\":[1,{\"p\":null,\"q\":true}]},\"b\":1}");
        assertThat(ResumeDocumentCanonical.contentHash(a)).isEqualTo(ResumeDocumentCanonical.contentHash(b));
        assertThat(ResumeDocumentCanonical.canonicalJson(a)).isEqualTo("{\"a\":{\"x\":\"s\",\"y\":[1,{\"p\":null,\"q\":true}]},\"b\":1}");
    }

    @Test
    void hashIsStableAcrossSurroundingWhitespaceOfStrings() {
        JsonNode tidy = ResumeDocument.parse("{\"name\":\"Priya\",\"list\":[\"a\",\"b c\"]}");
        JsonNode messy = ResumeDocument.parse("{\"name\":\"  Priya\\n\",\"list\":[\"\\ta \",\" b c  \"]}");
        assertThat(ResumeDocumentCanonical.contentHash(messy)).isEqualTo(ResumeDocumentCanonical.contentHash(tidy));
    }

    @Test
    void internalWhitespaceAndArrayOrderStillMatter() {
        String base = ResumeDocumentCanonical.contentHash(ResumeDocument.parse("{\"t\":\"a b\",\"l\":[1,2]}"));
        assertThat(ResumeDocumentCanonical.contentHash(ResumeDocument.parse("{\"t\":\"a  b\",\"l\":[1,2]}"))).isNotEqualTo(base);
        assertThat(ResumeDocumentCanonical.contentHash(ResumeDocument.parse("{\"t\":\"a b\",\"l\":[2,1]}"))).isNotEqualTo(base);
    }

    @Test
    void contentChangeMovesTheHash() {
        JsonNode doc = Fixtures.doc("full.json");
        String before = ResumeDocumentCanonical.contentHash(doc);
        ((com.fasterxml.jackson.databind.node.ObjectNode) doc.get("basics")).put("name", "Someone Else");
        assertThat(ResumeDocumentCanonical.contentHash(doc)).isNotEqualTo(before);
    }

    @Test
    void canonicalizeDoesNotMutateItsInputAndIsIdempotent() {
        JsonNode doc = Fixtures.doc("full.json");
        String original = ResumeDocumentJson.write(doc, 0);
        JsonNode once = ResumeDocumentCanonical.canonicalize(doc);
        assertThat(ResumeDocumentJson.write(doc, 0)).isEqualTo(original);
        assertThat(ResumeDocumentCanonical.canonicalize(once)).isEqualTo(once);
        assertThat(once.get("basics").get("name").textValue()).isEqualTo("Priya Sharma");
    }

    @Test
    void hashIsLowercaseHexSha256() {
        assertThat(ResumeDocumentCanonical.contentHash(ResumeDocument.parse("{}"))).matches("[0-9a-f]{64}");
        // sha256("{}")
        assertThat(ResumeDocumentCanonical.contentHash(ResumeDocument.parse("{}")))
            .isEqualTo("44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
    }

    @Test
    void writerEscapesLikeJavaScriptJsonStringify() {
        // control chars, quotes, backslash, lowercase hex escapes, lone surrogate, raw non-ASCII / U+2028 / DEL
        String s = "a\"b\\c\n\t\u0001\u001f\uD800 café   \u007f 😀";
        JsonNode node = new com.fasterxml.jackson.databind.node.TextNode(s);
        assertThat(ResumeDocumentJson.write(node, 0)).isEqualTo(
            "\"a\\\"b\\\\c\\n\\t\\u0001\\u001f\\ud800 café   \u007f 😀\""
        );
    }

    @Test
    void prettyFormMatchesJsonStringifyWithTwoSpaces() {
        JsonNode n = ResumeDocument.parse("{\"a\":[],\"b\":{},\"c\":[1,{\"d\":null}],\"e\":false}");
        assertThat(ResumeDocumentJson.write(n, 2)).isEqualTo(
            "{\n  \"a\": [],\n  \"b\": {},\n  \"c\": [\n    1,\n    {\n      \"d\": null\n    }\n  ],\n  \"e\": false\n}"
        );
    }
}
