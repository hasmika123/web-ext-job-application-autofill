package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ProfileItem;
import com.dossier.api.domain.enumeration.ProfileSection;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The completeness math (DESIGN v1 2.4): weights, thresholds, the next action and its tie-break. */
class CompletenessTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode bio(String json) {
        try {
            return OM.readTree(json);
        } catch (Exception e) {
            throw new IllegalArgumentException(e);
        }
    }

    private static ProfileItem item(ProfileSection s, String dataJson) {
        ProfileItem i = new ProfileItem();
        i.setSection(s);
        i.setDataJson(dataJson);
        return i;
    }

    private static ProfileItem experience(int bullets) {
        List<String> bs = new ArrayList<>();
        for (int i = 0; i < bullets; i++) bs.add("{\"text\":\"Did thing " + i + "\"}");
        return item(ProfileSection.EXPERIENCE, "{\"title\":\"Engineer\",\"org\":\"Acme\",\"bullets\":[" + String.join(",", bs) + "]}");
    }

    private static ProfileItem skills(String... names) {
        List<String> q = new ArrayList<>();
        for (String n : names) q.add("\"" + n + "\"");
        return item(ProfileSection.SKILL, "{\"group\":\"Skills\",\"skills\":[" + String.join(",", q) + "]}");
    }

    private static final String FULL_BIO =
        "{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"email\":\"ada@example.com\",\"phone\":\"+1 415 555 1234\"," +
        "\"city\":\"London\",\"country\":\"UK\",\"headline\":\"Engineer\",\"summary\":\"Builds engines.\"," +
        "\"linkedin\":\"https://linkedin.com/in/ada\",\"workPreference\":\"Remote\",\"noticePeriod\":\"2 weeks\"}";

    @Test
    void weightsSumToOneHundred() {
        ProfileCompleteness.Result r = ProfileCompleteness.compute(null, List.of());
        assertThat(r.parts().values().stream().mapToInt(ProfileCompleteness.Part::weight).sum()).isEqualTo(100);
        assertThat(r.parts().keySet())
            .containsExactly("identity", "location", "headline", "summary", "experience", "education", "skills", "links", "preferences");
    }

    @Test
    void emptyProfileScoresZeroAndNextActionIsTheHeaviestPart() {
        ProfileCompleteness.Result r = ProfileCompleteness.compute(null, List.of());
        assertThat(r.score()).isZero();
        assertThat(r.nextAction().key()).isEqualTo("experience");
        assertThat(r.nextAction().href()).isEqualTo("/profiles?tab=work");
        assertThat(r.nextAction().label()).isNotBlank();
    }

    @Test
    void completeProfileScoresOneHundredWithNoNextAction() {
        List<ProfileItem> items = List.of(
            experience(2),
            item(ProfileSection.EDUCATION, "{\"school\":\"MIT\"}"),
            skills("Java", "SQL", "Go", "Kotlin", "Rust")
        );
        ProfileCompleteness.Result r = ProfileCompleteness.compute(bio(FULL_BIO), items);
        assertThat(r.score()).isEqualTo(100);
        assertThat(r.parts().values()).allMatch(ProfileCompleteness.Part::done);
        assertThat(r.nextAction()).isNull();
    }

    @Test
    void eachPartContributesItsWeightAlone() {
        assertThat(ProfileCompleteness.compute(bio("{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"a@b.c\",\"phone\":\"1\"}"), List.of()).score()).isEqualTo(15);
        assertThat(ProfileCompleteness.compute(bio("{\"city\":\"X\",\"country\":\"Y\"}"), List.of()).score()).isEqualTo(5);
        assertThat(ProfileCompleteness.compute(bio("{\"headline\":\"H\"}"), List.of()).score()).isEqualTo(5);
        assertThat(ProfileCompleteness.compute(bio("{\"summary\":\"S\"}"), List.of()).score()).isEqualTo(10);
        assertThat(ProfileCompleteness.compute(null, List.of(experience(2))).score()).isEqualTo(25);
        assertThat(ProfileCompleteness.compute(null, List.of(item(ProfileSection.EDUCATION, "{}"))).score()).isEqualTo(10);
        assertThat(ProfileCompleteness.compute(null, List.of(skills("a", "b", "c", "d", "e"))).score()).isEqualTo(15);
        assertThat(ProfileCompleteness.compute(bio("{\"github\":\"g\"}"), List.of()).score()).isEqualTo(5);
        assertThat(ProfileCompleteness.compute(bio("{\"desiredSalary\":\"1\",\"noticePeriod\":\"2\"}"), List.of()).score()).isEqualTo(10);
    }

    @Test
    void thresholdsAreExact() {
        // identity needs all four, location both, preferences two, experience two bullets, skills five
        assertThat(ProfileCompleteness.compute(bio("{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"a@b.c\"}"), List.of()).score()).isZero();
        assertThat(ProfileCompleteness.compute(bio("{\"city\":\"X\"}"), List.of()).score()).isZero();
        assertThat(ProfileCompleteness.compute(bio("{\"noticePeriod\":\"2\"}"), List.of()).score()).isZero();
        assertThat(ProfileCompleteness.compute(null, List.of(experience(1))).score()).isZero();
        assertThat(ProfileCompleteness.compute(null, List.of(skills("a", "b", "c", "d"))).score()).isZero();
        assertThat(ProfileCompleteness.compute(null, List.of(experience(2))).parts().get("experience").done()).isTrue();
    }

    @Test
    void skillsAreCountedDistinctAcrossRowsIgnoringCase() {
        assertThat(ProfileCompleteness.compute(null, List.of(skills("Java", "java", "JAVA", "SQL", "Go"))).parts().get("skills").done()).isFalse();
        assertThat(ProfileCompleteness.compute(null, List.of(skills("Java", "SQL"), skills("Go", "Kotlin"), skills("sql", "Rust"))).parts().get("skills").done()).isTrue();
    }

    @Test
    void blankValuesDoNotCount() {
        assertThat(ProfileCompleteness.compute(bio("{\"headline\":\"   \",\"summary\":\"\"}"), List.of()).score()).isZero();
        assertThat(ProfileCompleteness.compute(null, List.of(experience(0), item(ProfileSection.EXPERIENCE, "{\"bullets\":[{\"text\":\" \"},{\"text\":\"\"}]}"))).score()).isZero();
    }

    @Test
    void aLinkItemCountsAsALink() {
        assertThat(ProfileCompleteness.compute(null, List.of(item(ProfileSection.LINK, "{\"url\":\"https://x.dev\"}"))).parts().get("links").done()).isTrue();
    }

    @Test
    void nextActionIsTheHeaviestMissingPartThenDisplayOrder() {
        // experience done (25): identity and skills tie at 15 -> display order puts identity first
        List<ProfileItem> items = new ArrayList<>(List.of(experience(2)));
        assertThat(ProfileCompleteness.compute(null, items).nextAction().key()).isEqualTo("identity");
        items.add(skills("a", "b", "c", "d", "e"));
        // identity (15) is still the heaviest missing
        assertThat(ProfileCompleteness.compute(null, items).nextAction().key()).isEqualTo("identity");
        JsonNode identity = bio("{\"firstName\":\"A\",\"lastName\":\"B\",\"email\":\"a@b.c\",\"phone\":\"1\"}");
        // summary (10) and education (10) tie: display order puts summary first
        assertThat(ProfileCompleteness.compute(identity, items).nextAction().key()).isEqualTo("summary");
        assertThat(ProfileCompleteness.compute(identity, items).nextAction().href()).isEqualTo("/profiles?tab=personal");
    }

    @Test
    void tolerantOfDamagedItemsAndNonObjectBio() {
        assertThat(ProfileCompleteness.compute(bio("[1,2]"), List.of(item(ProfileSection.EXPERIENCE, "not json"), item(ProfileSection.SKILL, null))).score()).isZero();
    }
}
