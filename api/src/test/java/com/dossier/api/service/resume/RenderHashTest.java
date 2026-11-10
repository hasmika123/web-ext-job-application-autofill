package com.dossier.api.service.resume;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

/** The render hash (DESIGN 8.5). The golden vectors are the same ones {@code json.test.ts} pins on the TS side. */
class RenderHashTest {

    private static final String CONTENT = "0123456789abcdef".repeat(4);
    private final ObjectMapper om = new ObjectMapper();

    @Test
    void goldenVectorMatchesTheTypeScriptTwin() throws Exception {
        // the theme is canonicalised: sorted keys, trimmed string values
        var theme = om.readTree("{\"spacing\":\"normal\",\"accent\":\" #16a34a \"}");
        assertThat(ResumeRenderHash.compute(CONTENT, "modern", theme))
            .isEqualTo("7d7edf32bfb8ad518debac946f80b41bc9be5a960eeea991ef5be78a70657c93");
        assertThat(ResumeRenderHash.compute(CONTENT, "classic", om.readTree("{}")))
            .isEqualTo("02ef0e88814b8be4dfdaeafa136e00b28de4bb395ad6748d28b61b5a24cf2d0e");
    }

    @Test
    void nullAbsentAndEmptyThemeAreTheSame() throws Exception {
        String empty = ResumeRenderHash.compute(CONTENT, "classic", om.readTree("{}"));
        assertThat(ResumeRenderHash.compute(CONTENT, "classic", null)).isEqualTo(empty);
        assertThat(ResumeRenderHash.compute(CONTENT, "classic", om.nullNode())).isEqualTo(empty);
    }

    @Test
    void templateThemeAndContentEachMoveTheHash() throws Exception {
        String base = ResumeRenderHash.compute(CONTENT, "modern", om.readTree("{\"accent\":\"#16a34a\"}"));
        assertThat(ResumeRenderHash.compute(CONTENT, "classic", om.readTree("{\"accent\":\"#16a34a\"}"))).isNotEqualTo(base);
        assertThat(ResumeRenderHash.compute(CONTENT, "modern", om.readTree("{\"accent\":\"#2563eb\"}"))).isNotEqualTo(base);
        assertThat(ResumeRenderHash.compute("f".repeat(64), "modern", om.readTree("{\"accent\":\"#16a34a\"}"))).isNotEqualTo(base);
    }

    @Test
    void keyOrderAndEdgeWhitespaceInTheThemeDoNotMoveTheHash() throws Exception {
        assertThat(ResumeRenderHash.compute(CONTENT, "modern", om.readTree("{\"a\":\"x\",\"b\":1}")))
            .isEqualTo(ResumeRenderHash.compute(CONTENT, "modern", om.readTree("{\"b\":1,\"a\":\" x \"}")));
    }
}
