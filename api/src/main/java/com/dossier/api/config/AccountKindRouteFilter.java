package com.dossier.api.config;

import com.dossier.api.security.SecurityUtils;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Route rules that depend on the KIND of account behind the bearer token (decision O4, docs/enterprise-v2/19 sections 1.4, 3.3, 3.4 and 6.3). It
 * only looks at JWT-authenticated requests of an enterprise account (subject {@code ent#<orgId>#...}) and always answers the generic 404, the same
 * body as a route that does not exist, so nothing says the route is there for someone else:
 *
 * <ul>
 *   <li>personal-only routes: {@code /api/billing/**} (the personal Stripe plan) and {@code /api/profile/inbox/**} (the personal-plan inbox). An enterprise
 *       account has no personal plan; its inbox is {@code /api/orgs/{id}/me-workspace/inbox/**} and its billing is the organization's.</li>
 *   <li>{@code DELETE /api/account} (self-service erasure): enterprise accounts are erased through the organization (phase S8).</li>
 *   <li>an extension token ({@code ext=1}) reaches only {@link ExtensionRoutes} (of its own organization); everything else is 404.</li>
 * </ul>
 *
 * Works whether or not a tenant context was resolved (the extension calls the platform host).
 */
public class AccountKindRouteFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwtAuth) || !Constants.isEnterpriseLogin(jwtAuth.getToken().getSubject())) {
            chain.doFilter(request, response);
            return;
        }
        String path = pathOf(request);
        boolean refused = isPersonalOnly(path) || isPersonalDelete(request.getMethod(), path);
        if (!refused && isExtensionToken(jwtAuth)) {
            refused = !ExtensionRoutes.allows(request.getMethod(), path, TenantTokenBinding.tenantOf(jwtAuth.getToken()));
        }
        if (refused) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(OrgsEnabledFilter.body(request.getRequestURI()));
            return;
        }
        chain.doFilter(request, response);
    }

    /** Whether the token is an extension token ({@code ext=1}). */
    public static boolean isExtensionToken(Authentication auth) {
        return auth instanceof JwtAuthenticationToken j && SecurityUtils.isExtension(j.getToken().getClaim(SecurityUtils.EXTENSION_CLAIM));
    }

    /**
     * {@code DELETE /api/account} erases the signed-in account. An enterprise account is employer-managed: it is erased by the organization's
     * offboarding retention (or an administrator's request), never by a self-service call, so the route is the generic 404 for its tokens (phase S8).
     */
    static boolean isPersonalDelete(String method, String path) {
        return "DELETE".equalsIgnoreCase(method) && underneath(path, "/api/account") && (path.equals("/api/account") || path.equals("/api/account/delete"));
    }

    static boolean isPersonalOnly(String path) {
        return underneath(path, "/api/billing") || underneath(path, "/api/profile/inbox") || underneath(path, "/api/inbox");
    }

    private static boolean underneath(String path, String prefix) {
        return path.equals(prefix) || path.startsWith(prefix + "/");
    }

    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        return OrgsEnabledFilter.normalise(context != null && !context.isEmpty() && path.startsWith(context) ? path.substring(context.length()) : path);
    }
}
