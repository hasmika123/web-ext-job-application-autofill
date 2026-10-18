package com.dossier.api.web.filter;

import com.dossier.api.service.ResumeBuilderSettings;
import com.dossier.api.service.settings.EnterpriseSettingKeys;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

/**
 * Rate limit for {@code GET /api/public/tenant} (X1.3, threat T13: enumeration of tenants): requests per minute per
 * forwarded host AND visitor IP ({@code enterprise.tenant.rate_per_min}, read on every request so an admin change shows
 * within the settings cache window). The counters live in this process like the other public limiters
 * ({@link PublicShareRateLimiter}); the web app forwards the real visitor address as {@code X-Forwarded-For}.
 */
@Component
public class TenantRateLimiter {

    private static final long WINDOW_MS = 60_000L;
    private static final int MAX_HOST_CHARS = 253;

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(10 * WINDOW_MS, WINDOW_MS);
    private final ResumeBuilderSettings settings;

    public TenantRateLimiter(ResumeBuilderSettings settings) {
        this.settings = settings;
    }

    /** Count one request for this host and visitor; 0 when allowed, else the seconds to wait. */
    public long hit(HttpServletRequest request, String host) {
        // a host that is not a plausible hostname shares one bucket, so an attacker cannot mint unbounded keys with it
        String h = host != null && host.length() <= MAX_HOST_CHARS ? host : "-";
        return limiter.retryAfterSeconds("tenant " + h + ' ' + RateLimitFilter.clientIp(request), limit(), WINDOW_MS, System.currentTimeMillis());
    }

    private int limit() {
        return settings.getInt(EnterpriseSettingKeys.TENANT_RATE_PER_MIN);
    }
}
