package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AiAnswer;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AiAnswerRepository;
import com.dossier.api.repository.UserRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.dao.DataIntegrityViolationException;

/** Unit tests for the server-side answer cache: hash normalization, lookup, and store. */
class AiAnswerCacheServiceTest {

    private AiAnswerRepository aiAnswerRepository;
    private UserRepository userRepository;
    private AiAnswerCacheService cache;

    @BeforeEach
    void setUp() {
        aiAnswerRepository = Mockito.mock(AiAnswerRepository.class);
        userRepository = Mockito.mock(UserRepository.class);
        cache = new AiAnswerCacheService(aiAnswerRepository, userRepository);
    }

    @Test
    void questionHashIsStableAndNormalized() {
        String a = AiAnswerCacheService.questionHash("Why do you want this job?");
        // case, trailing punctuation, and collapsed whitespace don't change the key
        String b = AiAnswerCacheService.questionHash("  why   do you want this JOB  ");
        assertThat(a).isEqualTo(b);
        assertThat(a).hasSize(64).matches("[0-9a-f]{64}"); // SHA-256 hex
        // a genuinely different question hashes differently
        assertThat(AiAnswerCacheService.questionHash("Tell me about yourself")).isNotEqualTo(a);
    }

    @Test
    void lookupReturnsStoredAnswer() {
        AiAnswer entry = new AiAnswer().answer("cached text").questionHash("h");
        when(aiAnswerRepository.findOneByUserLoginAndQuestionHash("user", "h")).thenReturn(Optional.of(entry));
        assertThat(cache.lookup("user", "h")).contains("cached text");
    }

    @Test
    void lookupMissIsEmpty() {
        when(aiAnswerRepository.findOneByUserLoginAndQuestionHash(anyString(), anyString())).thenReturn(Optional.empty());
        assertThat(cache.lookup("user", "h")).isEmpty();
    }

    @Test
    void storePersistsEntryForUser() {
        User u = new User();
        u.setLogin("user");
        when(userRepository.findOneByLogin("user")).thenReturn(Optional.of(u));

        cache.store("user", "abc123", "the answer", "gemini-2.5-flash-lite");

        ArgumentCaptor<AiAnswer> captor = ArgumentCaptor.forClass(AiAnswer.class);
        verify(aiAnswerRepository).save(captor.capture());
        AiAnswer saved = captor.getValue();
        assertThat(saved.getUser()).isEqualTo(u);
        assertThat(saved.getQuestionHash()).isEqualTo("abc123");
        assertThat(saved.getAnswer()).isEqualTo("the answer");
        assertThat(saved.getModel()).isEqualTo("gemini-2.5-flash-lite");
        assertThat(saved.getCreatedAt()).isNotNull();
    }

    @Test
    void storeSkipsWhenUserMissing() {
        when(userRepository.findOneByLogin(anyString())).thenReturn(Optional.empty());
        cache.store("ghost", "h", "a", "m");
        verify(aiAnswerRepository, never()).save(any());
    }

    @Test
    void storeBlankModelSavesNull() {
        User u = new User();
        u.setLogin("user");
        when(userRepository.findOneByLogin("user")).thenReturn(Optional.of(u));
        cache.store("user", "h", "a", "  ");
        ArgumentCaptor<AiAnswer> captor = ArgumentCaptor.forClass(AiAnswer.class);
        verify(aiAnswerRepository).save(captor.capture());
        assertThat(captor.getValue().getModel()).isNull();
    }

    @Test
    void storeSwallowsDuplicateRace() {
        User u = new User();
        u.setLogin("user");
        when(userRepository.findOneByLogin("user")).thenReturn(Optional.of(u));
        when(aiAnswerRepository.save(any())).thenThrow(new DataIntegrityViolationException("dup"));
        // a concurrent duplicate must not propagate
        cache.store("user", "h", "a", "m");
        verify(aiAnswerRepository).save(any());
    }
}
