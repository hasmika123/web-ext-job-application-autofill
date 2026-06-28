package com.dossier.api.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * In-memory, per-IP rate limiter for the sensitive unauthenticated endpoints (login,
 * registration, password-reset) to blunt brute-force and abuse. Over the limit returns
 * {@code 429 Too Many Requests} with a {@code Retry-After} header.
 *
 * <p>Deliberately dependency-free and per-instance: we run a single API container behind
 * Caddy, so a process-local map (see {@link FixedWindowRateLimiter}) is sufficient and avoids
 * pulling in Bucket4j/Redis. If the API is ever scaled horizontally, this should move to a
 * shared store (each instance would otherwise enforce the limit independently). Authenticated
 * traffic and the silent token-refresh endpoint are not limited.
 *
 * <p>Runs ahead of Spring Security (HIGHEST_PRECEDENCE) so abusive requests are rejected
 * before any auth work. Disabled via {@code dossier.rate-limit.enabled=false} (tests set this
 * so the integration suite isn't throttled).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(prefix = "dossier.rate-limit", name = "enabled", havingValue = "true", matchIfMissing = true)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger LOG = LoggerFactory.getLogger(RateLimitFilter.class);

    /** A single limited endpoint: HTTP method + exact path, N requests per window. */
    private record Rule(String method, String path, int limit, long windowMs) {}

    // Conservative defaults. Login is the tightest; signup + reset-init guard against spam
    // and email enumeration; reset-finish guards the (random, single-use) reset key.
    private static final List<Rule> RULES = List.of(
        new Rule("POST", "/api/authenticate", 10, 5 * 60_000L), //   10 / 5 min
        new Rule("POST", "/api/register", 5, 60 * 60_000L), //         5 / hour
        new Rule("POST", "/api/account/reset-password/init", 5, 60 * 60_000L), //   5 / hour
        new Rule("POST", "/api/account/reset-password/finish", 10, 60 * 60_000L) // 10 / hour
    );

    private static final long SWEEP_INTERVAL_MS = 10 * 60_000L;
    private static final long MAX_WINDOW_MS = RULES.stream().mapToLong(Rule::windowMs).max().orElse(SWEEP_INTERVAL_MS);

    private final FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(SWEEP_INTERVAL_MS, MAX_WINDOW_MS);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        Rule rule = matchRule(request);
        if (rule == null) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);
        String key = ip + ' ' + rule.method() + ' ' + rule.path();
        long retryAfter = limiter.retryAfterSeconds(key, rule.limit(), rule.windowMs(), System.currentTimeMillis());

        if (retryAfter > 0) {
            LOG.warn("Rate limit exceeded for {} {} from {}", rule.method(), rule.path(), ip);
            response.setStatus(429); // 429 Too Many Requests
            response.setHeader("Retry-After", Long.toString(retryAfter));
            response.setContentType("application/problem+json");
            response
                .getWriter()
                .write(
                    "{\"type\":\"https://kiwiply.com/problem/too-many-requests\"," +
                    "\"title\":\"Too Many Requests\",\"status\":429," +
                    "\"detail\":\"Too many attempts. Please wait and try again.\"}"
                );
            return;
        }

        chain.doFilter(request, response);
    }

    private static Rule matchRule(HttpServletRequest request) {
        String method = request.getMethod();
        String path = request.getRequestURI();
        for (Rule r : RULES) {
            if (r.method().equals(method) && r.path().equals(path)) {
                return r;
            }
        }
        return null;
    }

    /** Trust the proxy's first X-Forwarded-For hop (Caddy sets it); fall back to the socket. */
    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma >= 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }
}
