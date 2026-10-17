package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeDocService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The API knows the ten gallery ids (docs/resume-builder/templates/TEMPLATES-DESIGN.md section 0), in step with the web
 * registry: the shared {@code template-defaults.json} fixture names the templates the web has registered so far, and
 * the TypeScript test pins its keys to the registry, so the two languages cannot drift.
 */
class KnownTemplateIdsTest {

    private static final ObjectMapper OM = new ObjectMapper();

    @Test
    void knownIdsAreTheTenGalleryIds() {
        assertThat(ResumeDocService.KNOWN_TEMPLATE_IDS)
            .containsExactly("modern", "classic", "compact", "simple", "engineer", "consultant", "scholar", "executive", "statement", "sidebar");
    }

    @Test
    void knownIdsContainEveryFixtureKey() throws Exception {
        JsonNode golden = OM.readTree(Fixtures.text("template-defaults.json"));
        List<String> ids = new ArrayList<>();
        for (Iterator<String> it = golden.fieldNames(); it.hasNext(); ) ids.add(it.next());
        assertThat(ids).isNotEmpty();
        assertThat(ResumeDocService.KNOWN_TEMPLATE_IDS).containsAll(ids);
    }

    @Test
    void builtInDefaultsAreForKnownTemplates() {
        assertThat(ResumeDocService.KNOWN_TEMPLATE_IDS).containsAll(TemplateThemeDefaults.BUILT_IN.keySet());
    }

    @Test
    void enabledPopularAndDefaultSettingsAreKnown() throws Exception {
        for (String key : List.of(ResumeBuilderSettingKeys.TEMPLATES_ENABLED, ResumeBuilderSettingKeys.TEMPLATES_POPULAR)) {
            JsonNode ids = OM.readTree(ResumeBuilderSettingKeys.find(key).defaultValue());
            assertThat(ids.isArray()).isTrue();
            List<String> list = new ArrayList<>();
            ids.forEach(n -> list.add(n.asText()));
            assertThat(ResumeDocService.KNOWN_TEMPLATE_IDS).as(key).containsAll(list);
        }
        String def = ResumeBuilderSettingKeys.find(ResumeBuilderSettingKeys.TEMPLATES_DEFAULT).defaultValue();
        assertThat(ResumeDocService.KNOWN_TEMPLATE_IDS).contains(def);
        JsonNode enabled = OM.readTree(ResumeBuilderSettingKeys.find(ResumeBuilderSettingKeys.TEMPLATES_ENABLED).defaultValue());
        List<String> enabledIds = new ArrayList<>();
        enabled.forEach(n -> enabledIds.add(n.asText()));
        assertThat(enabledIds).as("the default template is enabled by default").contains(def);
    }
}
