package com.dossier.api.config;

import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
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
    private final EnterpriseFeatureFlag enterpriseFlag;

    /** {@code enterpriseFlag} null (tests that do not exercise enterprise routes) = fail closed: every {@code /api/orgs/{id}/enterprise/**} handler is a 404. */
    public OrgPermissionInterceptor(OrgAccessService accessService, OrgFeatureFlag featureFlag, EnterpriseFeatureFlag enterpriseFlag) {
        this.featureFlag = featureFlag;
        this.accessService = accessService;
        this.enterpriseFlag = enterpriseFlag;
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) return true;
        if (!featureFlag.isEnabled()) throw new OrgNotFoundException(); // the flag is off: the org API does not exist (OrgsEnabledFilter answers first; this is the second wall)
        // Enterprise V2 (X1.3): the host the BFF forwarded decides the tenant candidate; a host that is given but not served
        // is a 404, whatever the handler (the filter already answered for most paths; this is the second wall).
        TenantContext tenant = request.getAttribute(TenantContextHolder.REQUEST_ATTRIBUTE) instanceof TenantContext c ? c : null;
        if (tenant != null && tenant.isExplicitlyUnknown()) throw new OrgNotFoundException();
        OrgPermissionRequired required = method.getMethodAnnotation(OrgPermissionRequired.class);
        if (required == null) {
            if (method.hasMethodAnnotation(OrgUnscoped.class)) return true;
            LOG.error("{} is mapped under /api/orgs but carries neither @OrgPermissionRequired nor @OrgUnscoped; refusing", method);
            throw new OrgNotFoundException();
        }
        Map<String, String> vars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String raw = vars == null ? null : vars.get("orgId");
        Long orgId = parse(raw);
        // Enterprise V2 (X1.3): on a tenant host the path organization MUST be that tenant: a member of another org, or of
        // this one on another org's host, gets the same generic 404 as for an org that does not exist.
        if (tenant != null && tenant.isTenant() && !tenant.orgId().equals(orgId)) throw new OrgNotFoundException();
        // Enterprise V2 (X1.1): the per-org wall behind EnterpriseEnabledFilter. The org is known here, so an organization
        // outside the flag's allow list (or on its deny list) sees the enterprise routes as if they did not exist.
        if (EnterpriseEnabledFilter.isOrgEnterprisePath(OrgsEnabledFilter.pathOf(request)) && (enterpriseFlag == null || !enterpriseFlag.isEnabled(orgId))) {
            throw new OrgNotFoundException();
        }
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
