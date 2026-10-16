package com.dossier.api.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Locale;
import java.util.Set;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * X1.13 (escalation E12): the operational and service-to-service surfaces are never reachable through a public or tenant
 * host, even when the edge path rules are missing. Every request to {@code /api/internal/**} or {@code /management/**}
 * (except the health probes, which monitors need) is answered with the generic empty 404, before any token check, when
 * either it carries {@code X-Forwarded-Host} (the edge always sets it; compose-internal callers never do) or its
 * {@code Host} (port stripped) is not on the internal allow-list. Fail-closed: a missing Host is refused too.
 */
public class PublicHostGuardFilter extends OncePerRequestFilter {

    private final boolean enabled;
    private final Set<String> internalHosts;

    public PublicHostGuardFilter(boolean enabled, Set<String> internalHosts) {
        this.enabled = enabled;
        this.internalHosts = internalHosts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (enabled && guarded(pathOf(request)) && !fromInternalNetwork(request)) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            return;
        }
        chain.doFilter(request, response);
    }

    static String pathOf(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String ctx = request.getContextPath();
        String path = ctx != null && !ctx.isEmpty() && uri.startsWith(ctx) ? uri.substring(ctx.length()) : uri;
        int semicolon = path.indexOf(';');
        return semicolon >= 0 ? path.substring(0, semicolon) : path;
    }

    /** True for the paths this guard protects: internal API and every actuator path but the health probes. */
    static boolean guarded(String path) {
        if (path.equals("/api/internal") || path.startsWith("/api/internal/")) return true;
        if (path.equals("/management") || path.startsWith("/management/")) {
            return !(path.equals("/management/health") || path.startsWith("/management/health/"));
        }
        return false;
    }

    private boolean fromInternalNetwork(HttpServletRequest request) {
        if (request.getHeader("X-Forwarded-Host") != null) return false;
        // getServerName() is the Host header with the port stripped (the container derives it); the mock servlet gives "localhost"
        String host = request.getServerName();
        if (host == null || host.isBlank()) return false;
        host = host.trim().toLowerCase(Locale.ROOT);
        return internalHosts.contains(host);
    }
}
