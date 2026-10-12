package com.dossier.api.service.resume;

import static com.dossier.api.service.resume.TemplateCapabilities.ATS_STRICT;
import static com.dossier.api.service.resume.TemplateCapabilities.DESIGN_FREE;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;

class TemplateCapabilitiesTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static TemplateCapabilities with(TemplateCapabilities b, boolean photo, List<String> marks, String custom, int customLimit, int maxSkillGroups) {
        return new TemplateCapabilities(
            b.ats(),
            b.columns(),
            b.sidebarSections(),
            photo,
            b.photoDefault(),
            marks,
            b.lists(),
            b.graphics(),
            b.theme(),
            b.maxPages(),
            b.sections(),
            custom,
            customLimit,
            b.headings(),
            b.dateStyles(),
            maxSkillGroups
        );
    }

    @Test
    void theTwoProfilesMatchTheFixtureSharedWithTheTypeScriptTests() throws Exception {
        JsonNode golden = OM.readTree(Fixtures.text("capabilities.json"));
        assertThat(OM.<JsonNode>valueToTree(ATS_STRICT)).isEqualTo(golden.get("ATS_STRICT"));
        assertThat(OM.<JsonNode>valueToTree(DESIGN_FREE)).isEqualTo(golden.get("DESIGN_FREE"));
    }

    @Test
    void atsStrictIsTheDesignProfile() {
        assertThat(ATS_STRICT.ats()).isTrue();
        assertThat(ATS_STRICT.columns()).isEqualTo(1);
        assertThat(ATS_STRICT.photo()).isFalse();
        assertThat(ATS_STRICT.marks()).containsExactly("b");
        assertThat(ATS_STRICT.lists()).isFalse();
        assertThat(ATS_STRICT.headings()).isEqualTo("standard");
        assertThat(ATS_STRICT.custom()).isEqualTo("limited");
        assertThat(ATS_STRICT.customLimit()).isEqualTo(1);
        assertThat(ATS_STRICT.maxSkillGroups()).isEqualTo(6);
        assertThat(ATS_STRICT.theme().accent()).isFalse();
        assertThat(ATS_STRICT.theme().fontPairs()).containsExactly("inter", "georgia-arial");
        assertThat(ATS_STRICT.sections()).doesNotContain("INTERESTS", "CUSTOM");
    }

    @Test
    void strictnessIsAnOrderWithAtsStrictInsideDesignFree() {
        assertThat(ATS_STRICT.isAtLeastAsStrictAs(ATS_STRICT)).isTrue();
        assertThat(DESIGN_FREE.isAtLeastAsStrictAs(DESIGN_FREE)).isTrue();
        assertThat(ATS_STRICT.isAtLeastAsStrictAs(DESIGN_FREE)).isTrue();
        assertThat(DESIGN_FREE.isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
    }

    @Test
    void anyLooserFieldBreaksStrictness() {
        assertThat(with(ATS_STRICT, true, ATS_STRICT.marks(), ATS_STRICT.custom(), 1, 6).isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
        assertThat(with(ATS_STRICT, false, List.of("b", "i"), ATS_STRICT.custom(), 1, 6).isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
        assertThat(with(ATS_STRICT, false, ATS_STRICT.marks(), "any", 1, 6).isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
        assertThat(with(ATS_STRICT, false, ATS_STRICT.marks(), "limited", 2, 6).isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
        assertThat(with(ATS_STRICT, false, ATS_STRICT.marks(), "limited", 1, 0).isAtLeastAsStrictAs(ATS_STRICT)).isFalse(); // unlimited groups
        assertThat(with(ATS_STRICT, false, ATS_STRICT.marks(), "limited", 1, 7).isAtLeastAsStrictAs(ATS_STRICT)).isFalse();
    }

    @Test
    void tighterFieldsStayInside() {
        assertThat(with(ATS_STRICT, false, List.of(), "none", 0, 3).isAtLeastAsStrictAs(ATS_STRICT)).isTrue();
        assertThat(with(ATS_STRICT, false, List.of("b"), "limited", 1, 6).isAtLeastAsStrictAs(ATS_STRICT)).isTrue();
    }
}
