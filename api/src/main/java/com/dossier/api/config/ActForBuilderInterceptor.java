package com.dossier.api.config;

import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.mkt.resumes.ActForBuilderGate;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.AsyncHandlerInterceptor;

/**
 * Act-for mode of the Resume Builder (Enterprise V2, doc 30 section 6): a request to one of the builder's ordinary {@code /api/profile/**} routes that carries
 * {@code X-Kiwiply-Act-For} runs as the consultant who owns the resume, with the marketer recorded as author, but only after {@link ActForBuilderGate} has
 * decided (organization host, permission, ASSIGNED scope, allow-listed route naming that very resume). The window is opened in {@code preHandle} and closed in
 * {@code afterCompletion}, whatever the outcome, and ALSO in {@link #afterConcurrentHandlingStarted}: when a handler hands the request to another thread
 * (an async return type), Spring calls neither {@code afterCompletion} nor anything else on this thread, so the window would stay open on a pooled thread.
 * Async return types are banned on the builder routes by an architecture test, and {@link ActForCleanupFilter} clears the thread at the end of every request:
 * three independent walls. A request without the header is untouched: this class does nothing for the personal product.
 */
public class ActForBuilderInterceptor implements AsyncHandlerInterceptor {

    private static final String HANDLE = ActForBuilderInterceptor.class.getName() + ".handle";

    private final ActForBuilderGate gate;

    public ActForBuilderInterceptor(ActForBuilderGate gate) {
        this.gate = gate;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod)) return true;
        String linkId = request.getHeader(ActForBuilderGate.HEADER);
        if (linkId == null) return true;
        TenantContext tenant = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE) instanceof TenantContext c ? c : null;
        if (tenant == null || !tenant.isTenant()) throw new OrgNotFoundException();
        ActForBuilderGate.Grant grant = gate.authorize(tenant.orgId(), tokenTenant(), linkId, request.getMethod(), OrgsEnabledFilter.pathOf(request));
        request.setAttribute(HANDLE, ResumeActAs.open(grant.owner(), grant.scope()));
        return true;
    }

    /** The handler went async: this thread is about to be released to the pool, so the acting window closes now. */
    @Override
    public void afterConcurrentHandlingStarted(HttpServletRequest request, HttpServletResponse response, Object handler) {
        close(request);
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        close(request);
    }

    private static void close(HttpServletRequest request) {
        if (request.getAttribute(HANDLE) instanceof ResumeActAs.Handle h) {
            h.close();
            request.removeAttribute(HANDLE);
        }
    }

    /** The {@code tid} claim of the signed-in caller's JWT (read BEFORE the identity swap), or null for a token without one or any other authentication. */
    private static Long tokenTenant() {
        return SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken jwt ? TenantTokenBinding.tenantOf(jwt.getToken()) : null;
    }
}
