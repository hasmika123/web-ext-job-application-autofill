package com.dossier.api.domain;

import static com.dossier.api.domain.AiAnswerTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class AiAnswerTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(AiAnswer.class);
        AiAnswer aiAnswer1 = getAiAnswerSample1();
        AiAnswer aiAnswer2 = new AiAnswer();
        assertThat(aiAnswer1).isNotEqualTo(aiAnswer2);

        aiAnswer2.setId(aiAnswer1.getId());
        assertThat(aiAnswer1).isEqualTo(aiAnswer2);

        aiAnswer2 = getAiAnswerSample2();
        assertThat(aiAnswer1).isNotEqualTo(aiAnswer2);
    }
}
