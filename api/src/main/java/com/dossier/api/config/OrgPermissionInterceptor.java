package com.dossier.api.config;

import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.dossier.api.web.rest.org.OrgUnscoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;

/**
 * Runs the org access check before every {@code /api/orgs/**} handler (docs/design/org/tenant-model.md decision 3),
 * so the first line of the handler is already behind it and the check cannot be forgotten:
 *
 * <ul>
 *   <li>{@link OrgPermissionRequired} - resolves the {@code {orgId}} path variable through
 *       {@link OrgAccessService}; any failure (including a non-numeric id) is a 404; success stores the
 *       {@link OrgMembership} as a request attribute.</li>
 *   <li>{@link OrgUnscoped} - the deliberately org-less handlers (create, mine): passes through.</li>
 *   <li>neither - fail closed: 404 and an error in the log. {@code OrgResourceGuardTest} catches this at build time.</li>
 * </ul>
 *
 * Non-handler dispatches (static resources, error pages) are not org handlers and pass through.
 */
public class OrgPermissionInterceptor implements HandlerInterceptor {

    private static final Logger LOG = LoggerFactory.getLogger(OrgPermissionInterceptor.class);

    private final OrgAccessService accessService;
    private final OrgFeatureFlag featureFlag;

    public OrgPermissionInterceptor(OrgAccessService accessService, OrgFeatureFlag featureFlag) {
        this.featureFlag = featureFlag;
        this.accessService = accessService;
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) return true;
        if (!featureFlag.isEnabled()) throw new OrgNotFoundException(); // the flag is off: the org API does not exist (OrgsEnabledFilter answers first; this is the second wall)
        OrgPermissionRequired required = method.getMethodAnnotation(OrgPermissionRequired.class);
        if (required == null) {
            if (method.hasMethodAnnotation(OrgUnscoped.class)) return true;
            LOG.error("{} is mapped under /api/orgs but carries neither @OrgPermissionRequired nor @OrgUnscoped; refusing", method);
            throw new OrgNotFoundException();
        }
        Map<String, String> vars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String raw = vars == null ? null : vars.get("orgId");
        Long orgId = parse(raw);
        OrgMembership membership = required.value().length == 0
            ? accessService.requireMember(orgId)
            : accessService.requireAll(orgId, java.util.List.of(required.value()));
        request.setAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, membership);
        return true;
    }

    private static Long parse(String raw) {
        if (raw == null) throw new OrgNotFoundException(); // a handler that asks for the check but has no {orgId}: nothing to scope to
        try {
            return Long.valueOf(raw);
        } catch (NumberFormatException e) {
            throw new OrgNotFoundException();
        }
    }
}
