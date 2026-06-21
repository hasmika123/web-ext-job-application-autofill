package com.dossier.api.service.mapper;

import static com.dossier.api.domain.FieldCacheAsserts.*;
import static com.dossier.api.domain.FieldCacheTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class FieldCacheMapperTest {

    private FieldCacheMapper fieldCacheMapper;

    @BeforeEach
    void setUp() {
        fieldCacheMapper = new FieldCacheMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getFieldCacheSample1();
        var actual = fieldCacheMapper.toEntity(fieldCacheMapper.toDto(expected));
        assertFieldCacheAllPropertiesEquals(expected, actual);
    }
}
