package com.dossier.api.web.filter;

import com.dossier.api.service.settings.BillingSettingKeys;
import com.dossier.api.service.settings.SettingsService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * The brake on {@code POST /api/billing/quotes}. The pricing page asks for quotes without an account, so anyone on the internet can call it; one visitor
 * (the client IP, as the web app forwards it) gets {@code billing.quote.rate_per_min} requests a minute. Counters live in this process, like the other
 * public limiters, and the limit is read on every request so an admin change shows within the settings cache window.
 */
@Component
public class QuoteRateLimiter {

    private static final long WINDOW_MS = 60_000L;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * WINDOW_MS, WINDOW_MS);
    private final SettingsService settings;

    public QuoteRateLimiter(SettingsService settings) {
        this.settings = settings;
    }

    /** Count one quote request by this visitor; 0 when allowed, else the seconds to wait. */
    public long hit(HttpServletRequest request) {
        return limiter.retryAfterSeconds("quote " + RateLimitFilter.clientIp(request), settings.getInt(BillingSettingKeys.QUOTE_RATE_PER_MIN), WINDOW_MS, System.currentTimeMillis());
    }

    /** Forget every counter (tests). */
    public void resetAll() {
        limiter.resetAll();
    }
}
