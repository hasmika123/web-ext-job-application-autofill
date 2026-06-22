package com.dossier.api.service.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class BioDTOTest {

    @Test
    void dtoEqualsVerifier() throws Exception {
        TestUtil.equalsVerifier(BioDTO.class);
        BioDTO bioDTO1 = new BioDTO();
        bioDTO1.setId(1L);
        BioDTO bioDTO2 = new BioDTO();
        assertThat(bioDTO1).isNotEqualTo(bioDTO2);
        bioDTO2.setId(bioDTO1.getId());
        assertThat(bioDTO1).isEqualTo(bioDTO2);
        bioDTO2.setId(2L);
        assertThat(bioDTO1).isNotEqualTo(bioDTO2);
        bioDTO1.setId(null);
        assertThat(bioDTO1).isNotEqualTo(bioDTO2);
    }
}
