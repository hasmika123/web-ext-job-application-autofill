package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.AdminMfaChallenge;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AdminMfaChallengeRepository;
import com.dossier.api.repository.UserRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Unit tests for admin email-OTP MFA (Phase 9.X.3) — the gating + challenge/verify logic. */
class AdminMfaServiceTest {

    private AdminMfaChallengeRepository repository;
    private UserRepository userRepository;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();
    private MailService mailService;

    @BeforeEach
    void setUp() {
        repository = Mockito.mock(AdminMfaChallengeRepository.class);
        userRepository = Mockito.mock(UserRepository.class);
        mailService = Mockito.mock(MailService.class);
        when(repository.save(any(AdminMfaChallenge.class))).thenAnswer(i -> i.getArgument(0));
    }

    private AdminMfaService service(boolean enabled) {
        return new AdminMfaService(repository, userRepository, encoder, mailService, enabled, 600);
    }

    @Test
    void shouldChallengeOnlyWhenEnabledAndAdmin() {
        assertThat(service(true).shouldChallenge("ROLE_ADMIN ROLE_USER")).isTrue();
        assertThat(service(true).shouldChallenge("ROLE_USER")).isFalse();
        assertThat(service(false).shouldChallenge("ROLE_ADMIN")).isFalse();
    }

    @Test
    void startChallengeEmailsCodeWhenUserHasEmail() {
        User u = new User();
        u.setLogin("admin");
        u.setEmail("admin@kiwiply.com");
        when(userRepository.findOneByLogin("admin")).thenReturn(Optional.of(u));

        Optional<String> token = service(true).startChallenge("admin", 1L, "ROLE_ADMIN");

        assertThat(token).isPresent();
        ArgumentCaptor<AdminMfaChallenge> captor = ArgumentCaptor.forClass(AdminMfaChallenge.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getCodeHash()).isNotBlank();
        assertThat(captor.getValue().getExpiresAt()).isAfter(Instant.now());
        verify(mailService).sendEmail(eqEmail(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void startChallengeSkippedWhenNoEmail() {
        User u = new User();
        u.setLogin("admin");
        u.setEmail(null);
        when(userRepository.findOneByLogin("admin")).thenReturn(Optional.of(u));

        assertThat(service(true).startChallenge("admin", 1L, "ROLE_ADMIN")).isEmpty();
        verify(repository, never()).save(any());
        verify(mailService, never()).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
    }

    @Test
    void verifyAcceptsCorrectCodeAndConsumesChallenge() {
        AdminMfaChallenge c = challenge("123456", Instant.now().plusSeconds(300), 0);
        when(repository.findByMfaToken("tok")).thenReturn(Optional.of(c));

        Optional<AdminMfaService.VerifiedClaims> claims = service(true).verify("tok", "123456");

        assertThat(claims).isPresent();
        assertThat(claims.get().login()).isEqualTo("admin");
        assertThat(claims.get().authorities()).isEqualTo("ROLE_ADMIN ROLE_USER");
        verify(repository).delete(c);
    }

    @Test
    void verifyRejectsWrongCodeAndCountsAttempt() {
        AdminMfaChallenge c = challenge("123456", Instant.now().plusSeconds(300), 0);
        when(repository.findByMfaToken("tok")).thenReturn(Optional.of(c));

        assertThat(service(true).verify("tok", "000000")).isEmpty();
        assertThat(c.getAttempts()).isEqualTo(1);
        verify(repository).save(c);
        verify(repository, never()).delete(c);
    }

    @Test
    void verifyRejectsExpiredAndDeletes() {
        AdminMfaChallenge c = challenge("123456", Instant.now().minusSeconds(1), 0);
        when(repository.findByMfaToken("tok")).thenReturn(Optional.of(c));

        assertThat(service(true).verify("tok", "123456")).isEmpty();
        verify(repository).delete(c);
    }

    @Test
    void verifyBurnsChallengeAfterMaxAttempts() {
        AdminMfaChallenge c = challenge("123456", Instant.now().plusSeconds(300), 4); // 5th wrong try
        when(repository.findByMfaToken("tok")).thenReturn(Optional.of(c));

        assertThat(service(true).verify("tok", "000000")).isEmpty();
        verify(repository).delete(c);
    }

    @Test
    void verifyUnknownTokenIsEmpty() {
        when(repository.findByMfaToken("nope")).thenReturn(Optional.empty());
        assertThat(service(true).verify("nope", "123456")).isEmpty();
    }

    private AdminMfaChallenge challenge(String code, Instant expires, int attempts) {
        AdminMfaChallenge c = new AdminMfaChallenge();
        c.setMfaToken("tok");
        c.setLogin("admin");
        c.setUserId(1L);
        c.setAuthorities("ROLE_ADMIN ROLE_USER");
        c.setCodeHash(encoder.encode(code));
        c.setExpiresAt(expires);
        c.setAttempts(attempts);
        return c;
    }

    private static String eqEmail() {
        return org.mockito.ArgumentMatchers.eq("admin@kiwiply.com");
    }
}
