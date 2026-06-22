package com.dossier.api.domain;

import static com.dossier.api.domain.FieldCacheTestSamples.*;
import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.web.rest.TestUtil;
import org.junit.jupiter.api.Test;

class FieldCacheTest {

    @Test
    void equalsVerifier() throws Exception {
        TestUtil.equalsVerifier(FieldCache.class);
        FieldCache fieldCache1 = getFieldCacheSample1();
        FieldCache fieldCache2 = new FieldCache();
        assertThat(fieldCache1).isNotEqualTo(fieldCache2);

        fieldCache2.setId(fieldCache1.getId());
        assertThat(fieldCache1).isEqualTo(fieldCache2);

        fieldCache2 = getFieldCacheSample2();
        assertThat(fieldCache1).isNotEqualTo(fieldCache2);
    }
}
