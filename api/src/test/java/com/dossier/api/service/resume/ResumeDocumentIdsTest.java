package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** {@link ResumeDocumentIds}: a copy shares no id with its source and changes nothing else (R2.6). */
class ResumeDocumentIdsTest {

    private static final java.util.regex.Pattern ID = java.util.regex.Pattern.compile("[a-z]_[A-Za-z0-9]{6,12}");

    private static void collect(JsonNode n, Set<String> out) {
        if (n.isObject()) {
            n.fields().forEachRemaining(e -> {
                if ("id".equals(e.getKey()) && e.getValue().isTextual()) out.add(e.getValue().textValue());
                else collect(e.getValue(), out);
            });
        } else if (n.isArray()) {
            n.forEach(c -> collect(c, out));
        }
    }

    @Test
    void everySectionItemAndBulletIdIsReplaced() {
        JsonNode source = Fixtures.doc("full-v2.json");
        Set<String> before = new HashSet<>();
        collect(source, before);
        assertThat(before).isNotEmpty();

        JsonNode copy = ResumeDocumentIds.regenerate(source);
        Set<String> after = new HashSet<>();
        collect(copy, after);

        assertThat(after).hasSameSizeAs(before);
        assertThat(after).doesNotContainAnyElementsOf(before);
        assertThat(after).allSatisfy(id -> assertThat(ID.matcher(id).matches()).as(id).isTrue());
    }

    @Test
    void thePrefixIsKeptAndTheCopyStillValidates() {
        JsonNode source = Fixtures.doc("full-v2.json");
        JsonNode copy = ResumeDocumentIds.regenerate(source);
        for (int i = 0; i < source.path("sections").size(); i++) {
            assertThat(copy.at("/sections/" + i + "/id").asText()).startsWith("s_");
            assertThat(copy.at("/sections/" + i + "/kind").asText()).isEqualTo(source.at("/sections/" + i + "/kind").asText());
        }
        assertThat(ResumeDocumentValidator.validate(copy, ResumeDocumentValidator.Options.DEFAULTS.withAllowTailoredFrom(true).withPhotoKeyPrefix("resume-photos/42/"))).isEmpty();
    }

    @Test
    void nothingButIdsChanges() {
        JsonNode source = Fixtures.doc("full-v2.json");
        JsonNode copy = ResumeDocumentIds.regenerate(source);
        // The profile link and every text survive; only ids differ, so masking them out makes the two equal.
        assertThat(strip(copy)).isEqualTo(strip(source));
        assertThat(source).as("the source is not mutated").isEqualTo(Fixtures.doc("full-v2.json"));
    }

    private static String strip(JsonNode doc) {
        return doc.toString().replaceAll("\"id\":\"[a-z]_[A-Za-z0-9]{6,12}\"", "\"id\":\"-\"");
    }
}
