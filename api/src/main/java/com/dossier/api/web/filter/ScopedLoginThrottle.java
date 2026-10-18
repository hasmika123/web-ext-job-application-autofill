package com.dossier.api.web.filter;

import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Sign-in attempt counter per ACCOUNT WORLD and address (decision O4, docs/enterprise-v2/19 section 4): the key is
 * {@code P:<email>} for the personal world or {@code E<orgId>:<email>} for one organization's enterprise accounts, so hammering
 * {@code acme}'s sign-in for {@code a@x.com} can not lock the personal {@code a@x.com}, and the other way round. It sits next to the
 * per-IP rule of {@link RateLimitFilter} (which stays); it only counts while separate accounts are in force, and a successful sign-in
 * clears the count. Process-local like the other limiters.
 */
@Component
public class ScopedLoginThrottle {

    private static final long WINDOW_MS = 5 * 60_000L;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * 60_000L, WINDOW_MS);
    private final int limit;

    public ScopedLoginThrottle(@Value("${dossier.login-scope-limit:10}") int limit) {
        this.limit = limit;
    }

    /** The counter key for a world ({@code P} or {@code E<orgId>}) and a typed username. */
    public static String key(String worldKey, String username) {
        String u = username == null ? "" : username.strip().toLowerCase(Locale.ROOT);
        if (u.length() > 191) u = u.substring(0, 191);
        return "login " + worldKey + ':' + u;
    }

    /** Count one attempt; 0 when allowed, otherwise the seconds to wait. */
    public long hit(String key) {
        return limiter.retryAfterSeconds(key, limit, WINDOW_MS, System.currentTimeMillis());
    }

    /** A successful sign-in clears the failures counted against its key. */
    public void clear(String key) {
        limiter.reset(key);
    }
}
