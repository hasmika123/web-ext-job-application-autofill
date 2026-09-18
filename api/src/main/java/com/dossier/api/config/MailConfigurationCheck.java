package com.dossier.api.config;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.mail.MailProperties;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import tech.jhipster.config.JHipsterConstants;
import tech.jhipster.config.JHipsterProperties;

/**
 * Shouts at startup when production has no usable SMTP configuration.
 *
 * <p><strong>Why this exists.</strong> Mail sending is {@code @Async} and
 * {@link com.dossier.api.service.MailService} catches {@code MailException} and logs a WARN, so an
 * unconfigured or wrong SMTP host fails <em>silently</em>: signup returns 201, the user is told to
 * check their inbox, and nothing is ever sent. Because new accounts are created <em>inactive</em>
 * and the activation link is the only way in, that is not a degraded feature — every signup is
 * stranded and cannot log in at all. It looks like success from every angle except the user's inbox.
 *
 * <p>That is exactly what happened after the 2026-09-17 server rebuild: the box's {@code .env} was
 * reconstructed without the {@code MAIL_*} values (the Brevo SMTP key lives only in a password
 * manager — GitHub secrets are write-only and never held it), and nothing anywhere said so.
 *
 * <p>This runner turns that into one loud ERROR on the first boot instead of a puzzle later. It
 * only reports; it never blocks startup. A mail misconfiguration must not take the API down for
 * everyone already signed in, and failing closed here would turn a bad signup flow into an outage.
 *
 * <p>Production only ({@code prod} profile) — dev deliberately runs without SMTP.
 *
 * @see <code>DEPLOY.md</code> §9 for the Brevo setup and the exact env vars.
 */
@Component
@Profile(JHipsterConstants.SPRING_PROFILE_PRODUCTION)
public class MailConfigurationCheck implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(MailConfigurationCheck.class);

    /** The application-prod.yml fallbacks. Seeing one of these means the env var was never set. */
    static final String DEFAULT_HOST = "localhost";
    static final String DEFAULT_FROM = "no-reply@localhost";
    static final String DEFAULT_BASE_URL = "http://localhost:3000";

    private final MailProperties mailProperties;
    private final JHipsterProperties jHipsterProperties;

    public MailConfigurationCheck(MailProperties mailProperties, JHipsterProperties jHipsterProperties) {
        this.mailProperties = mailProperties;
        this.jHipsterProperties = jHipsterProperties;
    }

    /**
     * Returns one human-readable problem per unusable setting, empty when mail looks configured.
     * Pure and static so it can be tested without a Spring context.
     */
    static List<String> problems(String host, String username, String from, String baseUrl) {
        List<String> found = new ArrayList<>();
        if (isBlank(host) || DEFAULT_HOST.equals(host)) {
            found.add("MAIL_HOST is unset (resolved to '" + orNone(host) + "') — no SMTP server to send through");
        }
        if (isBlank(username)) {
            found.add("MAIL_USERNAME is unset — Brevo SMTP requires auth (smtp.auth=true)");
        }
        if (isBlank(from) || DEFAULT_FROM.equals(from)) {
            found.add("MAIL_FROM is unset (resolved to '" + orNone(from) + "') — must be a verified sender address");
        }
        if (isBlank(baseUrl) || DEFAULT_BASE_URL.equals(baseUrl)) {
            found.add("MAIL_BASE_URL resolved to '" + orNone(baseUrl) + "' — activation links would point at localhost");
        }
        return found;
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String orNone(String s) {
        return isBlank(s) ? "<empty>" : s;
    }

    @Override
    public void run(ApplicationArguments args) {
        String host = mailProperties.getHost();
        String username = mailProperties.getUsername();
        String from = jHipsterProperties.getMail().getFrom();
        String baseUrl = jHipsterProperties.getMail().getBaseUrl();

        List<String> found = problems(host, username, from, baseUrl);
        if (found.isEmpty()) {
            LOG.info("Mail is configured: host={} port={} from={}", host, mailProperties.getPort(), from);
            return;
        }

        LOG.error(
            "EMAIL IS NOT CONFIGURED — signup activation emails will NOT be sent, and because new " +
            "accounts are created inactive, nobody who signs up will be able to log in. Sending fails " +
            "silently (MailService is @Async and swallows the error), so this message is the only warning " +
            "you get. Problems: {}. Fix: set these in the VPS .env and recreate the api container " +
            "(DEPLOY.md §9 — use the shared-edge overlay).",
            String.join("; ", found)
        );
    }
}
