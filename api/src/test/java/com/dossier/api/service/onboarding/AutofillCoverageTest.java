package com.dossier.api.service.onboarding;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.onboarding.AutofillCoverage.Counts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * The honest "~N fields" (ONBOARDING-V2-DESIGN 10): the four shared fixtures
 * ({@code onboarding/coverage-*.json}, byte-identical to the web twin's), the caps, and the guard that the key
 * list is exactly the extension's schema.
 */
class AutofillCoverageTest {

    private final ObjectMapper om = new ObjectMapper();

    private JsonNode fixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/onboarding/coverage-" + name + ".json")) {
            assertThat(in).as("fixture " + name).isNotNull();
            return om.readTree(in);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = { "empty", "contact-only", "full", "student-fresh" })
    void fixtureProducesTheExpectedCount(String name) throws IOException {
        JsonNode f = fixture(name);
        JsonNode c = f.get("counts");
        AutofillCoverage.Result r = AutofillCoverage.compute(f.get("bio"), new Counts(c.get("experience").asInt(), c.get("education").asInt(), c.get("skills").asInt()));

        assertThat(r.fields()).as(name + " fields").isEqualTo(f.at("/expected/fields").asInt());
        Map<String, Integer> expected = new LinkedHashMap<>();
        f.at("/expected/groups").fields().forEachRemaining(e -> expected.put(e.getKey(), e.getValue().asInt()));
        assertThat(r.groups()).as(name + " groups").isEqualTo(expected);
        assertThat(r.groups().values().stream().mapToInt(Integer::intValue).sum()).as("the groups add up to the total").isEqualTo(r.fields());
    }

    @Test
    void fullNameNeedsBothNamesAndTheKeyItselfIsIgnored() throws IOException {
        assertThat(AutofillCoverage.compute(om.readTree("{\"firstName\":\"A\"}"), null).fields()).isEqualTo(1);
        assertThat(AutofillCoverage.compute(om.readTree("{\"firstName\":\"A\",\"lastName\":\"B\"}"), null).fields()).isEqualTo(3);
        assertThat(AutofillCoverage.compute(om.readTree("{\"fullName\":\"A B\"}"), null).fields()).isZero();
    }

    @Test
    void experienceAndEducationCapsAndTheSingleSkillsField() {
        assertThat(AutofillCoverage.compute(null, new Counts(1, 0, 0)).fields()).isEqualTo(5);
        assertThat(AutofillCoverage.compute(null, new Counts(3, 0, 0)).fields()).isEqualTo(15);
        assertThat(AutofillCoverage.compute(null, new Counts(30, 0, 0)).fields()).as("capped at 3 experiences").isEqualTo(15);
        assertThat(AutofillCoverage.compute(null, new Counts(0, 9, 0)).fields()).as("capped at 2 educations").isEqualTo(8);
        assertThat(AutofillCoverage.compute(null, new Counts(0, 0, 40)).fields()).as("skills are one field however many").isEqualTo(1);
        assertThat(AutofillCoverage.compute(null, new Counts(-2, -1, -1)).fields()).isZero();
    }

    @Test
    void theBioSkillsKeyAndSkillItemsAreOneFieldNotTwo() throws IOException {
        assertThat(AutofillCoverage.compute(om.readTree("{\"skills\":\"Java, SQL\"}"), new Counts(0, 0, 5)).fields()).isEqualTo(1);
    }

    @Test
    void nonObjectBioReadsAsEmpty() throws IOException {
        assertThat(AutofillCoverage.compute(om.readTree("[1,2]"), null).fields()).isZero();
        assertThat(AutofillCoverage.compute(null, null).fields()).isZero();
    }

    @Test
    void everySchemaKeyBelongsToExactlyOneGroup() {
        // The group lists partition the 31 keys: a bio with every key set (and no items) counts each key exactly once.
        assertThat(AutofillCoverage.FIELD_KEYS).hasSize(31).doesNotHaveDuplicates();
        var everything = om.createObjectNode();
        for (String k : AutofillCoverage.FIELD_KEYS) everything.put(k, "x");
        assertThat(AutofillCoverage.compute(everything, new Counts(0, 0, 0)).fields()).isEqualTo(31);
    }

    /** The key list is exactly {@code FIELDS} of the extension's schema, so a schema change fails here, not in the user's number. */
    @Test
    void keyListEqualsTheExtensionSchema() throws IOException {
        Path schema = Path.of("..", "job-autofill", "src", "lib", "schema.js");
        if (!Files.exists(schema)) schema = Path.of("job-autofill", "src", "lib", "schema.js");
        String js = Files.readString(schema, StandardCharsets.UTF_8);
        int start = js.indexOf("const FIELDS = {");
        int end = js.indexOf("};", start);
        assertThat(start).as("FIELDS in schema.js").isGreaterThan(0);
        List<String> keys = new ArrayList<>();
        Matcher m = Pattern.compile("^\\s*([A-Za-z0-9]+):\\s*\"([A-Za-z0-9]+)\",?\\s*$", Pattern.MULTILINE).matcher(js.substring(start, end));
        while (m.find()) {
            assertThat(m.group(2)).isEqualTo(m.group(1));
            keys.add(m.group(1));
        }
        assertThat(AutofillCoverage.FIELD_KEYS).containsExactlyElementsOf(keys);
    }
}
