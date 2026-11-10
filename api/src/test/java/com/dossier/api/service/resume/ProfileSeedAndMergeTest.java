package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.enumeration.ProfileSection;
import com.dossier.api.service.resume.ProfileSeed.Seeded;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import org.junit.jupiter.api.Test;

/** StructuredResume -> profile items, and the identity key / merge rules used by import and seeding. */
class ProfileSeedAndMergeTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(String s) {
        try {
            return OM.readTree(s);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static ObjectNode obj(String s) {
        return (ObjectNode) json(s);
    }

    @Test
    void seedMapsEverySectionOfAStructuredResume() {
        JsonNode parsed = json(
            "{\"summary\":\"x\",\"skills\":[\"Java\",\"java\",\" SQL \",\"\"]," +
            "\"experience\":[{\"company\":\"Acme Inc\",\"title\":\"Engineer\",\"location\":\"NYC\",\"startDate\":\"Jan 2020\",\"endDate\":\"Present\",\"current\":false,\"bullets\":[\"Built a thing\",\"\"]}," +
            "{\"company\":\"\",\"title\":\"\",\"bullets\":[]}]," +
            "\"education\":[{\"school\":\"MIT\",\"degree\":\"BS\",\"field\":\"CS\",\"startDate\":\"2012\",\"endDate\":\"05/2016\",\"gpa\":\"3.9\"}]," +
            "\"languages\":[{\"name\":\"French\",\"proficiency\":\"Fluent\"}]," +
            "\"projects\":[{\"name\":\"Kiwi\",\"bullets\":[\"Shipped\"]}]}"
        );
        List<Seeded> seeded = ProfileSeed.fromStructured(parsed);
        assertThat(seeded).extracting(Seeded::section).containsExactly(
            ProfileSection.EXPERIENCE, ProfileSection.EDUCATION, ProfileSection.PROJECT, ProfileSection.LANGUAGE, ProfileSection.SKILL
        );

        ObjectNode exp = seeded.get(0).data();
        assertThat(exp.get("title").asText()).isEqualTo("Engineer");
        assertThat(exp.get("org").asText()).isEqualTo("Acme Inc");
        assertThat(exp.get("start").asText()).isEqualTo("2020-01");
        assertThat(exp.has("end")).isFalse();
        assertThat(exp.get("current").asBoolean()).isTrue(); // "Present" end date
        assertThat(exp.get("bullets")).hasSize(1);
        assertThat(exp.get("bullets").get(0).get("text").asText()).isEqualTo("Built a thing");
        assertThat(exp.get("bullets").get(0).get("src").asText()).isEqualTo("parsed");

        ObjectNode edu = seeded.get(1).data();
        assertThat(edu.get("start").asText()).isEqualTo("2012");
        assertThat(edu.get("end").asText()).isEqualTo("2016-05");

        assertThat(seeded.get(2).data().get("title").asText()).isEqualTo("Kiwi");
        assertThat(seeded.get(3).data().get("level").asText()).isEqualTo("Fluent");

        ObjectNode skills = seeded.get(4).data();
        assertThat(skills.get("group").asText()).isEqualTo("Skills");
        assertThat(skills.get("skills")).hasSize(2); // de-duplicated case-insensitively, blanks dropped
    }

    @Test
    void seedSplitsManySkillsIntoRowsOfForty() {
        StringBuilder sb = new StringBuilder("{\"skills\":[");
        for (int i = 0; i < 85; i++) sb.append(i == 0 ? "" : ",").append("\"skill").append(i).append("\"");
        sb.append("]}");
        List<Seeded> seeded = ProfileSeed.fromStructured(json(sb.toString()));
        assertThat(seeded).hasSize(3);
        assertThat(seeded.get(0).data().get("skills")).hasSize(40);
        assertThat(seeded.get(2).data().get("skills")).hasSize(5);
    }

    @Test
    void seedOfNothingIsEmpty() {
        assertThat(ProfileSeed.fromStructured(null)).isEmpty();
        assertThat(ProfileSeed.fromStructured(json("[]"))).isEmpty();
        assertThat(ProfileSeed.fromStructured(json("{\"experience\":\"nope\"}"))).isEmpty();
    }

    @Test
    void dateParsing() {
        assertThat(ProfileSeed.date("2020")).isEqualTo("2020");
        assertThat(ProfileSeed.date("2020-03")).isEqualTo("2020-03");
        assertThat(ProfileSeed.date("March 2020")).isEqualTo("2020-03");
        assertThat(ProfileSeed.date("Sept. 2020")).isEqualTo("2020-09");
        assertThat(ProfileSeed.date("3/2020")).isEqualTo("2020-03");
        assertThat(ProfileSeed.date("2020/03")).isEqualTo("2020-03");
        assertThat(ProfileSeed.date("2020-13")).isEmpty();
        assertThat(ProfileSeed.date("sometime")).isEmpty();
        assertThat(ProfileSeed.date(null)).isEmpty();
    }

    @Test
    void normalisationIgnoresCasePunctuationAndLegalSuffixes() {
        assertThat(ProfileItemMerge.norm("Acme, Inc.")).isEqualTo("acme");
        assertThat(ProfileItemMerge.norm("  ACME  Corporation ")).isEqualTo("acme");
        assertThat(ProfileItemMerge.norm("Senior Software Engineer")).isEqualTo("senior software engineer");
        assertThat(ProfileItemMerge.norm("Inc")).isEqualTo("inc"); // never reduced to nothing
    }

    @Test
    void identityKeys() {
        String a = ProfileItemMerge.identityKey(ProfileSection.EXPERIENCE, obj("{\"title\":\"Engineer\",\"org\":\"Acme Inc.\"}"));
        String b = ProfileItemMerge.identityKey(ProfileSection.EXPERIENCE, obj("{\"title\":\" engineer \",\"company\":\"ACME\"}"));
        assertThat(a).isNotNull().isEqualTo(b);
        assertThat(ProfileItemMerge.identityKey(ProfileSection.EXPERIENCE, obj("{\"title\":\"Engineer\",\"org\":\"Globex\"}"))).isNotEqualTo(a);
        assertThat(ProfileItemMerge.identityKey(ProfileSection.EDUCATION, obj("{\"school\":\"MIT\",\"degree\":\"BS\"}"))).isNotEqualTo(a);
        assertThat(ProfileItemMerge.identityKey(ProfileSection.EXPERIENCE, obj("{\"location\":\"NYC\"}"))).isNull();
        assertThat(ProfileItemMerge.identityKey(ProfileSection.SKILL, obj("{\"group\":\"Languages\"}"))).isEqualTo("SKILL:languages");
        assertThat(ProfileItemMerge.identityKey(ProfileSection.LINK, obj("{\"url\":\"https://www.GitHub.com/ada/\"}")))
            .isEqualTo(ProfileItemMerge.identityKey(ProfileSection.LINK, obj("{\"url\":\"http://github.com/ada\"}")));
        // same title+org in different sections never collide
        assertThat(ProfileItemMerge.identityKey(ProfileSection.PROJECT, obj("{\"title\":\"X\"}")))
            .isNotEqualTo(ProfileItemMerge.identityKey(ProfileSection.CERTIFICATION, obj("{\"title\":\"X\"}")));
    }

    @Test
    void mergeFillsBlanksAndAppendsButNeverOverwrites() {
        ObjectNode existing = obj("{\"title\":\"Engineer\",\"org\":\"Acme\",\"location\":\"\",\"bullets\":[{\"text\":\"Built a thing\"}]}");
        JsonNode incoming = json(
            "{\"title\":\"Staff Engineer\",\"org\":\"Acme\",\"location\":\"NYC\",\"start\":\"2020-01\"," +
            "\"bullets\":[{\"text\":\"built a THING.\"},{\"text\":\"Cut costs 20%\"}]}"
        );
        assertThat(ProfileItemMerge.merge(existing, incoming)).isTrue();
        assertThat(existing.get("title").asText()).isEqualTo("Engineer"); // user's data wins
        assertThat(existing.get("location").asText()).isEqualTo("NYC"); // blank filled
        assertThat(existing.get("start").asText()).isEqualTo("2020-01"); // absent filled
        assertThat(existing.get("bullets")).hasSize(2); // the near-duplicate bullet was not added
        assertThat(existing.get("bullets").get(1).get("text").asText()).isEqualTo("Cut costs 20%");
        assertThat(ProfileItemMerge.merge(existing, incoming)).isFalse(); // idempotent
    }

    @Test
    void mergeUnionsSkillsAcrossStringsAndObjects() {
        ObjectNode existing = obj("{\"group\":\"Skills\",\"skills\":[\"Java\",\"SQL\"]}");
        assertThat(ProfileItemMerge.merge(existing, json("{\"group\":\"Skills\",\"skills\":[\"java\",\"Go\"]}"))).isTrue();
        assertThat(existing.get("skills")).hasSize(3);
    }
}
