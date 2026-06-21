package com.dossier.api.service.dto;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class FieldCacheDTOTest {

    @Test
    void dtoEqualsVerifier() throws Exception {
        TestUtil.equalsVerifier(FieldCacheDTO.class);
        FieldCacheDTO fieldCacheDTO1 = new FieldCacheDTO();
        fieldCacheDTO1.setId(1L);
        FieldCacheDTO fieldCacheDTO2 = new FieldCacheDTO();
        assertThat(fieldCacheDTO1).isNotEqualTo(fieldCacheDTO2);
        fieldCacheDTO2.setId(fieldCacheDTO1.getId());
        assertThat(fieldCacheDTO1).isEqualTo(fieldCacheDTO2);
        fieldCacheDTO2.setId(2L);
        assertThat(fieldCacheDTO1).isNotEqualTo(fieldCacheDTO2);
        fieldCacheDTO1.setId(null);
        assertThat(fieldCacheDTO1).isNotEqualTo(fieldCacheDTO2);
    }
}
