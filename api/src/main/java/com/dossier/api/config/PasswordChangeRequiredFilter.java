package com.dossier.api.config;

import static com.dossier.api.security.SecurityUtils.PASSWORD_CHANGE_CLAIM;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * An account that holds an administrator-issued temporary password (X1.11) may sign in, but its session may do exactly one thing
 * besides signing out: change the password. The token carries the {@code pcr} claim (set at sign-in and on refresh from the
 * account's flag), so no database read is needed here. Every other API call is answered {@code 403 PASSWORD_CHANGE_REQUIRED}
 * (a distinct code the web app turns into the change-password screen). A token without the claim is never touched.
 *
 * <p>Allowed while the flag is set: the account read, the change itself, refresh (which re-reads the flag, so the first refresh
 * after the change returns a clean token), the authentication probe and logout.
 */
public class PasswordChangeRequiredFilter extends OncePerRequestFilter {

    static final String CODE = "PASSWORD_CHANGE_REQUIRED";

    private static final Set<String> ALLOWED = Set.of("/api/account", "/api/account/change-password", "/api/refresh", "/api/authenticate", "/api/logout");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth && Boolean.TRUE.equals(jwtAuth.getToken().getClaim(PASSWORD_CHANGE_CLAIM)) && !ALLOWED.contains(pathOf(request))) {
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"status\":403,\"title\":\"Forbidden\",\"code\":\"" + CODE + "\",\"message\":\"Set a new password before continuing.\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        String p = context != null && !context.isEmpty() && path.startsWith(context) ? path.substring(context.length()) : path;
        while (p.length() > 1 && p.endsWith("/")) p = p.substring(0, p.length() - 1);
        return p;
    }
}
