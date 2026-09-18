package com.dossier.api.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * The detection logic behind the startup mail check. The point of the check is that a missing
 * SMTP config currently looks exactly like success — so these cases are the ones that must not
 * be reported as fine.
 */
class MailConfigurationCheckTest {

    private static final String GOOD_HOST = "smtp-relay.brevo.com";
    private static final String GOOD_USER = "abc123@smtp-brevo.com";
    private static final String GOOD_FROM = "no-reply@kiwiply.com";
    private static final String GOOD_BASE = "https://kiwiply.com";

    @Test
    void fullyConfiguredMailReportsNoProblems() {
        assertThat(MailConfigurationCheck.problems(GOOD_HOST, GOOD_USER, GOOD_FROM, GOOD_BASE)).isEmpty();
    }

    @Test
    void unsetHostIsReported() {
        // What an .env missing MAIL_HOST actually produces.
        assertThat(MailConfigurationCheck.problems(null, GOOD_USER, GOOD_FROM, GOOD_BASE)).singleElement().asString().contains("MAIL_HOST");
        assertThat(MailConfigurationCheck.problems("", GOOD_USER, GOOD_FROM, GOOD_BASE)).hasSize(1);
        assertThat(MailConfigurationCheck.problems("   ", GOOD_USER, GOOD_FROM, GOOD_BASE)).hasSize(1);
    }

    @Test
    void theApplicationPropertyDefaultsCountAsUnset() {
        // application-prod.yml falls back to these when the env var is absent. They must NOT read
        // as "configured" — that fallback is the whole reason the failure was silent.
        assertThat(MailConfigurationCheck.problems(MailConfigurationCheck.DEFAULT_HOST, GOOD_USER, GOOD_FROM, GOOD_BASE)).hasSize(1);
        assertThat(MailConfigurationCheck.problems(GOOD_HOST, GOOD_USER, MailConfigurationCheck.DEFAULT_FROM, GOOD_BASE)).hasSize(1);
        assertThat(MailConfigurationCheck.problems(GOOD_HOST, GOOD_USER, GOOD_FROM, MailConfigurationCheck.DEFAULT_BASE_URL)).hasSize(1);
    }

    @Test
    void missingCredentialsAreReportedBecauseSmtpAuthIsOn() {
        assertThat(MailConfigurationCheck.problems(GOOD_HOST, null, GOOD_FROM, GOOD_BASE)).singleElement().asString().contains("MAIL_USERNAME");
    }

    @Test
    void aLocalhostBaseUrlIsReportedBecauseActivationLinksWouldBeUnusable() {
        // A reachable SMTP server with the wrong base URL still breaks signup: the email arrives
        // but its link points at localhost.
        assertThat(MailConfigurationCheck.problems(GOOD_HOST, GOOD_USER, GOOD_FROM, MailConfigurationCheck.DEFAULT_BASE_URL))
            .singleElement()
            .asString()
            .contains("MAIL_BASE_URL");
    }

    @Test
    void anEntirelyUnconfiguredProdBoxReportsEveryProblem() {
        // Exactly the 2026-09-17 rebuild: .env reconstructed with no MAIL_* at all.
        List<String> found = MailConfigurationCheck.problems(
            MailConfigurationCheck.DEFAULT_HOST,
            "",
            MailConfigurationCheck.DEFAULT_FROM,
            MailConfigurationCheck.DEFAULT_BASE_URL
        );
        assertThat(found).hasSize(4);
        assertThat(String.join(" ", found)).contains("MAIL_HOST", "MAIL_USERNAME", "MAIL_FROM", "MAIL_BASE_URL");
    }
}
