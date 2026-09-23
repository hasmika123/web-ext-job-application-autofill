package com.dossier.api.service.ops;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.dossier.api.service.MailService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;

/** The server-error email digest (Phase 15.1b): grouping, the cap, the appender, the throttle. */
class ErrorDigestTest {

    private static final Instant T0 = Instant.parse("2026-09-23T14:05:00Z");

    private ErrorDigestAppender attached;

    @AfterEach
    void detach() {
        if (attached != null) {
            logger("com.dossier.test").detachAppender(attached);
            attached.stop();
        }
    }

    private static Logger logger(String name) {
        return ((LoggerContext) LoggerFactory.getILoggerFactory()).getLogger(name);
    }

    @Test
    void theSameErrorIsOneLineWithACount() {
        ErrorDigest digest = new ErrorDigest(50);
        for (int i = 0; i < 60; i++) {
            digest.add("a.Poller", "Poll failed for {}", "Poll failed for " + i, "java.net.SocketTimeoutException", "trace", T0.plusSeconds(15L * i));
        }
        digest.add("a.Poller", "Poll failed for {}", "Poll failed for 7", "java.lang.IllegalStateException", "", T0);

        ErrorDigest.Batch batch = digest.drain();

        assertThat(batch.entries()).hasSize(2);
        ErrorDigest.Entry timeouts = batch.entries().get(0);
        assertThat(timeouts.count()).isEqualTo(60);
        assertThat(timeouts.sample()).isEqualTo("Poll failed for 0");
        assertThat(timeouts.first()).isEqualTo(T0);
        assertThat(timeouts.last()).isEqualTo(T0.plusSeconds(15L * 59));
        assertThat(batch.totalErrors()).isEqualTo(61);
        assertThat(digest.drain().isEmpty()).isTrue();
    }

    @Test
    void pastTheCapErrorsAreCountedNotKept() {
        ErrorDigest digest = new ErrorDigest(2);
        digest.add("a", "one", "one", null, null, T0);
        digest.add("a", "two", "two", null, null, T0);
        digest.add("a", "three", "three", null, null, T0);
        digest.add("a", "three", "three", null, null, T0);
        digest.add("a", "four", "four", null, null, T0);
        digest.add("a", "one", "one", null, null, T0);

        ErrorDigest.Batch batch = digest.drain();

        assertThat(batch.entries()).extracting(e -> e.kind().template()).containsExactly("one", "two");
        assertThat(batch.overflowErrors()).isEqualTo(3);
        assertThat(batch.overflowKinds()).isEqualTo(2);
        assertThat(batch.totalErrors()).isEqualTo(6);
        assertThat(batch.totalKinds()).isEqualTo(4);
    }

    @Test
    void aLongMessageIsClipped() {
        ErrorDigest digest = new ErrorDigest(5);
        digest.add("a", "{}", "x".repeat(2000), null, null, T0);
        assertThat(digest.drain().entries().get(0).sample()).hasSize(501).endsWith("…");
    }

    @Test
    void theAppenderCollectsErrorsFromRealLoggingAndNothingElse() {
        ErrorDigest digest = new ErrorDigest(50);
        attached = new ErrorDigestAppender(digest, List.of("com.dossier.test.noisy"));
        attached.setContext((LoggerContext) LoggerFactory.getILoggerFactory());
        attached.start();
        logger("com.dossier.test").addAppender(attached);

        org.slf4j.Logger log = LoggerFactory.getLogger("com.dossier.test.Inbox");
        log.warn("Only a warning");
        log.info("Just info");
        log.error("Sync failed for user {}", 42, new IllegalStateException("outer", new java.io.IOException("connection reset")));
        LoggerFactory.getLogger("com.dossier.test.noisy.Thing").error("Ignored by configuration");

        ErrorDigest.Batch batch = digest.drain();

        assertThat(batch.entries()).hasSize(1);
        ErrorDigest.Entry e = batch.entries().get(0);
        assertThat(e.kind().logger()).isEqualTo("com.dossier.test.Inbox");
        assertThat(e.kind().template()).isEqualTo("Sync failed for user {}");
        assertThat(e.kind().exception()).isEqualTo("java.io.IOException");
        assertThat(e.sample()).isEqualTo("Sync failed for user 42");
        assertThat(e.trace())
            .startsWith("java.lang.IllegalStateException: outer\n    at ")
            .contains("Caused by: java.io.IOException: connection reset");
    }

    @Test
    void theDigestsOwnErrorsNeverFeedTheNextDigest() {
        ErrorDigest digest = new ErrorDigest(50);
        ErrorDigestAppender appender = new ErrorDigestAppender(digest, List.of());
        appender.setContext((LoggerContext) LoggerFactory.getILoggerFactory());
        appender.start();
        Logger own = logger(ErrorDigestService.class.getName());
        own.addAppender(appender);
        try {
            LoggerFactory.getLogger(ErrorDigestService.class).error("Could not send the digest");
        } finally {
            own.detachAppender(appender);
            appender.stop();
        }
        assertThat(digest.drain().isEmpty()).isTrue();
    }

    private static ErrorDigestService service(MailService mail, String to, String fallback) {
        ErrorDigestProperties props = new ErrorDigestProperties();
        props.setTo(to);
        props.setFallbackTo(fallback);
        props.setInterval(Duration.ofMinutes(15));
        return new ErrorDigestService(props, mail);
    }

    @Test
    void atMostOneEmailPerIntervalAndNothingIsLostWhileWaiting() {
        MailService mail = mock(MailService.class);
        ErrorDigestService svc = service(mail, "ops@kiwiply.com", "");

        assertThat(svc.flush(T0)).as("nothing to send").isFalse();

        svc.digest().add("a.B", "boom", "boom", null, null, T0);
        assertThat(svc.flush(T0.plusSeconds(60))).isTrue();

        svc.digest().add("a.B", "boom", "boom", null, null, T0.plusSeconds(120));
        svc.digest().add("a.C", "bang", "bang", null, null, T0.plusSeconds(180));
        assertThat(svc.flush(T0.plusSeconds(240))).as("too soon after the last email").isFalse();
        assertThat(svc.flush(T0.plusSeconds(60 + 15 * 60))).as("the interval has passed").isTrue();

        ArgumentCaptor<String> subject = ArgumentCaptor.forClass(String.class);
        verify(mail, times(2)).sendEmail(eq("ops@kiwiply.com"), subject.capture(), anyString(), eq(false), eq(false));
        assertThat(subject.getAllValues().get(0)).isEqualTo("[Kiwiply prod] 1 server error since 14:05:00 UTC");
        assertThat(subject.getAllValues().get(1)).isEqualTo("[Kiwiply prod] 2 server errors (2 kinds) since 14:07:00 UTC");
    }

    @Test
    void theBodyListsEachKindMostFrequentFirst() {
        ErrorDigest digest = new ErrorDigest(1);
        digest.add("a.Rare", "rare {}", "rare 1", null, "", T0);
        digest.add("a.Other", "other", "other", null, "", T0);
        digest.add("a.Rare", "rare {}", "rare 2", null, "", T0.plusSeconds(30));

        String body = ErrorDigestService.body(digest.drain(), T0, T0.plusSeconds(900), 15);

        assertThat(body)
            .startsWith("Errors the API logged between 2026-09-23 14:05:00 UTC and 2026-09-23 14:20:00 UTC")
            .contains("2×  a.Rare\n    rare 1\n    first 14:05:00, last 14:05:30 UTC")
            .contains("…and 1 more error(s) of 1 other kind(s) that didn't fit")
            .contains("at most one of these every 15 minutes");
    }

    @Test
    void theRecipientFallsBackToTheAdminAndWithNeitherItIsOff() {
        ErrorDigestProperties props = new ErrorDigestProperties();
        props.setTo("");
        props.setFallbackTo("admin@kiwiply.com");
        assertThat(props.recipient()).isEqualTo("admin@kiwiply.com");
        props.setTo(" ops@kiwiply.com ");
        assertThat(props.recipient()).isEqualTo("ops@kiwiply.com");
        props.setTo("");
        props.setFallbackTo("");
        assertThat(props.isActive()).isFalse();

        MailService mail = mock(MailService.class);
        ErrorDigestService off = service(mail, "", "");
        off.install();
        LoggerFactory.getLogger("com.dossier.test.Off").error("Nobody to tell");
        off.tick();
        verify(mail, never()).sendEmail(anyString(), anyString(), anyString(), anyBoolean(), anyBoolean());
        assertThat(off.digest().drain().isEmpty()).as("nothing collected while off").isTrue();
    }

    private static ErrorDigestProperties bind(java.util.Map<String, String> values) {
        return new org.springframework.boot.context.properties.bind.Binder(
            new org.springframework.boot.context.properties.source.MapConfigurationPropertySource(values)
        )
            .bind("dossier.ops.error-digest", ErrorDigestProperties.class)
            .get();
    }

    @Test
    void bindsTheWayApplicationProdYmlAndComposeSetIt() {
        // Compose passes DOSSIER_ERROR_DIGEST_TO and the ignore list even when they're empty.
        ErrorDigestProperties p = bind(
            java.util.Map.of(
                "dossier.ops.error-digest.to", "",
                "dossier.ops.error-digest.fallback-to", "admin@kiwiply.com",
                "dossier.ops.error-digest.interval", "15m",
                "dossier.ops.error-digest.ignore-loggers", "",
                "dossier.ops.error-digest.environment", "prod"
            )
        );
        assertThat(p.recipient()).isEqualTo("admin@kiwiply.com");
        assertThat(p.getInterval()).isEqualTo(Duration.ofMinutes(15));
        assertThat(p.getIgnoreLoggers()).allMatch(String::isBlank);

        ErrorDigestProperties q = bind(java.util.Map.of("dossier.ops.error-digest.ignore-loggers", "org.a,com.b"));
        assertThat(q.getIgnoreLoggers()).containsExactly("org.a", "com.b");
    }
}
