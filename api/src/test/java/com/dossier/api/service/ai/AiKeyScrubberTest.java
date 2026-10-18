package com.dossier.api.service.ai;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class AiKeyScrubberTest {

    private static final String KEY = "my-secret-provider-key-123456";

    @Test
    void everyConfiguredKeyValueIsRedactedEverywhereInTheText() {
        AiKeyScrubber s = new AiKeyScrubber(List.of(KEY, "second-key-abcdef"));
        assertThat(s.scrub("GET /x?key=" + KEY + " failed; again " + KEY + " and second-key-abcdef"))
            .isEqualTo("GET /x?key=[redacted] failed; again [redacted] and [redacted]");
    }

    @Test
    void aGoogleShapedKeyIsRedactedEvenWhenItIsNotConfigured() {
        String shaped = "AIzaSyD" + "x".repeat(32);
        assertThat(AiKeyScrubber.shapesOnly().scrub("bad key " + shaped + " rejected")).isEqualTo("bad key [redacted] rejected");
    }

    @Test
    void tinyStandInKeysAreNotScrubbedByValueSoTheyCannotShredAMessage() {
        assertThat(new AiKeyScrubber(List.of("k", "", "  ")).scrub("key k okay")).isEqualTo("key k okay");
    }

    @Test
    void nullAndLengthAreHandled() {
        AiKeyScrubber s = new AiKeyScrubber(List.of(KEY));
        assertThat(s.scrub(null)).isNull();
        assertThat(s.scrub("a".repeat(500), 200)).hasSize(200).endsWith("...");
        assertThat(s.scrub("short", 200)).isEqualTo("short");
    }
}
