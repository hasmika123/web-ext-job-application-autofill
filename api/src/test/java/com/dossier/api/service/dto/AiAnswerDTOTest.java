package com.dossier.api.service.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class AiAnswerDTOTest {

    @Test
    void dtoEqualsVerifier() throws Exception {
        TestUtil.equalsVerifier(AiAnswerDTO.class);
        AiAnswerDTO aiAnswerDTO1 = new AiAnswerDTO();
        aiAnswerDTO1.setId(1L);
        AiAnswerDTO aiAnswerDTO2 = new AiAnswerDTO();
        assertThat(aiAnswerDTO1).isNotEqualTo(aiAnswerDTO2);
        aiAnswerDTO2.setId(aiAnswerDTO1.getId());
        assertThat(aiAnswerDTO1).isEqualTo(aiAnswerDTO2);
        aiAnswerDTO2.setId(2L);
        assertThat(aiAnswerDTO1).isNotEqualTo(aiAnswerDTO2);
        aiAnswerDTO1.setId(null);
        assertThat(aiAnswerDTO1).isNotEqualTo(aiAnswerDTO2);
    }
}
