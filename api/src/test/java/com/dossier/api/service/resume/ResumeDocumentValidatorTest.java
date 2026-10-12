package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ResumeDocumentValidator.Limits;
import com.dossier.api.service.resume.ResumeDocumentValidator.Options;
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

    /** The owner whose photo prefix the v2 fixtures use. */
    private static final Options OWNER_42 = Options.DEFAULTS.withPhotoKeyPrefix("resume-photos/42/");

    @ParameterizedTest
    @ValueSource(strings = { "full-v2.json", "full-v1-upgraded.json", "caps-doc.json" })
    void validV2FixturesPass(String name) {
        assertThat(ResumeDocumentValidator.validate(Fixtures.doc(name), OWNER_42)).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = { "full.json", "sparse.json" })
    void v1FixturesPassOnceUpgradedButNotRaw(String name) {
        JsonNode v1 = Fixtures.doc(name);
        Violation raw = ResumeDocumentValidator.validate(v1).orElseThrow();
        assertThat(raw.path()).isEqualTo("$.schema");
        assertThat(raw.message()).isEqualTo("must be 2");
        assertThat(ResumeDocumentValidator.validate(ResumeDocumentUpgrader.upgrade(v1))).isEmpty();
    }

    static Stream<Arguments> invalidFixtures() {
        return Stream.of(
            Arguments.of("invalid-schema-version.json", "$.schema", "must be 2"),
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
            "{\"schema\":2,\"meta\":{\"title\":\"T\"},\"basics\":{\"name\":\"N\"},\"sections\":[]}"
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
        strSchema.put("schema", "2");
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
            ResumeDocument.parse("{\"schema\":2,\"schema\":2}")
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

    // ---------------------------------------------------------------- v2: marks

    private static ObjectNode summarySection(String text, String marksJson) {
        ObjectNode s = section("s_summary", "SUMMARY");
        ObjectNode item = ((ArrayNode) s.get("items")).addObject();
        item.put("id", id("i", 1));
        item.put("text", text);
        if (marksJson != null) item.set("marks", ResumeDocument.parse(marksJson));
        return s;
    }

    private static Optional<Violation> withMarks(String text, String marksJson) {
        return withSection(summarySection(text, marksJson));
    }

    @Test
    void validMarksOfEveryTypeAreAccepted() {
        assertThat(
            withMarks("Hello bold italic under link", "[{\"s\":6,\"e\":10,\"t\":\"b\"},{\"s\":11,\"e\":17,\"t\":\"i\"},{\"s\":18,\"e\":23,\"t\":\"u\"},{\"s\":24,\"e\":28,\"t\":\"a\",\"href\":\"https://x.dev/a\"}]")
        ).isEmpty();
    }

    @Test
    void differentTypesMayOverlapAndSameTypeMayTouch() {
        assertThat(withMarks("0123456789", "[{\"s\":0,\"e\":6,\"t\":\"b\"},{\"s\":3,\"e\":9,\"t\":\"i\"},{\"s\":6,\"e\":10,\"t\":\"b\"}]")).isEmpty();
    }

    @Test
    void sameTypeMarksMustNotOverlap() {
        Violation v = withMarks("0123456789", "[{\"s\":0,\"e\":6,\"t\":\"b\"},{\"s\":5,\"e\":9,\"t\":\"b\"}]").orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].marks[1]");
        assertThat(v.message()).isEqualTo("overlaps another mark of the same type");
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "[{\"s\":-1,\"e\":3,\"t\":\"b\"}]",
        "[{\"s\":3,\"e\":3,\"t\":\"b\"}]",
        "[{\"s\":4,\"e\":3,\"t\":\"b\"}]",
        "[{\"s\":0,\"e\":11,\"t\":\"b\"}]",
        "[{\"s\":0,\"e\":1.5,\"t\":\"b\"}]",
        "[{\"s\":0,\"e\":3,\"t\":\"x\"}]",
        "[{\"s\":0,\"e\":3}]",
        "[5]",
    })
    void malformedOrOutOfRangeMarksAreRejected(String marks) {
        Violation v = withMarks("0123456789", marks).orElseThrow();
        assertThat(v.path()).startsWith("$.sections[0].items[0].marks[0]");
    }

    @Test
    void marksCountUtf16UnitsNotCodePoints() {
        // "😀" is 2 UTF-16 units: the text has length 3, so e = 3 is fine and e = 4 is not.
        assertThat(withMarks("😀a", "[{\"s\":0,\"e\":3,\"t\":\"b\"}]")).isEmpty();
        assertThat(withMarks("😀a", "[{\"s\":0,\"e\":4,\"t\":\"b\"}]")).isPresent();
    }

    @Test
    void linkMarksNeedAnHttpHttpsOrMailtoHref() {
        for (String ok : new String[] { "http://a.dev", "https://a.dev/x?y=1", "mailto:a@b.dev", "  https://a.dev " }) {
            assertThat(withMarks("0123456789", "[{\"s\":0,\"e\":3,\"t\":\"a\",\"href\":\"" + ok + "\"}]")).as(ok).isEmpty();
        }
        for (String bad : new String[] { "javascript:alert(1)", "ftp://a.dev", "//a.dev", "a.dev", "data:text/html,x", "" }) {
            Violation v = withMarks("0123456789", "[{\"s\":0,\"e\":3,\"t\":\"a\",\"href\":\"" + bad + "\"}]").orElseThrow();
            assertThat(v.path()).as(bad).isEqualTo("$.sections[0].items[0].marks[0].href");
        }
        assertThat(withMarks("0123456789", "[{\"s\":0,\"e\":3,\"t\":\"a\"}]").orElseThrow().path()).endsWith(".href");
    }

    @Test
    void hrefIsOnlyAllowedOnLinkMarks() {
        Violation v = withMarks("0123456789", "[{\"s\":0,\"e\":3,\"t\":\"b\",\"href\":\"https://a.dev\"}]").orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].marks[0].href");
    }

    @Test
    void marksPerTextBoundaryIsInjectedFromTheLimits() {
        StringBuilder marks = new StringBuilder("[");
        for (int i = 0; i < 65; i++) marks.append(i > 0 ? "," : "").append("{\"s\":").append(i).append(",\"e\":").append(i + 1).append(",\"t\":\"b\"}");
        String text = "x".repeat(100);
        // 65 touching same-type marks: over the default 64...
        Violation v = withMarks(text, marks + "]").orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].marks");
        assertThat(v.message()).isEqualTo("at most 64 marks per text");
        // ...and fine when the settings seam raises the limit
        Options roomy = Options.DEFAULTS.withLimits(new Limits(20, 40, 12, 600, 2000, 100, 256 * 1024));
        ObjectNode doc = base();
        ((ArrayNode) doc.get("sections")).add(summarySection(text, marks + "]"));
        assertThat(ResumeDocumentValidator.validate(doc, roomy)).isEmpty();
    }

    @Test
    void marksOnBulletsAndAchievementsAreValidatedToo() {
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 1);
        ((ObjectNode) item.get("bullets").get(0)).set("marks", ResumeDocument.parse("[{\"s\":0,\"e\":99,\"t\":\"b\"}]"));
        ((ArrayNode) s.get("items")).add(item);
        assertThat(withSection(s).orElseThrow().path()).isEqualTo("$.sections[0].items[0].bullets[0].marks[0].e");

        ObjectNode a = section("s_achieve1", "ACHIEVEMENTS");
        ObjectNode ach = ((ArrayNode) a.get("items")).addObject();
        ach.put("id", id("i", 7));
        ach.put("text", "Won");
        ach.set("marks", ResumeDocument.parse("[{\"s\":0,\"e\":3,\"t\":\"i\"}]"));
        assertThat(withSection(a)).isEmpty();
        ach.set("marks", ResumeDocument.parse("[{\"s\":0,\"e\":4,\"t\":\"i\"}]"));
        assertThat(withSection(a).orElseThrow().path()).isEqualTo("$.sections[0].items[0].marks[0].e");
    }

    // ---------------------------------------------------------------- v2: lists, interests, projects

    @Test
    void listAndListStyleAcceptBulletNumberOrNull() {
        for (String ok : new String[] { "\"bullet\"", "\"number\"", "null" }) {
            ObjectNode s = summarySection("hi", null);
            ((ObjectNode) s.get("items").get(0)).set("list", ResumeDocument.parse(ok));
            assertThat(withSection(s)).as(ok).isEmpty();
        }
        ObjectNode bad = summarySection("hi", null);
        ((ObjectNode) bad.get("items").get(0)).put("list", "roman");
        assertThat(withSection(bad).orElseThrow().path()).isEqualTo("$.sections[0].items[0].list");

        ObjectNode e = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 1);
        item.put("listStyle", "number");
        ((ArrayNode) e.get("items")).add(item);
        assertThat(withSection(e)).isEmpty();
        item.put("listStyle", "dots");
        assertThat(withSection(e).orElseThrow().path()).isEqualTo("$.sections[0].items[0].listStyle");
    }

    @Test
    void interestsItemsAreAtMost80Characters() {
        ObjectNode s = section("s_interests", "INTERESTS");
        ObjectNode item = ((ArrayNode) s.get("items")).addObject();
        item.put("id", id("i", 1));
        item.put("text", "y".repeat(80));
        assertThat(withSection(s)).isEmpty();
        item.put("text", "y".repeat(81));
        Violation v = withSection(s).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].text");
        assertThat(v.message()).isEqualTo("must be at most 80 characters");
    }

    @Test
    void projectsMayCarryDates() {
        ObjectNode s = section("s_projects", "PROJECTS");
        ObjectNode item = ((ArrayNode) s.get("items")).addObject();
        item.put("id", id("i", 1));
        item.put("start", "2021-02");
        item.put("end", "2022");
        assertThat(withSection(s)).isEmpty();
        item.put("end", "last year");
        assertThat(withSection(s).orElseThrow().path()).isEqualTo("$.sections[0].items[0].end");
    }

    // ---------------------------------------------------------------- v2: photo

    private static ObjectNode withPhoto(String key) {
        ObjectNode doc = base();
        ((ObjectNode) doc.get("basics")).set("photo", ResumeDocument.parse("{\"key\":\"" + key + "\",\"updatedAt\":\"2026-10-12T09:00:00Z\"}"));
        return doc;
    }

    @Test
    void photoKeyMustStartWithTheOwnersPrefix() {
        Options owner = Options.DEFAULTS.withPhotoKeyPrefix("resume-photos/42/");
        assertThat(ResumeDocumentValidator.validate(withPhoto("resume-photos/42/7-abc-photo.jpg"), owner)).isEmpty();

        Violation other = ResumeDocumentValidator.validate(withPhoto("resume-photos/43/7-abc-photo.jpg"), owner).orElseThrow();
        assertThat(other.path()).isEqualTo("$.basics.photo.key");
        assertThat(other.message()).isEqualTo("must start with resume-photos/42/");
        // 4 is a prefix of 42 only as a string: the trailing slash is part of the prefix
        assertThat(ResumeDocumentValidator.validate(withPhoto("resume-photos/4/7-abc-photo.jpg"), owner)).isPresent();
        assertThat(ResumeDocumentValidator.validate(withPhoto("../resume-photos/42/x.jpg"), owner)).isPresent();
    }

    @Test
    void aCallerWithoutAnOwnerMayNotSetAPhoto() {
        Violation v = ResumeDocumentValidator.validate(withPhoto("resume-photos/42/x.jpg")).orElseThrow();
        assertThat(v.path()).isEqualTo("$.basics.photo.key");
        assertThat(v.message()).isEqualTo("is set by the server");
    }

    @Test
    void photoNullAndAbsentAreFine() {
        ObjectNode doc = base();
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
        ((ObjectNode) doc.get("basics")).putNull("photo");
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
        ((ObjectNode) doc.get("basics")).put("photo", "resume-photos/42/x.jpg");
        assertThat(ResumeDocumentValidator.validate(doc).orElseThrow().path()).isEqualTo("$.basics.photo");
    }

    // ---------------------------------------------------------------- v2: tailoredFrom

    private static final String TAILORED =
        "{\"resumeId\":9,\"job\":{\"source\":\"pasted\",\"applicationId\":null,\"title\":\"PM\",\"company\":\"Stripe\",\"jdHash\":\""
        + "a".repeat(64)
        + "\"},\"createdAt\":\"2026-10-12T09:00:00Z\"}";

    @Test
    void tailoredFromIsServerOnly() {
        ObjectNode doc = base();
        ((ObjectNode) doc.get("meta")).set("tailoredFrom", ResumeDocument.parse(TAILORED));

        Violation refused = ResumeDocumentValidator.validate(doc).orElseThrow();
        assertThat(refused.path()).isEqualTo("$.meta.tailoredFrom");
        assertThat(ResumeDocumentValidator.validate(doc, new Options(false))).isPresent();

        assertThat(ResumeDocumentValidator.validate(doc, new Options(true))).isEmpty();

        ((ObjectNode) doc.get("meta")).putNull("tailoredFrom");
        assertThat(ResumeDocumentValidator.validate(doc)).as("null is the same as absent").isEmpty();
    }

    @Test
    void tailoredFromShapeIsCheckedWhenAllowed() {
        for (String bad : new String[] {
            "{\"resumeId\":\"9\",\"job\":{}}",
            "{\"resumeId\":9}",
            "{\"resumeId\":9,\"job\":{\"source\":\"scraped\",\"title\":\"t\",\"company\":\"c\",\"jdHash\":\"" + "a".repeat(64) + "\"}}",
            "{\"resumeId\":9,\"job\":{\"source\":\"pasted\",\"title\":\"t\",\"company\":\"c\",\"jdHash\":\"XYZ\"}}",
            "[]",
        }) {
            ObjectNode doc = base();
            ((ObjectNode) doc.get("meta")).set("tailoredFrom", ResumeDocument.parse(bad));
            Violation v = ResumeDocumentValidator.validate(doc, new Options(true)).orElseThrow();
            assertThat(v.path()).as(bad).startsWith("$.meta.tailoredFrom");
        }
    }

    // ---------------------------------------------------------------- v2: injected limits

    @Test
    void documentLimitsComeFromTheOptionsAndDefaultToTheR0Constants() {
        assertThat(Limits.DEFAULTS).isEqualTo(new Limits(20, 40, 12, 600, 2000, 64, 256 * 1024));

        Options tight = Options.DEFAULTS.withLimits(new Limits(1, 1, 1, 10, 10, 1, 256 * 1024));
        ObjectNode s = section("s_experience", "EXPERIENCE");
        ObjectNode item = experienceItem(1, 2);
        ((ArrayNode) s.get("items")).add(item);
        ObjectNode doc = base();
        ((ArrayNode) doc.get("sections")).add(s);
        Violation v = ResumeDocumentValidator.validate(doc, tight).orElseThrow();
        assertThat(v.path()).isEqualTo("$.sections[0].items[0].bullets");
        assertThat(v.message()).isEqualTo("at most 1 bullets per item");
        assertThat(ResumeDocumentValidator.validate(doc)).isEmpty();
    }
}
