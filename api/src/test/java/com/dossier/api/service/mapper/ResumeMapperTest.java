package com.dossier.api.service.mapper;

import static com.dossier.api.domain.ResumeAsserts.*;
import static com.dossier.api.domain.ResumeTestSamples.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class ResumeMapperTest {

    private ResumeMapper resumeMapper;

    @BeforeEach
    void setUp() {
        resumeMapper = new ResumeMapperImpl();
    }

    @Test
    void shouldConvertToDtoAndBack() {
        var expected = getResumeSample1();
        var actual = resumeMapper.toEntity(resumeMapper.toDto(expected));
        assertResumeAllPropertiesEquals(expected, actual);
    }
}
