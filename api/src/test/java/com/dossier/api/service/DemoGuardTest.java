package com.dossier.api.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/** Unit tests for the demo read-only / disabled guards (phase demo). */
class DemoGuardTest {

    private DemoAccountService accounts;
    private DemoGuard guard;

    @BeforeEach
    void setUp() {
        accounts = mock(DemoAccountService.class);
        when(accounts.isDemo("demo")).thenReturn(true);
        when(accounts.isDemo("demo-org")).thenReturn(true);
        when(accounts.isDemoIdentifier("demo")).thenReturn(true);
        when(accounts.isDemoIdentifier("demo@kiwiply.com")).thenReturn(true);
        guard = new DemoGuard(accounts, false);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private static void signIn(String login) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(login, null));
    }

    @Test
    void aDemoAccountIsRefusedWithDemoReadOnly() {
        signIn("demo");

        assertThatThrownBy(guard::assertNotDemo)
            .isInstanceOf(DemoException.class)
            .satisfies(e -> {
                assertThat(((DemoException) e).getCode()).isEqualTo("DEMO_READ_ONLY");
                assertThat(e.getMessage()).isEqualTo("This is a demo account — changes aren't saved");
            });
    }

    @Test
    void theOrgDemoAccountIsRefusedToo() {
        signIn("demo-org");

        assertThatThrownBy(guard::assertNotDemo).isInstanceOf(DemoException.class);
    }

    @Test
    void aRealUserPasses() {
        signIn("jane");

        assertThatCode(guard::assertNotDemo).doesNotThrowAnyException();
    }

    @Test
    void nobodySignedInPasses() {
        assertThatCode(guard::assertNotDemo).doesNotThrowAnyException();
    }

    @Test
    void aDemoLoginIsRefusedWhileTheSwitchIsOff() {
        when(accounts.isEnabled()).thenReturn(false);

        assertThatThrownBy(() -> guard.assertLoginAllowed("demo"))
            .isInstanceOf(DemoException.class)
            .satisfies(e -> assertThat(((DemoException) e).getCode()).isEqualTo("DEMO_DISABLED"));
        assertThatThrownBy(() -> guard.assertLoginAllowed("demo@kiwiply.com")).isInstanceOf(DemoException.class);
    }

    @Test
    void aDemoLoginPassesWhileTheSwitchIsOn() {
        when(accounts.isEnabled()).thenReturn(true);

        assertThatCode(() -> guard.assertLoginAllowed("demo")).doesNotThrowAnyException();
    }

    @Test
    void aRealLoginPassesWhateverTheSwitch() {
        when(accounts.isEnabled()).thenReturn(false);

        assertThatCode(() -> guard.assertLoginAllowed("jane")).doesNotThrowAnyException();
    }
}
