package com.dossier.api.web.filter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletOutputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpServletResponseWrapper;
import java.io.IOException;
import java.io.PrintWriter;
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
        DefaultingResponse wrapped = new DefaultingResponse(response);
        chain.doFilter(request, wrapped);
        wrapped.applyDefaults(); // a response with no body never touched the stream: still gets the defaults
    }

    /**
     * Applies the defaults when the response commits, only for headers still absent then. Setting them up front would beat a resource that
     * sets its own (the resume download's {@code sandbox} CSP): Spring's {@code ResponseEntity} writer skips a header the servlet response already has.
     */
    private static final class DefaultingResponse extends HttpServletResponseWrapper {
        private boolean applied;

        DefaultingResponse(HttpServletResponse response) {
            super(response);
        }

        void applyDefaults() {
            if (applied) return;
            applied = true;
            HttpServletResponse r = (HttpServletResponse) getResponse();
            if (r.isCommitted()) return;
            for (String[] h : HEADERS) {
                if (!r.containsHeader(h[0])) r.setHeader(h[0], h[1]);
            }
        }

        @Override
        public ServletOutputStream getOutputStream() throws IOException {
            applyDefaults();
            return super.getOutputStream();
        }

        @Override
        public PrintWriter getWriter() throws IOException {
            applyDefaults();
            return super.getWriter();
        }

        @Override
        public void flushBuffer() throws IOException {
            applyDefaults();
            super.flushBuffer();
        }

        @Override
        public void sendError(int sc) throws IOException {
            applyDefaults();
            super.sendError(sc);
        }

        @Override
        public void sendError(int sc, String msg) throws IOException {
            applyDefaults();
            super.sendError(sc, msg);
        }

        @Override
        public void sendRedirect(String location) throws IOException {
            applyDefaults();
            super.sendRedirect(location);
        }
    }
}
