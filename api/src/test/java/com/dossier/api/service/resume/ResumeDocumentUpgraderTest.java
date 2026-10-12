package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentUpgraderTest {

    private static String canon(JsonNode n) {
        return ResumeDocumentCanonical.canonicalJson(n);
    }

    @Test
    void upgradingTheV1GoldenGivesTheV1UpgradedGoldenByteForByte() {
        JsonNode upgraded = ResumeDocumentUpgrader.upgrade(Fixtures.doc("full.json"));
        assertThat(canon(upgraded)).isEqualTo(canon(Fixtures.doc("full-v1-upgraded.json")));
        assertThat(upgraded.get("schema").intValue()).isEqualTo(2);
        assertThat(upgraded.at("/basics").has("photoKey")).isFalse();
    }

    @Test
    void theUpgradedGoldenIsValidV2() {
        assertThat(ResumeDocumentValidator.validate(Fixtures.doc("full-v1-upgraded.json"))).isEmpty();
        assertThat(ResumeDocumentValidator.validate(ResumeDocumentUpgrader.upgrade(Fixtures.doc("sparse.json")))).isEmpty();
    }

    @Test
    void v1EquivalentContentProjectsAndRendersIdentically() {
        // ProfileVersion hashes parsed_json: an upgrade must never move it, nor the ATS text.
        for (String name : new String[] { "full", "sparse" }) {
            JsonNode v1 = Fixtures.doc(name + ".json");
            JsonNode v2 = ResumeDocumentUpgrader.upgrade(v1);
            assertThat(ResumeDocumentProjector.toStructuredPretty(v2)).isEqualTo(Fixtures.text(name + ".structured.json"));
            assertThat(ResumeDocumentProjector.toStructuredJson(v2)).isEqualTo(ResumeDocumentProjector.toStructuredJson(v1));
            assertThat(ResumeDocumentText.render(v2)).isEqualTo(Fixtures.text(name + ".txt"));
        }
    }

    @Test
    void photoKeyBecomesAPhotoObjectInTheSamePosition() {
        JsonNode v1 = ResumeDocument.parse(
            "{\"schema\":1,\"meta\":{\"title\":\"T\"},\"basics\":{\"name\":\"N\",\"photoKey\":\"resume-photos/1/a.jpg\",\"email\":\"e\"},\"sections\":[]}"
        );
        JsonNode v2 = ResumeDocumentUpgrader.upgrade(v1);
        assertThat(ResumeDocumentJson.write(v2, 0)).isEqualTo(
            "{\"schema\":2,\"meta\":{\"title\":\"T\"},\"basics\":{\"name\":\"N\",\"photo\":{\"key\":\"resume-photos/1/a.jpg\"},\"email\":\"e\"},\"sections\":[]}"
        );
    }

    @ParameterizedTest
    @ValueSource(strings = { "null", "\"\"", "\"   \"", "7", "{\"key\":\"x\"}" })
    void aNullBlankOrNonStringPhotoKeyIsJustDropped(String photoKey) {
        JsonNode v1 = ResumeDocument.parse("{\"schema\":1,\"basics\":{\"name\":\"N\",\"photoKey\":" + photoKey + "},\"sections\":[]}");
        JsonNode v2 = ResumeDocumentUpgrader.upgrade(v1);
        assertThat(v2.get("basics").has("photoKey")).isFalse();
        assertThat(v2.get("basics").has("photo")).isFalse();
    }

    @Test
    void anExistingPhotoWinsOverALeftoverPhotoKey() {
        JsonNode v1 = ResumeDocument.parse("{\"schema\":1,\"basics\":{\"photoKey\":\"a\",\"photo\":{\"key\":\"b\"}}}");
        assertThat(ResumeDocumentJson.write(ResumeDocumentUpgrader.upgrade(v1).get("basics"), 0)).isEqualTo("{\"photo\":{\"key\":\"b\"}}");
    }

    @Test
    void doesNotMutateItsInputAndIsIdempotent() {
        JsonNode v1 = Fixtures.doc("full.json");
        String before = ResumeDocumentJson.write(v1, 0);
        JsonNode once = ResumeDocumentUpgrader.upgrade(v1);
        assertThat(ResumeDocumentJson.write(v1, 0)).isEqualTo(before);
        assertThat(ResumeDocumentUpgrader.upgrade(once)).isEqualTo(once);
        assertThat(once).isNotSameAs(v1);
    }

    @Test
    void v2DocumentsAndUnrecognisedInputPassThroughUnchanged() {
        JsonNode v2 = Fixtures.doc("full-v2.json");
        assertThat(ResumeDocumentUpgrader.upgrade(v2)).isEqualTo(v2);
        JsonNode future = ResumeDocument.parse("{\"schema\":3,\"basics\":{\"photoKey\":\"k\"}}");
        assertThat(ResumeDocumentUpgrader.upgrade(future)).isEqualTo(future);
        assertThat(ResumeDocumentUpgrader.upgrade(ResumeDocument.parse("{\"basics\":{\"photoKey\":\"k\"}}")).get("basics").has("photoKey")).isTrue();
        assertThat(ResumeDocumentUpgrader.upgrade(ResumeDocument.parse("[1]"))).isEqualTo(ResumeDocument.parse("[1]"));
        assertThat(ResumeDocumentUpgrader.upgrade(null)).isNull();
    }

    @Test
    void unknownKeysSurviveTheUpgrade() {
        JsonNode v1 = ResumeDocument.parse("{\"schema\":1,\"future\":{\"x\":1},\"basics\":{\"photoKey\":null,\"nickname\":\"Pri\"},\"sections\":[]}");
        JsonNode v2 = ResumeDocumentUpgrader.upgrade(v1);
        assertThat(v2.at("/future/x").intValue()).isEqualTo(1);
        assertThat(v2.at("/basics/nickname").textValue()).isEqualTo("Pri");
    }
}
