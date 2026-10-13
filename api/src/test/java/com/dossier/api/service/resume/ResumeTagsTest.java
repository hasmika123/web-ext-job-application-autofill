package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class ResumeTagsTest {

    @Test
    void lowerCasesTrimsAndDeduplicatesKeepingFirstOccurrence() {
        assertThat(ResumeTags.normalize(Arrays.asList("  Backend ", "BACKEND", "2026", "", "  ", null, "Remote  OK")))
            .containsExactly("backend", "2026", "remote ok");
    }

    @Test
    void nullIsEmpty() {
        assertThat(ResumeTags.normalize(null)).isEmpty();
        assertThat(ResumeTags.write(List.of())).isNull();
    }

    @Test
    void aTagOfExactlyTwentyFourCharactersPassesAndTwentyFiveFails() {
        assertThat(ResumeTags.normalize(List.of("a".repeat(24)))).hasSize(1);
        assertThatThrownBy(() -> ResumeTags.normalize(List.of("a".repeat(25)))).isInstanceOf(ResumeTags.InvalidTagsException.class);
    }

    @Test
    void tenTagsPassAndElevenFail() {
        List<String> ten = new ArrayList<>();
        for (int i = 0; i < 10; i++) ten.add("t" + i);
        assertThat(ResumeTags.normalize(ten)).hasSize(10);
        ten.add("t10");
        assertThatThrownBy(() -> ResumeTags.normalize(ten)).isInstanceOf(ResumeTags.InvalidTagsException.class);
    }

    @Test
    void duplicatesDoNotCountTowardsTheLimit() {
        List<String> many = new ArrayList<>();
        for (int i = 0; i < 20; i++) many.add("same");
        assertThat(ResumeTags.normalize(many)).containsExactly("same");
    }

    @Test
    void roundTripsThroughJson() {
        String json = ResumeTags.write(List.of("backend", "2026"));
        assertThat(json).isEqualTo("[\"backend\",\"2026\"]");
        assertThat(ResumeTags.parse(json)).containsExactly("backend", "2026");
        assertThat(ResumeTags.parse(null)).isEmpty();
        assertThat(ResumeTags.parse("not json")).isEmpty();
    }
}
