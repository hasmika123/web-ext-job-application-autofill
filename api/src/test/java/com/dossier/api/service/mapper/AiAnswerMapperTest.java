package com.dossier.api.service.mapper;

import static com.dossier.api.domain.AiAnswerAsserts.*;
import static com.dossier.api.domain.AiAnswerTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class AiAnswerMapperTest {

    private AiAnswerMapper aiAnswerMapper;

    @BeforeEach
    void setUp() {
        aiAnswerMapper = new AiAnswerMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getAiAnswerSample1();
        var actual = aiAnswerMapper.toEntity(aiAnswerMapper.toDto(expected));
        assertAiAnswerAllPropertiesEquals(expected, actual);
    }
}
