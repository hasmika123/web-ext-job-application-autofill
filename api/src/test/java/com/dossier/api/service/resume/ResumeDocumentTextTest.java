package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentTextTest {

    @ParameterizedTest
    @ValueSource(strings = { "full", "sparse", "full-v2" })
    void matchesGoldenFile(String name) {
        assertThat(ResumeDocumentText.render(Fixtures.doc(name + ".json"))).isEqualTo(Fixtures.text(name + ".txt"));
    }

    @Test
    void aNumberedListCountsPerListBlockAndRestartsForEachSeparateList() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"a\\n\\nb\\nc\",\"list\":\"number\"}]},"
                + "{\"kind\":\"EXPERIENCE\",\"items\":["
                + "{\"title\":\"A\",\"listStyle\":\"number\",\"bullets\":[{\"text\":\"p\"},{\"text\":\"\"},{\"text\":\"q\"},{\"text\":\"r\"}]},"
                + "{\"title\":\"B\",\"listStyle\":\"number\",\"bullets\":[{\"text\":\"s\"},{\"text\":\"t\"}]},"
                + "{\"title\":\"C\",\"listStyle\":\"bullet\",\"bullets\":[{\"text\":\"u\"},{\"text\":\"v\"}]}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc))
            .isEqualTo("SUMMARY\n1. a\n2. b\n3. c\n\nEXPERIENCE\nA\n1. p\n2. q\n3. r\n\nB\n1. s\n2. t\n\nC\n- u\n- v\n");
    }

    @Test
    void summaryListsAndNumberedBulletsUseTheirPrefixes() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"a\\n\\n  b  \\nc\",\"list\":\"bullet\"}]},"
                + "{\"kind\":\"CUSTOM\",\"title\":\"X\",\"items\":[{\"title\":\"T\",\"listStyle\":\"number\",\"bullets\":[{\"text\":\"p\"},{\"text\":\"q\"}]}]},"
                + "{\"kind\":\"PROJECTS\",\"items\":[{\"title\":\"P\",\"listStyle\":\"bullet\",\"bullets\":[{\"text\":\"r\"}]}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("SUMMARY\n- a\n- b\n- c\n\nX\nT\n1. p\n2. q\n\nPROJECTS\nP\n- r\n");
        JsonNode numbered = ResumeDocument.parse("{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"a\\nb\",\"list\":\"number\"}]}]}");
        assertThat(ResumeDocumentText.render(numbered)).isEqualTo("SUMMARY\n1. a\n2. b\n");
        JsonNode plain = ResumeDocument.parse("{\"sections\":[{\"kind\":\"SUMMARY\",\"items\":[{\"text\":\"a\\nb\"}]}]}");
        assertThat(ResumeDocumentText.render(plain)).isEqualTo("SUMMARY\na b\n");
    }

    @Test
    void aLinkMarkAppendsItsHrefUnlessTheTextAlreadyIsTheUrl() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"EXPERIENCE\",\"items\":[{\"title\":\"T\",\"bullets\":["
                + "{\"text\":\"See my site now\",\"marks\":[{\"s\":4,\"e\":11,\"t\":\"a\",\"href\":\"https://x.dev\"},{\"s\":0,\"e\":3,\"t\":\"b\"}]},"
                + "{\"text\":\"https://x.dev\",\"marks\":[{\"s\":0,\"e\":13,\"t\":\"a\",\"href\":\"https://x.dev\"}]},"
                + "{\"text\":\"bad range\",\"marks\":[{\"s\":2,\"e\":99,\"t\":\"a\",\"href\":\"https://x.dev\"}]}]}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("EXPERIENCE\nT\n- See my site (https://x.dev) now\n- https://x.dev\n- bad range\n");
    }

    @Test
    void linkSuffixesUseRawOffsetsBeforeWhitespaceIsCollapsed() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"ACHIEVEMENTS\",\"items\":[{\"text\":\"  a\\n\\n b  c  \",\"marks\":[{\"s\":2,\"e\":8,\"t\":\"a\",\"href\":\" mailto:z@x.dev \"}]}]}]}"
        );
        // raw[2..8) = "a\n\n b " -> trimmed "a\n\n b" is not the URL -> suffix goes right after index 8
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("ACHIEVEMENTS\n- a b (mailto:z@x.dev) c\n");
    }

    @Test
    void theCapsFixtureRendersTheSameAsTheTypeScriptTwin() {
        String t = ResumeDocumentText.render(Fixtures.doc("caps-doc.json"));
        assertThat(t).contains("SUMMARY\n- Product leader who ships.\n- Obsessed with clarity.");
        assertThat(t).contains("WHERE I'VE WORKED\nGroup Product Manager — Northwind · Remote · 2020-03 – Present");
        assertThat(t).contains("1. Grew revenue 3x after launching the self-serve plan (details in the case study (https://casey.example.com/case-study)).");
        assertThat(t).contains("VOLUNTEERING & IMPACT!");
        assertThat(t).contains("AWARDS\nProduct of the Year — ProductCon · 2023");
        assertThat(t).contains("INTERESTS\nRock climbing, Specialty coffee");
    }

    @Test
    void interestsRenderAsOneCommaLine() {
        JsonNode doc = ResumeDocument.parse(
            "{\"sections\":[{\"kind\":\"INTERESTS\",\"items\":[{\"text\":\" Chess \"},{\"text\":\"\"},{\"text\":\"Open\\n source\"},{\"text\":\"x\",\"hidden\":true}]},"
                + "{\"kind\":\"INTERESTS\",\"hidden\":true,\"items\":[{\"text\":\"never\"}]},{\"kind\":\"INTERESTS\",\"items\":[{\"text\":\"  \"}]}]}"
        );
        assertThat(ResumeDocumentText.render(doc)).isEqualTo("INTERESTS\nChess, Open source\n");
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
