package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Iterator;
import org.junit.jupiter.api.Test;

/** The template-switch rule (R3.4): defaults only for the theme keys the user never touched. */
class TemplateThemeDefaultsTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(String s) throws Exception {
        return OM.readTree(s);
    }

    @Test
    void defaultsApplyToUntouchedKeysAndKeepTouchedOnes() throws Exception {
        JsonNode current = json("{\"accent\":\"#2563eb\",\"fontPair\":\"inter\",\"spacing\":\"normal\",\"_touched\":[\"accent\"]}");
        JsonNode defaults = json("{\"accent\":\"#7c3aed\",\"fontPair\":\"source-serif\",\"spacing\":\"compact\"}");

        ObjectNode next = TemplateThemeDefaults.apply(current, defaults);

        assertThat(next).isNotNull();
        assertThat(next.get("accent").asText()).as("touched: kept").isEqualTo("#2563eb");
        assertThat(next.get("fontPair").asText()).isEqualTo("source-serif");
        assertThat(next.get("spacing").asText()).isEqualTo("compact");
        assertThat(next.get("_touched")).hasSize(1);
    }

    @Test
    void aMissingThemeTakesTheDefaultsAndNothingChangesWhenNothingDiffers() throws Exception {
        JsonNode defaults = json("{\"accent\":\"#16a34a\"}");
        assertThat(TemplateThemeDefaults.apply(null, defaults).get("accent").asText()).isEqualTo("#16a34a");
        assertThat(TemplateThemeDefaults.apply(json("{\"accent\":\"#16a34a\"}"), defaults)).as("already there").isNull();
        assertThat(TemplateThemeDefaults.apply(json("{\"accent\":\"#2563eb\"}"), json("{}"))).as("no defaults").isNull();
        assertThat(TemplateThemeDefaults.apply(json("{\"accent\":\"#2563eb\"}"), null)).isNull();
    }

    @Test
    void onlyTheUserFacingKeysCanBeDefaulted() throws Exception {
        JsonNode defaults = json("{\"size\":9,\"fit\":{\"target\":1},\"_touched\":[\"accent\"],\"dateStyle\":\"year\"}");
        ObjectNode next = TemplateThemeDefaults.apply(json("{\"accent\":\"#2563eb\"}"), defaults);
        assertThat(next).isNotNull();
        assertThat(next.has("size")).isFalse();
        assertThat(next.has("fit")).isFalse();
        assertThat(next.has("_touched")).isFalse();
        assertThat(next.get("dateStyle").asText()).isEqualTo("year");
    }

    @Test
    void anUnreadableStoredThemeIsLeftAlone() throws Exception {
        assertThat(TemplateThemeDefaults.apply(json("{\"accent\":\"not-a-colour\"}"), json("{\"fontPair\":\"inter\"}"))).isNull();
    }

    @Test
    void switchingBackToModernRestoresInterAndNormal() throws Exception {
        TemplateThemeDefaults defaults = new TemplateThemeDefaults();
        ObjectNode onConsultant = TemplateThemeDefaults.apply(json("{}"), defaults.defaultsFor("consultant"));
        assertThat(onConsultant).isNotNull();
        assertThat(onConsultant.get("fontPair").asText()).isEqualTo("garamond");
        ObjectNode backOnModern = TemplateThemeDefaults.apply(onConsultant, defaults.defaultsFor("modern"));
        assertThat(backOnModern).as("Modern used to declare nothing and kept Garamond / Compact").isNotNull();
        assertThat(backOnModern.get("fontPair").asText()).isEqualTo("inter");
        assertThat(backOnModern.get("spacing").asText()).isEqualTo("normal");
    }

    @Test
    void builtInDefaultsMatchTheFixtureSharedWithTheTypeScriptRegistry() throws Exception {
        JsonNode golden = OM.readTree(Fixtures.text("template-defaults.json"));
        TemplateThemeDefaults defaults = new TemplateThemeDefaults();
        for (Iterator<String> ids = golden.fieldNames(); ids.hasNext(); ) {
            String id = ids.next();
            assertThat(defaults.defaultsFor(id)).as("defaults of %s", id).isEqualTo(golden.get(id));
        }
        assertThat(TemplateThemeDefaults.BUILT_IN.keySet()).as("a template with defaults must be in the fixture").allMatch(golden::has);
    }
}
