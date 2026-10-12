package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ResumeDocumentValidator.Violation;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.Optional;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;

class ResumeDocumentValidatorTest {

    // ---------------------------------------------------------------- fixtures

    @ParameterizedTest
    @ValueSource(strings = { "full.json", "sparse.json" })
    void validFixturesPass(String name) {
        assertThat(ResumeDocumentValidator.validate(Fixtures.doc(name))).isEmpty();
    }

    static Stream<Arguments> invalidFixtures() {
        return Stream.of(
            Arguments.of("invalid-schema-version.json", "$.schema", "must be 1"),
            Arguments.of("invalid-missing-sections.json", "$.sections", "must be an array"),
            Arguments.of("invalid-unknown-kind.json", "$.sections[1].kind", "unknown section kind 'HOBBIES'"),
            Arguments.of("invalid-duplicate-kind.json", "$.sections[1].kind", "duplicate section kind EXPERIENCE (only CUSTOM may repeat)"),
            Arguments.of("invalid-duplicate-id.json", "$.sections[1].id", "duplicate id 's_experience'"),
            Arguments.of("invalid-bad-id.json", "$.sections[0].items[0].bullets[0].id", "must match [a-z]_[A-Za-z0-9]{6,12}"),
            Arguments.of("invalid-bad-date.json", "$.sections[0].items[0].start", "must be YYYY or YYYY-MM"),
            Arguments.of("invalid-bullet-too-long.json", "$.sections[0].items[0].bullets[0].text", "must be at most 600 characters"),
            Arguments.of("invalid-wrong-type.json", "$.sections[0].items", "must be an array"),
            Arguments.of("invalid-fraction.json", "$.sections[0].items[0].profileItemId", "must be an integer")
        );
    }

    @ParameterizedTest
    @MethodSource("invalidFixtures")
    void invalidFixturesReportTheFirstFailure(String name, String path, String message) {
        Optional<Violation> v = ResumeDocumentValidator.validate(Fixtures.doc(name));
        assertThat(v).isPresent();
        assertThat(v.get().path()).isEqualTo(path);
        assertThat(v.get().message()).isEqualTo(message);
        assertThat(v.get().tooLarge()).isFalse();
    }

    // ---------------------------------------------------------------- builders

    private static ObjectNode base() {
        return (ObjectNode) ResumeDocument.parse(
            "{\"schema\":1,\"meta\":{\"title\":\"T\"},\"basics\":{\"name\":\"N\"},\"sections\":[]}"
        );
    }

    private static ObjectNode section(String id, String kind) {
        ObjectNode s = JsonNodeFactory.instance.objectNode();
        s.putArray("items");
        s.put("id", id);
        s.put("kind", kind);
        return s;
    }

    private static String id(String prefix, int n) {
        return prefix + "_" + String.format("%08d", n);
    }

    private static Optional<Violation> withSection(ObjectNode section) {
        ObjectNode doc = base();
        ((ArrayNode) doc.get("sections")).add(section);
        return ResumeDocumentValidator.validate(doc);
    }

    private static ObjectNode experienceItem(int n, int bullets) {
        ObjectNode item = JsonNodeFactory.instance.objectNode();
        item.put("id", id("i", n));
        item.put("title", "Engineer");
        ArrayNode bs = item.putArray("bullets");
        for (int b = 0; b < bullets; b++) {
            ObjectNode bullet = bs.addObject();
            bullet.put("id", id("b", n * 100 + b));
            bullet.put("text", "did a thing");
        }
        return item;
    }

    // ---------------------------------------------------------------- limits

    @Test
    void itemsPerSectionBoundary() {
        ObjectNode ok = section("s_experience", "EXPERIENCE");
        for (int i = 0; i < ResumeDocumentValidator.MAX_ITEMS; i++) ((ArrayNode) ok.get("items")).add(experienceItem(i, 0));
        assertThat(withSection(ok)).isEmpty();

        ObjectNode over = section("s_experience", "EXPERIENCE");
        for (int i = 0; i <= ResumeDocumentValidator.MAX_ITEMS; i++) ((ArrayNode) over.get("items")).add(experienceItem(i, 0));
        Violation v = withSection(over).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items");
        assertThat(v.message()).isEqualTo("at most 40 items per section");
    }

    @Test
    void bulletsPerItemBoundary() {
        ObjectNode ok = section("s_experience", "EXPERIENCE");
        ((ArrayNode) ok.get("items")).add(experienceItem(1, ResumeDocumentValidator.MAX_BULLETS));
        assertThat(withSection(ok)).isEmpty();

        ObjectNode over = section("s_experience", "EXPERIENCE");
        ((ArrayNode) over.get("items")).add(experienceItem(1, ResumeDocumentValidator.MAX_BULLETS + 1));
        Violation v = withSection(over).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].bullets");
        assertThat(v.message()).isEqualTo("at most 12 bullets per item");
    }

    @Test
    void bulletCharsBoundary() {
        for (int len : new int[] { 600, 601 }) {
            ObjectNode s = section("s_experience", "EXPERIENCE");
            ObjectNode item = experienceItem(1, 1);
            ((ObjectNode) item.get("bullets").get(0)).put("text", "x".repeat(len));
            ((ArrayNode) s.get("items")).add(item);
            Optional<Violation> v = withSection(s);
            if (len == 600) {
                assertThat(v).isEmpty();
            } else {
                assertThat(v.orElseThrow().path()).isEqualTo("$.sections[0].items[0].bullets[0].text");
            }
        }
    }

    @Test
    void bulletLengthCountsCodePointsNotUtf16Units() {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 1);
        ((ObjectNode) item.get("bullets").get(0)).put("text", "😀".repeat(600)); // 600 emoji = 1200 chars
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s)).isEmpty();
    }

    @Test
    void summaryCharsBoundary() {
        for (int len : new int[] { 2000, 2001 }) {
            ObjectNode s = section("s_summary", "SUMMARY");
            ObjectNode item = ((ArrayNode) s.get("items")).addObject();
            item.put("id", id("i", 1));
            item.put("text", "y".repeat(len));
            Optional<Violation> v = withSection(s);
            if (len == 2000) {
                assertThat(v).isEmpty();
            } else {
                assertThat(v.orElseThrow().path()).isEqualTo("$.sections[0].items[0].text");
                assertThat(v.get().message()).isEqualTo("must be at most 2000 characters");
            }
        }
    }

    @Test
    void totalSizeIsCappedAt256KbAndFlaggedTooLarge() {
        // 40 items x 12 bullets x ~530 bytes is ~255 KB per section: within every per-field limit, over the total.
        ObjectNode doc = base();
        ArrayNode sections = (ArrayNode) doc.get("sections");
        int n = 0;
        for (String kind : new String[] { "EXPERIENCE", "PROJECTS" }) {
            ObjectNode s = section("s_bigsec" + kind.length(), kind);
            sections.add(s);
            for (int i = 0; i < ResumeDocumentValidator.MAX_ITEMS; i++) {
                ObjectNode item = ((ArrayNode) s.get("items")).addObject();
                item.put("id", id("i", ++n));
                ArrayNode bs = item.putArray("bullets");
                for (int b = 0; b < ResumeDocumentValidator.MAX_BULLETS; b++) {
                    ObjectNode bullet = bs.addObject();
                    bullet.put("id", id("b", ++n));
                    bullet.put("text", "z".repeat(500));
                }
            }
        }
        Violation v = ResumeDocumentValidator.validate(doc).orElseThrow();
        assertThat(v.tooLarge()).isTrue();
        assertThat(v.path()).isEqualTo("$");

        // Trimming the same document to fit makes it valid again.
        sections.remove(1);
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }

    @Test
    void skillGroupAndLinkLimits() {
        ObjectNode s = section("s_skills", "SKILLS");
        ObjectNode item = ((ArrayNode) s.get("items")).addObject();
        item.put("id", id("i", 1));
        ArrayNode sk = item.putArray("skills");
        for (int i = 0; i <= ResumeDocumentValidator.MAX_SKILLS_PER_GROUP; i++) sk.add("skill" + i);
        assertThat(withSection(s).orElseThrow().path()).isEqualTo("$.sections[0].items[0].skills");

        ObjectNode doc = base();
        ArrayNode links = ((ObjectNode) doc.get("basics")).putArray("links");
        for (int i = 0; i <= ResumeDocumentValidator.MAX_LINKS; i++) links.addObject().put("url", "https://example.com/" + i);
        assertThat(ResumeDocumentValidator.validate(doc).orElseThrow().path()).isEqualTo("$.basics.links");
    }

    // ---------------------------------------------------------------- rules

    @ParameterizedTest
    @ValueSource(strings = { "2022", "2022-06", "1999-12", "2030-01" })
    void acceptsYearAndYearMonthDates(String date) {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 0);
        item.put("start", date);
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "22", "2022-6", "2022-00", "2022-13", "2022-06-01", "June 2022", "Present", "1899" })
    void rejectsOtherDateFormats(String date) {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 0);
        item.put("end", date);
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s).orElseThrow().path()).isEqualTo("$.sections[0].items[0].end");
    }

    @Test
    void emptyAndNullDatesMeanUnset() {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 0);
        item.put("start", "");
        item.putNull("end");
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "b_1", "B_abcdef", "bb_abcdef", "b-abcdef", "b_abcdefghijklm", "b_abc def", "" })
    void rejectsMalformedIds(String badId) {
        ObjectNode s = section(badId, "EXPERIENCE");
        Violation v = withSection(s).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].id");
    }

    @ParameterizedTest
    @ValueSource(strings = { "s_abcdef", "s_Abc123xyz", "x_ABCDEFGHIJKL" })
    void acceptsWellFormedIds(String goodId) {
        assertThat(withSection(section(goodId, "EXPERIENCE"))).isEmpty();
    }

    @Test
    void customMayRepeatOtherKindsMayNot() {
        ObjectNode doc = base();
        ArrayNode sections = (ArrayNode) doc.get("sections");
        sections.add(section("s_custom01", "CUSTOM"));
        sections.add(section("s_custom02", "CUSTOM"));
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();

        sections.add(section("s_summary1", "SUMMARY"));
        sections.add(section("s_summary2", "SUMMARY"));
        Violation v = ResumeDocumentValidator.validate(doc).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[3].kind");
    }

    @Test
    void everyKnownKindIsAccepted() {
        ObjectNode doc = base();
        ArrayNode sections = (ArrayNode) doc.get("sections");
        int i = 0;
        for (ResumeDocument.Kind k : ResumeDocument.Kind.values()) sections.add(section("s_kind000" + (i++), k.name()));
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }

    @Test
    void kindIsCaseSensitive() {
        assertThat(withSection(section("s_abcdef1", "experience")).orElseThrow().path()).isEqualTo("$.sections[0].kind");
    }

    @Test
    void topLevelShape() {
        assertThat(ResumeDocumentValidator.validate(null)).isPresent();
        assertThat(ResumeDocumentValidator.validate(ResumeDocument.parse("[]")).orElseThrow().path()).isEqualTo("$");

        ObjectNode noMeta = base();
        noMeta.remove("meta");
        assertThat(ResumeDocumentValidator.validate(noMeta).orElseThrow().path()).isEqualTo("$.meta");

        ObjectNode noTitle = base();
        ((ObjectNode) noTitle.get("meta")).remove("title");
        assertThat(ResumeDocumentValidator.validate(noTitle).orElseThrow().path()).isEqualTo("$.meta.title");

        ObjectNode noBasics = base();
        noBasics.remove("basics");
        assertThat(ResumeDocumentValidator.validate(noBasics).orElseThrow().path()).isEqualTo("$.basics");

        ObjectNode strSchema = base();
        strSchema.put("schema", "1");
        assertThat(ResumeDocumentValidator.validate(strSchema).orElseThrow().path()).isEqualTo("$.schema");

        ObjectNode badLang = base();
        ((ObjectNode) badLang.get("meta")).put("language", "english please");
        assertThat(ResumeDocumentValidator.validate(badLang).orElseThrow().path()).isEqualTo("$.meta.language");
    }

    @Test
    void srcMustBeAKnownProvenance() {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 1);
        ((ObjectNode) item.get("bullets").get(0)).put("src", "robot");
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s).orElseThrow().path()).isEqualTo("$.sections[0].items[0].bullets[0].src");
    }

    @Test
    void unknownExtraKeysAreIgnored() {
        ObjectNode doc = base();
        doc.put("futureTopLevel", true);
        ((ObjectNode) doc.get("meta")).put("futureMeta", "x");
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }

    @Test
    void duplicateKeysAreRejectedAtParseTime() {
        org.junit.jupiter.api.Assertions.assertThrows(IllegalArgumentException.class, () ->
            ResumeDocument.parse("{\"schema\":1,\"schema\":1}")
        );
    }

    @Test
    void oversizeCheckWinsOverStructureErrors() {
        ObjectNode doc = base();
        doc.put("schema", 99);
        doc.put("padding", "p".repeat(ResumeDocumentValidator.MAX_BYTES));
        JsonNode node = doc;
        Violation v = ResumeDocumentValidator.validate(node).orElseThrow();
        assertThat(v.tooLarge()).isTrue();
    }
}
