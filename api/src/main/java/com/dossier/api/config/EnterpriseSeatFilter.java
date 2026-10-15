package com.dossier.api.config;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.members.EnterpriseAccountLifecycle;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Decision O4, phase S8 (docs/enterprise-v2/19): an ENTERPRISE account only works while its person holds an ACTIVE seat in the organization the token
 * is bound to ({@code tid}). Suspending or offboarding a person revokes their refresh tokens (so nothing rotates); this filter closes the other half
 * of "revoke their tokens": an access token that was already issued (a browser session, or the extension's {@code ext=1} token) is refused with
 * {@code 401 TOKEN_ACCOUNT_DISABLED} on the next call instead of surviving until it expires. A reinstated person signs in anew and works again.
 *
 * <p>Organization routes ({@code /api/orgs/**}, {@code /api/ent/**}, {@code /api/me/tenant}) and the join endpoints already check the seat themselves and keep their own
 * answers; this filter covers the user-scoped routes an enterprise token can reach (the extension's profile, resume, application and AI routes, the
 * account routes). It looks only at tokens whose subject is an enterprise login, so personal accounts and legacy SHARED organizations are untouched
 * and cost nothing.
 */
public class EnterpriseSeatFilter extends OncePerRequestFilter {

    /** The answer for a disabled account's token. */
    public static final String ACCOUNT_DISABLED = "TOKEN_ACCOUNT_DISABLED";

    private final ObjectProvider<EnterpriseAccountLifecycle> accounts;

    public EnterpriseSeatFilter(ObjectProvider<EnterpriseAccountLifecycle> accounts) {
        this.accounts = accounts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwtAuth) || !Constants.isEnterpriseLogin(jwtAuth.getToken().getSubject())) {
            chain.doFilter(request, response);
            return;
        }
        EnterpriseAccountLifecycle lifecycle = accounts == null ? null : accounts.getIfAvailable();
        Long tid = TenantTokenBinding.tenantOf(jwtAuth.getToken());
        if (lifecycle == null || tid == null || selfChecking(pathOf(request))) {
            chain.doFilter(request, response);
            return;
        }
        Object uid = jwtAuth.getToken().getClaim(SecurityUtils.USER_ID_CLAIM);
        Long userId = uid instanceof Number n ? n.longValue() : null;
        if (!lifecycle.hasActiveSeat(tid, userId)) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setHeader("WWW-Authenticate", "Bearer error=\"invalid_token\", error_description=\"" + ACCOUNT_DISABLED + "\"");
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"" + ACCOUNT_DISABLED + "\"}");
            return;
        }
        chain.doFilter(request, response);
    }

    /** Routes that decide on the seat themselves (and have their own answer for a person without one). */
    static boolean selfChecking(String path) {
        return path.equals("/api/orgs") || path.startsWith("/api/orgs/")
            || path.equals("/api/ent") || path.startsWith("/api/ent/")
            || path.equals("/api/me/tenant")
            || path.equals("/api/join") || path.startsWith("/api/join/")
            || path.equals("/api/logout") || path.equals("/api/refresh");
    }

    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        return OrgsEnabledFilter.normalise(context != null && !context.isEmpty() && path.startsWith(context) ? path.substring(context.length()) : path);
    }
}
