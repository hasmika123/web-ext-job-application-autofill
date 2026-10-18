package com.dossier.api.config;

import com.dossier.api.service.AccountScopes;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import java.util.regex.Pattern;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The path-dependent half of token-to-tenant binding (X1.5, 04-tenancy-and-security.md section 3), run right after bearer
 * authentication. It only looks at JWT-authenticated requests and only while a tenant context was resolved (enterprise on).
 *
 * <ul>
 *   <li>TENANT host, an organization route ({@code /api/orgs}, {@code /api/me/orgs}, {@code /api/join}, {@code /api/ent}):
 *       a token without {@code tid} is unauthenticated here (401, so the web sends the visitor to the tenant login); a token
 *       for another tenant is 401 (the decoder already refuses it; this is the second wall). {@code /api/account} and every
 *       other route are untouched: that is the login-first hand-off.</li>
 *   <li>Any other context: a token WITH {@code tid} may not touch {@code /api/orgs/{id}/...} or {@code /api/ent/...}: 404,
 *       the same generic answer as for an organization that does not exist. User-scoped routes stay available.</li>
 * </ul>
 */
public class TenantTokenBindingFilter extends OncePerRequestFilter {

    /** X2.2: the shell's session contract is a tenant route even though it has no organization id in its path (a token without tid is 401 there, as on /api/orgs). */
    private static final String TENANT_SESSION_PATH = "/api/me/tenant";

    /** O4 world check: a personal token on an enterprise host, or an enterprise token on a platform host (401, same body on every route). */
    public static final String WRONG_WORLD = "TOKEN_WRONG_WORLD";

    private static final Pattern ORG_SCOPED = Pattern.compile("^/api/(orgs/[0-9]+(/.*)?|ent(/.*)?)$");

    // Absent in the hand-wired security slices: then there is no world check, exactly the pre-O4 rules.
    private final ObjectProvider<AccountScopes> accountScopes;

    public TenantTokenBindingFilter() {
        this(null);
    }

    public TenantTokenBindingFilter(ObjectProvider<AccountScopes> accountScopes) {
        this.accountScopes = accountScopes;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        Optional<TenantContext> context = TenantContextHolder.current();
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (context.isEmpty() || !(auth instanceof JwtAuthenticationToken jwtAuth)) {
            chain.doFilter(request, response);
            return;
        }
        String path = pathOf(request);
        Long tid = TenantTokenBinding.tenantOf(jwtAuth.getToken());
        TenantContext c = context.get();
        // O4 (docs/enterprise-v2/19 1.4): with separate accounts in force a token must come from the world of the host it is presented on.
        // The extension's ext=1 enterprise tokens are accepted on a platform host and held to ExtensionRoutes by AccountKindRouteFilter (phase S6).
        AccountScopes scopes = accountScopes == null ? null : accountScopes.getIfAvailable();
        boolean ext = com.dossier.api.security.SecurityUtils.isExtension(jwtAuth.getToken().getClaim(com.dossier.api.security.SecurityUtils.EXTENSION_CLAIM));
        if (scopes != null && !c.isExplicitlyUnknown() && !scopes.tokenFitsWorld(tid, ext, context)) {
            unauthorized(response, WRONG_WORLD);
            return;
        }
        if (c.isTenant()) {
            if (OrgsEnabledFilter.isOrgPath(path) || path.equals("/api/ent") || path.startsWith("/api/ent/") || path.equals(TENANT_SESSION_PATH)) {
                if (tid == null && isJoin(path)) {
                    // X1.8: the invitee signed in before holding a seat (a tid-less token, see TenantSessionService), so the join
                    // endpoints are the one org surface a tid-less token may reach; OrgJoinService still pins the invite to this host.
                } else if (tid == null) {
                    unauthorized(response, "TOKEN_TENANT_REQUIRED");
                    return;
                } else if (!tid.equals(c.orgId())) {
                    unauthorized(response, TenantTokenBinding.MISMATCH);
                    return;
                }
            }
        } else if (tid != null && !ext && ORG_SCOPED.matcher(path).matches()) {
            response.setStatus(HttpServletResponse.SC_NOT_FOUND);
            response.setContentType("application/problem+json");
            response.setCharacterEncoding(StandardCharsets.UTF_8.name());
            response.getWriter().write(OrgsEnabledFilter.body(request.getRequestURI()));
            return;
        }
        chain.doFilter(request, response);
    }

    private static void unauthorized(HttpServletResponse response, String code) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setHeader("WWW-Authenticate", "Bearer error=\"invalid_token\", error_description=\"" + code + "\"");
        response.setContentType("application/problem+json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"code\":\"" + code + "\"}");
    }

    private static boolean isJoin(String path) {
        return path.equals("/api/join") || path.startsWith("/api/join/");
    }

    private static String pathOf(HttpServletRequest request) {
        String path = request.getRequestURI();
        String context = request.getContextPath();
        return OrgsEnabledFilter.normalise(context != null && !context.isEmpty() && path.startsWith(context) ? path.substring(context.length()) : path);
    }
}
