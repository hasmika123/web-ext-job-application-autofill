package com.dossier.api.config;

import com.dossier.api.service.resume.ResumeActAs;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Safety net for the act-for identity swap (Enterprise V2, doc 30 section 6): whatever happens inside a request (an exception in an interceptor, a handler that
 * went async, a future code path that forgets to close its window), the acting scope of the thread is cleared in a {@code finally} before the thread goes back
 * to the pool, and is also empty when the request starts. {@link ActForBuilderInterceptor} is the normal closer; this filter makes a leak impossible rather
 * than merely unlikely. Registered outermost by {@link ActForWebConfiguration}.
 */
public class ActForCleanupFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) throws ServletException, IOException {
        ResumeActAs.clearThread(); // a request never starts acting for anybody
        try {
            chain.doFilter(request, response);
        } finally {
            ResumeActAs.clearThread();
        }
    }
}
