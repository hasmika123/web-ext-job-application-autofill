package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.ResumeDocException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** The server twin of {@code sanitizeTheme}: bounded fields only (R2.4, DESIGN 4). */
class ResumeThemeValidatorTest {

    private static final ObjectMapper OM = new ObjectMapper();

    private static JsonNode json(String s) {
        try {
            return OM.readTree(s);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void aFullThemeIsKeptInAFixedOrderAndTheDerivedNumbersAreDropped() {
        JsonNode in = json(
            "{\"size\":10.5,\"fit\":{\"step\":2,\"target\":2,\"mode\":\"auto\"},\"spacing\":\"compact\",\"fontPair\":\"source-serif\",\"accent\":\"#16a34a\"," +
            "\"density\":0.88,\"margin\":0.6,\"pageSize\":\"a4\",\"dateStyle\":\"year\",\"showPhoto\":null,\"_touched\":[\"accent\",\"spacing\",\"accent\"],\"evil\":\"<script>\"}"
        );
        assertThat(ResumeDocumentJson.write(ResumeThemeValidator.sanitize(in), 0))
            .isEqualTo(
                "{\"accent\":\"#16a34a\",\"fontPair\":\"source-serif\",\"spacing\":\"compact\",\"pageSize\":\"a4\",\"dateStyle\":\"year\",\"showPhoto\":null," +
                "\"fit\":{\"mode\":\"auto\",\"target\":2,\"step\":2},\"_touched\":[\"accent\",\"spacing\"]}"
            );
    }

    @ParameterizedTest
    @CsvSource({"inter", "source-serif", "georgia-arial", "plex", "garamond"})
    void acceptsTheFiveFontPairs(String pair) {
        JsonNode out = ResumeThemeValidator.sanitize(json("{\"fontPair\":\"" + pair + "\"}"));
        assertThat(out.get("fontPair").asText()).isEqualTo(pair);
    }

    @Test
    void rejectsAnUnknownFontPair() {
        assertThatThrownBy(() -> ResumeThemeValidator.sanitize(json("{\"fontPair\":\"plex-mono\"}")))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> assertThat(e.getExtra()).containsEntry("path", "$.theme.fontPair"));
    }

    @Test
    void anEmptyObjectIsAValidTheme() {
        assertThat(ResumeThemeValidator.sanitize(json("{}")).isEmpty()).isTrue();
    }

    @ParameterizedTest
    @CsvSource(
        delimiter = '|',
        value = {
            "{\"accent\":\"red\"}|$.theme.accent",
            "{\"accent\":\"#12\"}|$.theme.accent",
            "{\"accent\":12}|$.theme.accent",
            "{\"fontPair\":\"comic-sans\"}|$.theme.fontPair",
            "{\"spacing\":\"huge\"}|$.theme.spacing",
            "{\"pageSize\":\"legal\"}|$.theme.pageSize",
            "{\"dateStyle\":\"iso\"}|$.theme.dateStyle",
            "{\"showPhoto\":\"yes\"}|$.theme.showPhoto",
            "{\"fit\":3}|$.theme.fit",
            "{\"fit\":{\"mode\":\"turbo\"}}|$.theme.fit.mode",
            "{\"fit\":{\"target\":3}}|$.theme.fit.target",
            "{\"fit\":{\"target\":1.5}}|$.theme.fit.target",
            "{\"fit\":{\"step\":7}}|$.theme.fit.step",
            "{\"fit\":{\"step\":-1}}|$.theme.fit.step",
            "{\"_touched\":[\"hax\"]}|$.theme._touched",
            "{\"_touched\":\"accent\"}|$.theme._touched",
            "[1,2]|$.theme",
        }
    )
    void outOfBoundsValuesAreRefusedWithThePath(String theme, String path) {
        assertThatThrownBy(() -> ResumeThemeValidator.sanitize(json(theme)))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> {
                assertThat(e.getCode()).isEqualTo("THEME_INVALID");
                assertThat(e.getStatus()).isEqualTo(422);
                assertThat(e.getExtra()).containsEntry("path", path);
            });
    }

    @Test
    void aThemeOverEightKilobytesIsRefused() {
        String big = "{\"junk\":\"" + "x".repeat(ResumeThemeValidator.MAX_THEME_BYTES) + "\"}";
        assertThatThrownBy(() -> ResumeThemeValidator.sanitize(json(big)))
            .isInstanceOfSatisfying(ResumeDocException.class, e -> assertThat(e.getExtra()).containsEntry("path", "$.theme"));
    }

    @Test
    void theAllowedValuesMatchTheTypeScriptContract() {
        // packages/ui/src/resume/types.ts (FONT_PAIRS, spacings) and fit.ts (MAX_FIT_STEP = FIT_LADDER.length - 1)
        assertThat(ResumeThemeValidator.FONT_PAIRS).containsExactly("inter", "source-serif", "georgia-arial", "plex", "garamond");
        assertThat(ResumeThemeValidator.SPACINGS).containsExactly("compact", "normal", "spacious");
        assertThat(ResumeThemeValidator.MAX_FIT_STEP).isEqualTo(6);
    }
}
