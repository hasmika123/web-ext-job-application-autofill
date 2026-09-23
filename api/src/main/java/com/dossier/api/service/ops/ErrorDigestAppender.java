package com.dossier.api.service.ops;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.StackTraceElementProxy;
import ch.qos.logback.core.AppenderBase;
import java.time.Instant;
import java.util.List;

/**
 * Feeds every ERROR log event into an {@link ErrorDigest} (Phase 15.1b). Attached to the root
 * logger by {@link ErrorDigestService} at startup, so it sees the same errors the console log does
 * — nothing in the app has to call it. It never throws: logging must not fail because of it.
 */
public class ErrorDigestAppender extends AppenderBase<ILoggingEvent> {

    static final String NAME = "ERROR_DIGEST";

    private static final int TOP_FRAMES = 12;
    private static final int CAUSE_FRAMES = 6;

    private final ErrorDigest digest;
    private final List<String> ignoreLoggers;

    public ErrorDigestAppender(ErrorDigest digest, List<String> ignoreLoggers) {
        this.digest = digest;
        this.ignoreLoggers = List.copyOf(ignoreLoggers);
        setName(NAME);
    }

    @Override
    protected void append(ILoggingEvent event) {
        try {
            if (!event.getLevel().isGreaterOrEqual(Level.ERROR)) return;
            String logger = event.getLoggerName();
            // The digest's own trouble (a failed send) must not feed the next digest.
            if (logger.startsWith(ErrorDigestAppender.class.getPackageName())) return;
            for (String prefix : ignoreLoggers) {
                if (!prefix.isBlank() && logger.startsWith(prefix)) return;
            }
            IThrowableProxy thrown = event.getThrowableProxy();
            IThrowableProxy root = rootCause(thrown);
            digest.add(
                logger,
                event.getMessage(),
                event.getFormattedMessage(),
                root == null ? null : root.getClassName(),
                trace(thrown),
                Instant.ofEpochMilli(event.getTimeStamp())
            );
        } catch (RuntimeException ignored) {
            // A broken digest is never allowed to break logging.
        }
    }

    private static IThrowableProxy rootCause(IThrowableProxy t) {
        if (t == null) return null;
        IThrowableProxy root = t;
        for (int depth = 0; root.getCause() != null && depth < 20; depth++) root = root.getCause();
        return root;
    }

    /** The exception, its top frames, and the root cause's — enough to find the line, not a wall. */
    static String trace(IThrowableProxy t) {
        if (t == null) return "";
        StringBuilder out = new StringBuilder();
        frames(out, "", t, TOP_FRAMES);
        IThrowableProxy root = rootCause(t);
        if (root != t) frames(out, "Caused by: ", root, CAUSE_FRAMES);
        return out.toString();
    }

    private static void frames(StringBuilder out, String prefix, IThrowableProxy t, int max) {
        out.append(prefix).append(t.getClassName());
        if (t.getMessage() != null) out.append(": ").append(t.getMessage());
        out.append('\n');
        StackTraceElementProxy[] frames = t.getStackTraceElementProxyArray();
        int n = Math.min(max, frames.length);
        for (int i = 0; i < n; i++) out.append("    at ").append(frames[i].getStackTraceElement()).append('\n');
        if (frames.length > n) out.append("    … ").append(frames.length - n).append(" more\n");
    }
}
