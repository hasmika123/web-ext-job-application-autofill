package com.dossier.api.service.ops;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.dossier.api.service.MailService;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Server errors, emailed (Phase 15.1b). Every ERROR the API logs is collected by an
 * {@link ErrorDigestAppender} on the root logger; once a minute this checks whether there is
 * anything new and, if the last email went out at least {@code interval} (15 min) ago, sends the
 * admin one digest — each kind of error once, with how often it happened and a sample. So the
 * first error of a quiet day arrives within a minute, and an outage is one email every 15 minutes,
 * not thousands. In-house on purpose (user decision 2026-09-23): no error-tracking service sees
 * request data, so there is no new processor to disclose. Off without a recipient.
 */
@Service
public class ErrorDigestService {

    private static final org.slf4j.Logger LOG = LoggerFactory.getLogger(ErrorDigestService.class);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss 'UTC'").withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter CLOCK = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneOffset.UTC);

    private final ErrorDigestProperties props;
    private final MailService mail;
    private final ErrorDigest digest;
    private ErrorDigestAppender appender;
    private Instant windowStart = Instant.now();
    private Instant lastSent;

    public ErrorDigestService(ErrorDigestProperties props, MailService mail) {
        this.props = props;
        this.mail = mail;
        this.digest = new ErrorDigest(props.getMaxKinds());
    }

    @PostConstruct
    void install() {
        if (!props.isActive()) {
            LOG.info("Server-error email digest is off: no recipient (DOSSIER_ERROR_DIGEST_TO / ADMIN_EMAIL)");
            return;
        }
        if (!(LoggerFactory.getILoggerFactory() instanceof LoggerContext context)) {
            LOG.warn("Server-error email digest is off: logging isn't Logback");
            return;
        }
        appender = new ErrorDigestAppender(digest, props.getIgnoreLoggers());
        appender.setContext(context);
        appender.start();
        context.getLogger(Logger.ROOT_LOGGER_NAME).addAppender(appender);
        LOG.info("Server errors will be emailed at most every {} minutes", props.getInterval().toMinutes());
    }

    @PreDestroy
    void uninstall() {
        if (appender == null) return;
        if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
            context.getLogger(Logger.ROOT_LOGGER_NAME).detachAppender(appender);
        }
        appender.stop();
    }

    @Scheduled(fixedDelayString = "${dossier.ops.error-digest.check-ms:60000}", initialDelayString = "${dossier.ops.error-digest.check-ms:60000}")
    public void tick() {
        if (appender != null) flush(Instant.now());
    }

    /** Sends what's been collected, unless the last email was too recent. True when it sent. */
    synchronized boolean flush(Instant now) {
        if (lastSent != null && now.isBefore(lastSent.plus(props.getInterval()))) return false;
        ErrorDigest.Batch batch = digest.drain();
        if (batch.isEmpty()) return false;
        // "Since" is the first error in this email — or, if every one of them overflowed, when the
        // window opened.
        Instant since = batch.entries().stream().map(ErrorDigest.Entry::first).min(Instant::compareTo).orElse(windowStart);
        mail.sendEmail(props.recipient(), subject(batch, since), body(batch, since, now, props.getInterval().toMinutes()), false, false);
        lastSent = now;
        windowStart = now;
        return true;
    }

    ErrorDigest digest() {
        return digest;
    }

    String subject(ErrorDigest.Batch batch, Instant since) {
        int errors = batch.totalErrors();
        int kinds = batch.totalKinds();
        return (
            "[Kiwiply " +
            props.getEnvironment() +
            "] " +
            errors +
            (errors == 1 ? " server error" : " server errors") +
            (kinds > 1 ? " (" + kinds + " kinds)" : "") +
            " since " +
            CLOCK.format(since) +
            " UTC"
        );
    }

    static String body(ErrorDigest.Batch batch, Instant since, Instant now, long intervalMinutes) {
        StringBuilder out = new StringBuilder();
        out
            .append("Errors the API logged between ")
            .append(TIME.format(since))
            .append(" and ")
            .append(TIME.format(now))
            .append(", most frequent first.\n\n");
        batch
            .entries()
            .stream()
            .sorted((a, b) -> Integer.compare(b.count(), a.count()))
            .forEach(e -> {
                out.append(e.count()).append("×  ").append(e.kind().logger()).append('\n');
                out.append("    ").append(e.sample()).append('\n');
                out
                    .append("    first ")
                    .append(CLOCK.format(e.first()))
                    .append(", last ")
                    .append(CLOCK.format(e.last()))
                    .append(" UTC\n");
                if (!e.trace().isEmpty()) {
                    e.trace().lines().forEach(l -> out.append("    ").append(l).append('\n'));
                }
                out.append('\n');
            });
        if (batch.overflowErrors() > 0) {
            out
                .append("…and ")
                .append(batch.overflowErrors())
                .append(" more error(s) of ")
                .append(batch.overflowKinds())
                .append(" other kind(s) that didn't fit in this email.\n\n");
        }
        out.append("Full logs on the box: $COMPOSE logs --since 1h api  (DEPLOY.md §5).\n");
        out
            .append("You get at most one of these every ")
            .append(intervalMinutes)
            .append(" minutes; errors in between are collected, not lost.\n");
        return out.toString();
    }
}
