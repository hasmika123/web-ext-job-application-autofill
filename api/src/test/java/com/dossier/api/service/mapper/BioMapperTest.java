package com.dossier.api.service.mapper;

import static com.dossier.api.domain.BioAsserts.*;
import static com.dossier.api.domain.BioTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class BioMapperTest {

    private BioMapper bioMapper;

    @BeforeEach
    void setUp() {
        bioMapper = new BioMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getBioSample1();
        var actual = bioMapper.toEntity(bioMapper.toDto(expected));
        assertBioAllPropertiesEquals(expected, actual);
    }
}
