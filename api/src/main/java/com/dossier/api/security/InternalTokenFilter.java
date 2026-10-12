package com.dossier.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Guards the service-to-service routes ({@code /api/internal/**}, Resume Builder R3.7): the request must
 * carry {@code X-Internal-Token} equal to the shared secret ({@code DOSSIER_INTERNAL_TOKEN}), otherwise 401.
 * The comparison is constant-time (digest of both sides, then {@link MessageDigest#isEqual}, so neither the
 * value nor its length leaks through timing). A blank configured token means "no internal access": every
 * request is refused - an unconfigured deployment never has an open back door.
 *
 * <p>On success the request is authenticated as the synthetic principal {@code internal-worker} with the
 * single authority {@link #AUTHORITY}; it carries no user, so user-scoped code can never run under it.
 * Deliberately not a Spring bean: it is wired only into the internal filter chain, never the user one.
 */
public class InternalTokenFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Internal-Token";
    public static final String AUTHORITY = "ROLE_INTERNAL";

    private final byte[] expectedDigest;
    private final boolean configured;

    public InternalTokenFilter(String token) {
        this.configured = token != null && !token.isBlank();
        this.expectedDigest = digest(this.configured ? token : "");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
        throws ServletException, IOException {
        String presented = request.getHeader(HEADER);
        boolean ok = configured && presented != null && MessageDigest.isEqual(expectedDigest, digest(presented));
        if (!ok) {
            SecurityContextHolder.clearContext();
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(
            UsernamePasswordAuthenticationToken.authenticated("internal-worker", null, List.of(new SimpleGrantedAuthority(AUTHORITY)))
        );
        chain.doFilter(request, response);
    }

    private static byte[] digest(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
