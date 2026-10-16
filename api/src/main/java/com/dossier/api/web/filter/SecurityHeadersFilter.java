package com.dossier.api.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * T5.2: safe response headers on every API response. The API only answers JSON, PDFs and empty bodies to the web server and the extension,
 * never a page, so the policy is strict without breaking anything: nobody frames it, nobody sniffs it, the referrer is not leaked, browser
 * features are off, and HTTPS is pinned for a year. {@code default-src} is deliberately NOT set: a {@code default-src 'none'} / {@code object-src 'none'}
 * policy stops Chrome's inline PDF viewer on the resume PDF responses.
 *
 * <p>A header another layer already set is left alone ({@code X-Frame-Options} from Spring Security, for instance), so nothing is duplicated.
 */
public class SecurityHeadersFilter extends OncePerRequestFilter {

    static final String[][] HEADERS = {
        { "Strict-Transport-Security", "max-age=31536000; includeSubDomains" },
        { "X-Content-Type-Options", "nosniff" },
        { "Referrer-Policy", "no-referrer" },
        { "X-Frame-Options", "DENY" },
        { "Content-Security-Policy", "frame-ancestors 'none'; base-uri 'none'; form-action 'none'" },
        { "Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
    };

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        for (String[] h : HEADERS) {
            if (!response.containsHeader(h[0])) response.setHeader(h[0], h[1]);
        }
        chain.doFilter(request, response);
    }
}
