package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The second 404 wall (ADR-023, X1.1): while the master {@code flag.enterprise} is off, the enterprise surface does not
 * exist. {@code /api/public/tenant}, everything under {@code /api/ent} and everything under
 * {@code /api/orgs/{id}/enterprise} answer the same generic 404 body as {@link OrgsEnabledFilter} (an organization that
 * does not exist), before authentication, so a signed-out probe learns nothing. The path is normalised first (path
 * parameters, repeated slashes, dot segments) so a decorated URL cannot slip past a prefix check.
 *
 * <p>This filter only knows "on for somebody". Which organizations the flag covers is decided where the organization is
 * known: {@code OrgPermissionInterceptor} for {@code /api/orgs/{id}/enterprise/**} and the tenant resolver for hosts.
 * {@code OrgsEnabledFilter} stays the first wall; this is the second.
 */
public class EnterpriseEnabledFilter extends OncePerRequestFilter {

    private final EnterpriseFeatureFlag flag;

    public EnterpriseEnabledFilter(EnterpriseFeatureFlag flag) {
        this.flag = flag;
    }

    /** True for a request path (without the context path) that belongs to the enterprise API. */
    static boolean isEnterprisePath(String rawPath) {
        if (rawPath == null) return false;
        String path = OrgsEnabledFilter.normalise(rawPath);
        return path.equals("/api/public/tenant")
            || path.startsWith("/api/public/tenant/")
            || path.equals("/api/ent")
            || path.startsWith("/api/ent/")
            || isOrgEnterprisePath(path);
    }

    /** True for {@code /api/orgs/{id}/enterprise} and below (the argument is already normalised or is normalised here). */
    public static boolean isOrgEnterprisePath(String rawPath) {
        if (rawPath == null) return false;
        String path = OrgsEnabledFilter.normalise(rawPath);
        String[] parts = path.split("/"); // "", "api", "orgs", "{id}", "enterprise", ...
        return parts.length >= 5 && parts[1].equals("api") && parts[2].equals("orgs") && parts[4].equals("enterprise");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String path = OrgsEnabledFilter.pathOf(request);
        if (isEnterprisePath(path) && !flag.isEnabled()) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(OrgsEnabledFilter.body(request.getRequestURI()));
            return;
        }
        chain.doFilter(request, response);
    }
}
