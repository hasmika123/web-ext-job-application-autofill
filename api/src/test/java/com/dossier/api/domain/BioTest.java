package com.dossier.api.domain;

import static com.dossier.api.domain.BioTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class BioTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(Bio.class);
        Bio bio1 = getBioSample1();
        Bio bio2 = new Bio();
        assertThat(bio1).isNotEqualTo(bio2);

        bio2.setId(bio1.getId());
        assertThat(bio1).isEqualTo(bio2);

        bio2 = getBioSample2();
        assertThat(bio1).isNotEqualTo(bio2);
    }
}
