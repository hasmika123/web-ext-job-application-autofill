package com.dossier.api.service.ops;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The server-error email digest (Phase 15.1b), bound under {@code dossier.ops.error-digest}:
 * <ul>
 *   <li><b>{@code to}</b> / <b>{@code fallback-to}</b> — who gets it: {@code DOSSIER_ERROR_DIGEST_TO},
 *       else {@code ADMIN_EMAIL}. Both blank = the digest is off and nothing is collected (dev,
 *       tests).</li>
 *   <li><b>{@code interval}</b> — at most one email per this long (15 minutes). Errors keep
 *       collecting in between, so nothing is lost by the wait.</li>
 *   <li><b>{@code max-kinds}</b> — distinct errors kept per email (50); the rest are counted.</li>
 *   <li><b>{@code ignore-loggers}</b> — logger-name prefixes to leave out, for a known-noisy one.</li>
 *   <li><b>{@code environment}</b> — named in the subject, so a staging box can't pass for prod.</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "dossier.ops.error-digest")
public class ErrorDigestProperties {

    private String to = "";
    private String fallbackTo = "";
    private Duration interval = Duration.ofMinutes(15);
    private int maxKinds = 50;
    private List<String> ignoreLoggers = new ArrayList<>();
    private String environment = "prod";

    /** Where the digest goes: {@code to}, else {@code fallback-to}; blank when neither is set. */
    public String recipient() {
        if (to != null && !to.isBlank()) return to.trim();
        return fallbackTo == null ? "" : fallbackTo.trim();
    }

    /** On only with somewhere to send it. */
    public boolean isActive() {
        return !recipient().isEmpty();
    }

    public String getTo() {
        return to;
    }

    public void setTo(String to) {
        this.to = to;
    }

    public String getFallbackTo() {
        return fallbackTo;
    }

    public void setFallbackTo(String fallbackTo) {
        this.fallbackTo = fallbackTo;
    }

    public Duration getInterval() {
        return interval;
    }

    public void setInterval(Duration interval) {
        this.interval = interval;
    }

    public int getMaxKinds() {
        return maxKinds;
    }

    public void setMaxKinds(int maxKinds) {
        this.maxKinds = maxKinds;
    }

    public List<String> getIgnoreLoggers() {
        return ignoreLoggers;
    }

    public void setIgnoreLoggers(List<String> ignoreLoggers) {
        this.ignoreLoggers = ignoreLoggers;
    }

    public String getEnvironment() {
        return environment;
    }

    public void setEnvironment(String environment) {
        this.environment = environment;
    }
}
