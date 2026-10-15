package com.dossier.api.config;

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
 * </ul>
 *
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
        boolean refused = isPersonalOnly(path);
        if (refused) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(OrgsEnabledFilter.body(request.getRequestURI()));
            return;
        }
        chain.doFilter(request, response);
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
