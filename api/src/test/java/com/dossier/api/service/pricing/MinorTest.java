package com.dossier.api.service.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Random;
import org.junit.jupiter.api.Test;

/** The only rounding function: half-even, exact, no floating point (docs/enterprise-v2/22 section 1, G10, 03 section 8.6). */
class MinorTest {

    @Test
    void g10RoundingTable() {
        assertThat(Minor.pctOff(1250, 500)).isEqualTo(1188); // 1187.5 -> even
        assertThat(Minor.pctOff(1150, 500)).isEqualTo(1092); // 1092.5 -> even
        assertThat(Minor.pctOff(999, 1500)).isEqualTo(849); // 849.15
        assertThat(Minor.pctOff(1, 5000)).isEqualTo(0); // 0.5 -> 0
        assertThat(Minor.pctOff(3, 5000)).isEqualTo(2); // 1.5 -> 2
        assertThat(Minor.pctOff(2797, 10_000)).isEqualTo(0);
    }

    @Test
    void roundingRowsOfPricingModelSection86() {
        assertThat(AnnualPrices.derive(1999, 1000)).isEqualTo(21589); // 21589.2
        assertThat(Minor.mulDivHalfEven(9588, 9200, 10_000)).isEqualTo(8821); // 8820.96
        assertThat(AnnualPrices.derive(199, 1000) * 1L).isEqualTo(2149); // 199 x 12 = 2388 x 0.9 = 2149.2
        assertThat(Minor.mulDivHalfEven(5988, 9100, 10_000)).isEqualTo(5449); // 5449.08
        assertThat(Minor.mulDivHalfEven(9588, 9400, 10_000)).isEqualTo(9013); // 9012.72
        assertThat(Minor.mulDivHalfEven(23787, 22_896_000L, 31_536_000L)).isEqualTo(17270); // 17270.04
        assertThat(Minor.mulDivHalfEven(32367, 1, 12)).isEqualTo(2697); // 2697.25
        assertThat(Minor.mulDivHalfEven(86504, 1, 12)).isEqualTo(7209); // 7208.67
        assertThat(Minor.mulDivHalfEven(1250, 5000, 10_000)).isEqualTo(625);
        assertThat(Minor.mulDivHalfEven(1251, 5000, 10_000)).isEqualTo(626); // 625.5 -> even
    }

    @Test
    void negativeValuesRoundHalfEvenToo() {
        assertThat(Minor.mulDivHalfEven(-5, 1, 2)).isEqualTo(-2); // -2.5 -> -2
        assertThat(Minor.mulDivHalfEven(-3, 1, 2)).isEqualTo(-2); // -1.5 -> -2
        assertThat(Minor.mulDivHalfEven(-7, 1, 3)).isEqualTo(-2); // -2.33
        assertThat(Minor.mulDivHalfEven(-8, 1, 3)).isEqualTo(-3); // -2.67
    }

    @Test
    void overflowFallsBackToExactArithmetic() {
        long big = Long.MAX_VALUE / 2;
        assertThat(Minor.mulDivHalfEven(big, 4, 4)).isEqualTo(big);
        assertThat(Minor.mulDivHalfEven(Long.MAX_VALUE, 1_000_000, 1_000_000)).isEqualTo(Long.MAX_VALUE);
        assertThatThrownBy(() -> Minor.mulDivHalfEven(Long.MAX_VALUE, 3, 1)).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void invalidArgumentsAreRefused() {
        assertThatThrownBy(() -> Minor.mulDivHalfEven(1, 1, 0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Minor.pctOff(1, 10_001)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> Minor.pctOff(1, -1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void ceilDivRoundsUpForPositiveAndNegative() {
        assertThat(Minor.ceilDiv(7, 2)).isEqualTo(4);
        assertThat(Minor.ceilDiv(8, 2)).isEqualTo(4);
        assertThat(Minor.ceilDiv(-7, 2)).isEqualTo(-3);
        assertThat(Minor.ceilDiv(0, 5)).isEqualTo(0);
    }

    @Test
    void agreesWithBigDecimalHalfEvenOnThousandsOfRandomInputs() {
        Random r = new Random(42);
        for (int i = 0; i < 5000; i++) {
            long amount = r.nextInt(2_000_000) - 1_000_000;
            long num = r.nextInt(20_000) + 1;
            long den = r.nextInt(100_000) + 1;
            long expected = new BigDecimal(amount).multiply(new BigDecimal(num)).divide(new BigDecimal(den), 0, RoundingMode.HALF_EVEN).longValueExact();
            assertThat(Minor.mulDivHalfEven(amount, num, den)).as("%d * %d / %d", amount, num, den).isEqualTo(expected);
        }
    }
}
