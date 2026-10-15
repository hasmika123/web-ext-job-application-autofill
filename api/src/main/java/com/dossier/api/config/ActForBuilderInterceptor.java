package com.dossier.api.config;

import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.mkt.resumes.ActForBuilderGate;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.service.resume.ResumeActAs;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Act-for mode of the Resume Builder (Enterprise V2, doc 30 section 6): a request to one of the builder's ordinary {@code /api/profile/**} routes that carries
 * {@code X-Kiwiply-Act-For} runs as the consultant who owns the resume, with the marketer recorded as author, but only after {@link ActForBuilderGate} has
 * decided (organization host, permission, ASSIGNED scope, allow-listed route naming that very resume). The window is opened in {@code preHandle} and closed in
 * {@code afterCompletion}, whatever the outcome. A request without the header is untouched: this class does nothing for the personal product.
 */
public class ActForBuilderInterceptor implements HandlerInterceptor {

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
        ActForBuilderGate.Grant grant = gate.authorize(tenant.orgId(), linkId, request.getMethod(), OrgsEnabledFilter.pathOf(request));
        request.setAttribute(HANDLE, ResumeActAs.open(grant.owner(), grant.scope()));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        if (request.getAttribute(HANDLE) instanceof ResumeActAs.Handle h) {
            h.close();
            request.removeAttribute(HANDLE);
        }
    }
}
