package com.dossier.api.web.filter;

import com.dossier.api.service.ResumeBuilderSettingKeys;
import com.dossier.api.service.ResumeBuilderSettings;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Rate limits for the public share routes (R3.11, DESIGN 17): the only API routes anyone on the internet can
 * reach without an account, and each one is a lookup of a secret.
 *
 * <p>Two buckets, both sized by the setting {@code resume.rate.publicPerMin} per minute and keyed by the client IP
 * (the web app forwards the real visitor's address as {@code X-Forwarded-For}, as the edge does for everything else):
 * <ul>
 *   <li>{@link #hit}: IP + token - one visitor cannot hammer one link;</li>
 *   <li>{@link #miss}: IP only, counted when a token does not resolve - one visitor cannot walk the token space.</li>
 * </ul>
 * Like {@link RateLimitFilter} the counters live in this process (one API container); the limit is read on every
 * request so an admin change shows within the settings cache window.
 */
@Component
public class PublicShareRateLimiter {

    private static final long WINDOW_MS = 60_000L;
    private static final int TOKEN_CHARS = 32;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * WINDOW_MS, WINDOW_MS);
    private final ResumeBuilderSettings settings;

    public PublicShareRateLimiter(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    /** Count one request for this visitor and token; 0 when allowed, else the seconds to wait. */
    public long hit(HttpServletRequest request, String token) {
        // A token of the wrong length cannot be real: do not let attackers mint unbounded keys with it.
        String t = token != null && token.length() == TOKEN_CHARS ? token : "-";
        return limiter.retryAfterSeconds("hit " + RateLimitFilter.clientIp(request) + ' ' + t, limit(), WINDOW_MS, System.currentTimeMillis());
    }

    /** Count one failed lookup for this visitor; 0 while under the limit, else the seconds to wait. */
    public long miss(HttpServletRequest request) {
        return limiter.retryAfterSeconds("miss " + RateLimitFilter.clientIp(request), limit(), WINDOW_MS, System.currentTimeMillis());
    }

    private int limit() {
        return settings.getInt(ResumeBuilderSettingKeys.RATE_PUBLIC_PER_MIN);
    }
}
