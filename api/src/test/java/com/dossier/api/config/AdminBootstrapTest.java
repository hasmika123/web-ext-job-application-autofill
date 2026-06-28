package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dossier.api.domain.Authority;
import com.dossier.api.domain.User;
import com.dossier.api.repository.AuthorityRepository;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.security.AuthoritiesConstants;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;

/** Unit tests for the env-driven admin bootstrap (Phase 9.A0). */
class AdminBootstrapTest {

    // A well-formed bcrypt hash (the format is what matters here, not the password behind it).
    private static final String VALID_HASH = "$2a$10$gSAhZrxMllrbgj/kkK9UceBPpChGWJA7SYIb1Mqo.n5aNLq1/oRrC";

    private UserRepository userRepository;
    private AuthorityRepository authorityRepository;
    private AdminBootstrapProperties props;
    private AdminBootstrap bootstrap;

    @BeforeEach
    void setUp() {
        userRepository = Mockito.mock(UserRepository.class);
        authorityRepository = Mockito.mock(AuthorityRepository.class);
        props = new AdminBootstrapProperties();
        bootstrap = new AdminBootstrap(props, userRepository, authorityRepository);
        // Roles already exist in the DB (seeded contextless); return them on lookup.
        when(authorityRepository.findById(anyString())).thenAnswer(inv -> {
            Authority a = new Authority();
            a.setName(inv.getArgument(0));
            return Optional.of(a);
        });
        when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void bcryptFormatValidation() {
        assertThat(AdminBootstrap.isBcryptHash(VALID_HASH)).isTrue();
        assertThat(AdminBootstrap.isBcryptHash("$2y$10$" + "a".repeat(53))).isTrue();
        assertThat(AdminBootstrap.isBcryptHash("plaintext-password")).isFalse();
        assertThat(AdminBootstrap.isBcryptHash("$2a$10$tooShort")).isFalse();
        assertThat(AdminBootstrap.isBcryptHash(null)).isFalse();
        // right length, wrong prefix
        assertThat(AdminBootstrap.isBcryptHash("x".repeat(60))).isFalse();
    }

    @Test
    void skipsWhenEnvUnset() {
        props.setEmail("");
        props.setPasswordHash("");
        bootstrap.bootstrapAdmin();
        verify(userRepository, never()).save(any());
    }

    @Test
    void skipsWhenHashIsNotBcrypt() {
        props.setEmail("admin@kiwiply.com");
        props.setPasswordHash("hunter2"); // plaintext — must be rejected
        bootstrap.bootstrapAdmin();
        verify(userRepository, never()).save(any());
    }

    @Test
    void createsAdminWhenNoneExists() {
        props.setEmail("Admin@Kiwiply.com");
        props.setPasswordHash(VALID_HASH);
        props.setLogin("admin");
        when(userRepository.findOneByEmailIgnoreCase("Admin@Kiwiply.com")).thenReturn(Optional.empty());
        when(userRepository.findOneByLogin("admin")).thenReturn(Optional.empty());

        bootstrap.bootstrapAdmin();

        ArgumentCaptor<User> captor = ArgumentCaptor.forClass(User.class);
        verify(userRepository).save(captor.capture());
        User saved = captor.getValue();
        assertThat(saved.getLogin()).isEqualTo("admin");
        assertThat(saved.getEmail()).isEqualTo("Admin@Kiwiply.com");
        assertThat(saved.getPassword()).isEqualTo(VALID_HASH);
        assertThat(saved.isActivated()).isTrue();
        assertThat(saved.getAuthorities()).extracting(Authority::getName).containsExactlyInAnyOrder(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER);
    }

    @Test
    void promotesExistingUserMatchedByEmail() {
        User existing = new User();
        existing.setLogin("someuser");
        existing.setEmail("admin@kiwiply.com");
        existing.setPassword("$2a$10$oldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldoldold");
        existing.setActivated(false);
        Authority userRole = new Authority();
        userRole.setName(AuthoritiesConstants.USER);
        existing.getAuthorities().add(userRole);

        props.setEmail("admin@kiwiply.com");
        props.setPasswordHash(VALID_HASH);
        when(userRepository.findOneByEmailIgnoreCase("admin@kiwiply.com")).thenReturn(Optional.of(existing));

        bootstrap.bootstrapAdmin();

        verify(userRepository).save(existing);
        assertThat(existing.isActivated()).isTrue();
        assertThat(existing.getPassword()).isEqualTo(VALID_HASH);
        assertThat(existing.getLogin()).isEqualTo("someuser"); // login is not changed on an existing account
        assertThat(existing.getAuthorities()).extracting(Authority::getName).contains(AuthoritiesConstants.ADMIN, AuthoritiesConstants.USER);
    }

    @Test
    void runNeverThrowsEvenWhenRepositoryFails() {
        props.setEmail("admin@kiwiply.com");
        props.setPasswordHash(VALID_HASH);
        when(userRepository.findOneByEmailIgnoreCase(anyString())).thenThrow(new RuntimeException("db down"));
        // Must swallow the exception so a bad config never crashes startup.
        bootstrap.run(null);
        verify(userRepository, never()).save(any());
    }
}
