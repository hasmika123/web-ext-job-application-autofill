package com.dossier.api.service.mapper;

import static com.dossier.api.domain.ApplicationAsserts.*;
import static com.dossier.api.domain.ApplicationTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ApplicationMapperTest {

    private ApplicationMapper applicationMapper;

    @BeforeEach
    void setUp() {
        applicationMapper = new ApplicationMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getApplicationSample1();
        var actual = applicationMapper.toEntity(applicationMapper.toDto(expected));
        assertApplicationAllPropertiesEquals(expected, actual);
    }
}
