package com.dossier.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * X1.13: lets a Prometheus scraper read {@code /management/prometheus} with a dedicated bearer token
 * ({@code DOSSIER_SCRAPE_TOKEN}) instead of an admin JWT. The comparison is constant-time. A token shorter than
 * {@link #MIN_LENGTH} or unset disables this path (admin only). On a match the request is authenticated as the synthetic
 * principal {@code metrics-scraper} with only {@link #AUTHORITY}, and the Authorization header is hidden from the JWT filter.
 * The token is never logged.
 */
public class ScrapeTokenFilter extends OncePerRequestFilter {

    public static final String AUTHORITY = "ROLE_SCRAPE";
    public static final int MIN_LENGTH = 32;
    private static final String PATH = "/management/prometheus";

    private final byte[] expectedDigest;

    public ScrapeTokenFilter(String token) {
        this.expectedDigest = token != null && token.length() >= MIN_LENGTH ? digest(token) : null;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (expectedDigest != null && PATH.equals(request.getRequestURI()) && header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            String presented = header.substring(7).trim();
            if (MessageDigest.isEqual(expectedDigest, digest(presented))) {
                SecurityContextHolder.getContext().setAuthentication(
                    UsernamePasswordAuthenticationToken.authenticated("metrics-scraper", null, List.of(new SimpleGrantedAuthority(AUTHORITY)))
                );
                chain.doFilter(new HideAuthorization(request), response);
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static byte[] digest(String s) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static final class HideAuthorization extends HttpServletRequestWrapper {

        HideAuthorization(HttpServletRequest request) {
            super(request);
        }

        @Override
        public String getHeader(String name) {
            return "Authorization".equalsIgnoreCase(name) ? null : super.getHeader(name);
        }

        @Override
        public Enumeration<String> getHeaders(String name) {
            return "Authorization".equalsIgnoreCase(name) ? Collections.emptyEnumeration() : super.getHeaders(name);
        }
    }
}
