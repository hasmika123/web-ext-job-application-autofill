package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** The WCAG math and the "white text must be readable" gate (X2.5 / X2.12). The golden ratios are shared with packages/ui contrast.test.ts. */
class BrandingColorsTest {

    /** colour -> contrast of white on it, rounded to two decimals (the WCAG 2.1 formula; identical in TS). */
    private static final Map<String, Double> GOLDEN = Map.of(
        "#000000", 21.0,
        "#ffffff", 1.0,
        "#0f5fc4", 6.08,
        "#808080", 3.95,
        "#ffeb3b", 1.22
    );

    @Test
    void contrastMatchesTheGoldenTable() {
        GOLDEN.forEach((hex, expected) -> assertThat(BrandingColors.onWhite(hex)).as(hex).isBetween(expected - 0.1, expected + 0.1));
    }

    @Test
    void hexValidation() {
        assertThat(BrandingColors.isHex("#0f5fc4")).isTrue();
        assertThat(BrandingColors.isHex("#0F5FC4")).isTrue();
        assertThat(BrandingColors.isHex("0f5fc4")).isFalse();
        assertThat(BrandingColors.isHex("#fff")).isFalse();
        assertThat(BrandingColors.isHex("red")).isFalse();
        assertThat(BrandingColors.isHex("#0f5fc4; background:url(x)")).isFalse();
        assertThat(BrandingColors.isHex(null)).isFalse();
    }

    @Test
    void blueGreenAndNearBlackCarryWhiteText() {
        for (String ok : new String[] {"#0f5fc4", "#0b7a8a", "#2f6f4e", "#b4531a", "#111111", "#1d4ed8"}) {
            assertThat(BrandingColors.allowsWhiteText(ok)).as(ok).isTrue();
            assertThat(BrandingColors.suggestForWhiteText(ok)).isEqualTo(ok);
        }
    }

    @Test
    void yellowNearWhiteAndMidGreyAreRefusedWithAnAaSafeSuggestion() {
        for (String bad : new String[] {"#ffeb3b", "#f5f5f5", "#ffffff", "#808080", "#94bd37", "#4cd964"}) {
            assertThat(BrandingColors.allowsWhiteText(bad)).as(bad).isFalse();
            String suggestion = BrandingColors.suggestForWhiteText(bad);
            assertThat(BrandingColors.isHex(suggestion)).isTrue();
            assertThat(BrandingColors.onWhite(suggestion)).as(bad + " -> " + suggestion).isGreaterThanOrEqualTo(BrandingColors.AA_BODY);
        }
    }

    @Test
    void theSuggestionKeepsTheHue() {
        // a yellow stays yellowish: red and green stay well above blue
        String s = BrandingColors.suggestForWhiteText("#ffeb3b");
        int rgb = Integer.parseInt(s.substring(1), 16);
        assertThat((rgb >> 16) & 0xff).isGreaterThan(rgb & 0xff);
        assertThat((rgb >> 8) & 0xff).isGreaterThan(rgb & 0xff);
    }

    @Test
    void propertyEverySuggestionOverRandomColoursIsAaSafe() {
        Random r = new Random(42);
        for (int i = 0; i < 2000; i++) {
            String hex = String.format("#%06x", r.nextInt(0x1000000));
            String s = BrandingColors.suggestForWhiteText(hex);
            assertThat(BrandingColors.onWhite(s)).as(hex + " -> " + s).isGreaterThanOrEqualTo(BrandingColors.AA_BODY);
            if (BrandingColors.allowsWhiteText(hex)) assertThat(s).isEqualTo(hex);
        }
    }
}
