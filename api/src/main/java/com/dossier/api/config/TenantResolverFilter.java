package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.TenantResolver;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.List;
import org.slf4j.MDC;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Derives the tenant of every API request from the host the web BFF forwarded in {@code X-Kiwiply-Host} (X1.3, ADR-003)
 * and publishes it for the rest of the request: a request attribute, the thread-bound {@link TenantContextHolder} and the
 * MDC keys {@code tenant} and {@code host}, all cleared in {@code finally}. It runs ahead of Spring Security, so the
 * answer is known before authentication.
 *
 * <p><b>The client never names a tenant.</b> The only input is the host header the BFF sets from the visitor's own request
 * host; a tenant id in any other header, cookie, query or body is never read. A caller that forges the header (it can: the
 * API is reachable directly) merely selects a tenant CANDIDATE; membership and permissions are still required for
 * anything it names, so forging a host grants nothing. A request with several values, or a value that is not one hostname,
 * is an unknown host.
 *
 * <p><b>Flags off, nothing changes.</b> While the enterprise master flag is off the filter does nothing at all: no lookup,
 * no attribute, no MDC, and every route behaves as it did before Enterprise V2. With it on, a host that is GIVEN but not
 * served makes every {@code /api/orgs}, {@code /api/me/orgs} and {@code /api/join} request the same generic 404 as an
 * organization that does not exist, before authentication; a request with no host at all is a legacy caller (the
 * extension, today's web) and keeps today's behaviour.
 */
public class TenantResolverFilter extends OncePerRequestFilter {

    /** The header the BFF sets from the visitor's request host (ADR-003). */
    public static final String HEADER = "X-Kiwiply-Host";

    private final TenantResolver resolver;
    private final EnterpriseFeatureFlag flag;

    public TenantResolverFilter(TenantResolver resolver, EnterpriseFeatureFlag flag) {
        this.resolver = resolver;
        this.flag = flag;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        if (!flag.isEnabled()) {
            chain.doFilter(request, response);
            return;
        }
        TenantContext context = resolver.resolve(forwardedHost(request));
        request.setAttribute(TenantContextHolder.REQUEST_ATTRIBUTE, context);
        TenantContextHolder.set(context);
        MDC.put("tenant", context.tenantLabel());
        if (context.host() != null) MDC.put("host", context.host());
        try {
            String path = request.getRequestURI();
            String contextPath = request.getContextPath();
            if (contextPath != null && !contextPath.isEmpty() && path.startsWith(contextPath)) path = path.substring(contextPath.length());
            if (context.isExplicitlyUnknown() && OrgsEnabledFilter.isOrgPath(path)) {
                response.setStatus(HttpServletResponse.SC_NOT_FOUND);
                response.setContentType("application/problem+json");
                response.setCharacterEncoding(StandardCharsets.UTF_8.name());
                response.getWriter().write(OrgsEnabledFilter.body(request.getRequestURI()));
                return;
            }
            chain.doFilter(request, response);
        } finally {
            TenantContextHolder.clear();
            MDC.remove("tenant");
            MDC.remove("host");
        }
    }

    /** The forwarded host, or a deliberately invalid marker when the header is repeated (so it resolves to an unknown host). */
    private static String forwardedHost(HttpServletRequest request) {
        List<String> values = Collections.list(request.getHeaders(HEADER));
        if (values.isEmpty()) return null;
        return values.size() == 1 ? values.get(0) : ",";
    }
}
