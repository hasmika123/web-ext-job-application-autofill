package com.dossier.api.web.filter;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Rate limits for the join routes (O2.2): a join link or code is a secret anyone on the internet can try, so nothing here
 * may let a visitor walk the space. Two buckets keyed by the client IP (the web app forwards the real visitor's address
 * in {@code X-Forwarded-For}, as the edge does for everything else):
 * <ul>
 *   <li>{@link #hit}: every lookup, sized by {@code org.join.ratePerMin};</li>
 *   <li>{@link #miss}: a lookup that found nothing, sized by {@code org.join.missPerMin} - far smaller, so guessing is slow.</li>
 * </ul>
 * Like {@link PublicShareRateLimiter} the counters live in this process and the limits are read on every request, so an
 * admin change shows within the settings cache window.
 */
@Component
public class JoinRateLimiter {

    private static final long WINDOW_MS = 60_000L;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * WINDOW_MS, WINDOW_MS);
    private final ResumeBuilderSettings settings;

    public JoinRateLimiter(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    /** Count one lookup by this visitor; 0 when allowed, else the seconds to wait. */
    public long hit(HttpServletRequest request) {
        return limiter.retryAfterSeconds("join-hit " + RateLimitFilter.clientIp(request), settings.getInt(ResumeBuilderSettingKeys.ORG_JOIN_RATE_PER_MIN), WINDOW_MS, System.currentTimeMillis());
    }

    /** Count one lookup that found nothing; 0 while under the limit, else the seconds to wait. */
    public long miss(HttpServletRequest request) {
        return limiter.retryAfterSeconds("join-miss " + RateLimitFilter.clientIp(request), settings.getInt(ResumeBuilderSettingKeys.ORG_JOIN_MISS_PER_MIN), WINDOW_MS, System.currentTimeMillis());
    }
}
