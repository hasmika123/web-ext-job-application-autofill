package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.resume.ResumeDocumentValidator.Limits;
import com.fasterxml.jackson.databind.JsonNode;

/**
 * The injected {@link Limits} (R2.0): the defaults are the R0 constants, and a tighter limit makes a
 * document that fit before fail with the same path as the constant did.
 */
class ResumeDocumentValidatorLimitsTest {

    private static JsonNode doc(int sections, int bulletsInItem, int bulletChars) {
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < sections; i++) {
            if (i > 0) s.append(',');
            s.append("{\"id\":\"s_cust00").append(i).append("\",\"kind\":\"CUSTOM\",\"title\":\"C\",\"hidden\":false,\"items\":[");
            if (i == 0) {
                s.append("{\"id\":\"i_cust001\",\"bullets\":[");
                for (int b = 0; b < bulletsInItem; b++) {
                    if (b > 0) s.append(',');
                    s.append("{\"id\":\"b_bul00").append(String.format("%02d", b)).append("\",\"text\":\"").append("x".repeat(bulletChars)).append("\"}");
                }
                s.append("]}");
            }
            s.append("]}");
        }
        return ResumeDocument.parse("{\"schema\":1,\"meta\":{\"title\":\"T\"},\"basics\":{},\"sections\":[" + s + "]}");
    }

    @org.junit.jupiter.api.Test
    void defaultsAreTheR0Constants() {
        assertThat(Limits.DEFAULTS)
            .isEqualTo(new Limits(ResumeDocumentValidator.MAX_BYTES, 20, 40, 12, 600, 2000, 64));
        assertThat(ResumeDocumentValidator.validate(doc(3, 12, 600))).isEmpty();
        assertThat(ResumeDocumentValidator.validate(doc(3, 12, 600), Limits.DEFAULTS)).isEmpty();
    }

    @org.junit.jupiter.api.Test
    void tighterLimitsRefuseWhatTheDefaultsAccept() {
        Limits tight = new Limits(ResumeDocumentValidator.MAX_BYTES, 2, 40, 3, 50, 2000, 64);

        assertThat(ResumeDocumentValidator.validate(doc(3, 1, 10), tight).orElseThrow().path()).isEqualTo("$.sections");
        assertThat(ResumeDocumentValidator.validate(doc(1, 4, 10), tight).orElseThrow().path()).isEqualTo("$.sections[0].items[0].bullets");
        assertThat(ResumeDocumentValidator.validate(doc(1, 1, 51), tight).orElseThrow().path()).endsWith(".bullets[0].text");
        assertThat(ResumeDocumentValidator.validate(doc(2, 3, 50), tight)).isEmpty();
    }

    @org.junit.jupiter.api.Test
    void aSmallerByteLimitIsATooLargeViolation() {
        Limits tiny = new Limits(200, 20, 40, 12, 600, 2000, 64);
        var v = ResumeDocumentValidator.validate(doc(3, 3, 100), tiny).orElseThrow();
        assertThat(v.tooLarge()).isTrue();
        assertThat(v.path()).isEqualTo("$");
    }
}
