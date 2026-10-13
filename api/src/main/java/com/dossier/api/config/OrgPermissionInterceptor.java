package com.dossier.api.config;

import com.dossier.api.domain.enumeration.OrgPermission;
import com.dossier.api.service.ent.EnterpriseFeatureFlag;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import com.dossier.api.service.ent.authz.AuthorizationService;
import com.dossier.api.service.ent.authz.AuthzDecision;
import com.dossier.api.service.ent.authz.AuthzOperation;
import com.dossier.api.service.ent.authz.AuthzRequest;
import com.dossier.api.service.ent.authz.Beneficiary;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgFeatureFlag;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import com.dossier.api.web.rest.org.OrgPermissionRequired;
import com.dossier.api.web.rest.org.OrgUnscoped;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
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
 *
 * <p>Enterprise V2 (X1.7): for an organization in the enterprise flag the check is {@link AuthorizationService#authorize}, the
 * fixed 11-step order (tenant, membership, organization state, permission, scope, assignment...) against the beneficiary the
 * annotation names; the decision is stored next to the membership. For every other organization (the shipped default) the
 * legacy {@link OrgAccessService} calls below run exactly as before, so nothing changes until the flag is turned on.
 */
public class OrgPermissionInterceptor implements HandlerInterceptor {

    private static final Logger LOG = LoggerFactory.getLogger(OrgPermissionInterceptor.class);

    private final OrgAccessService accessService;
    private final OrgFeatureFlag featureFlag;
    private final EnterpriseFeatureFlag enterpriseFlag;
    private final AuthorizationService authorization;

    /** {@code enterpriseFlag} null (tests that do not exercise enterprise routes) = fail closed: every {@code /api/orgs/{id}/enterprise/**} handler is a 404. */
    public OrgPermissionInterceptor(OrgAccessService accessService, OrgFeatureFlag featureFlag, EnterpriseFeatureFlag enterpriseFlag) {
        this(accessService, featureFlag, enterpriseFlag, null);
    }

    /** {@code authorization} null = the legacy check for every organization (what the three-argument constructor gives). */
    public OrgPermissionInterceptor(
        OrgAccessService accessService,
        OrgFeatureFlag featureFlag,
        EnterpriseFeatureFlag enterpriseFlag,
        AuthorizationService authorization
    ) {
        this.featureFlag = featureFlag;
        this.accessService = accessService;
        this.enterpriseFlag = enterpriseFlag;
        this.authorization = authorization;
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
        if (authorization != null && enterpriseFlag != null && enterpriseFlag.isEnabled(orgId)) {
            enterpriseCheck(request, required, vars, orgId, tenant);
            return true;
        }
        OrgMembership membership = required.value().length == 0
            ? accessService.requireMember(orgId)
            : accessService.requireAll(orgId, java.util.List.of(required.value()));
        request.setAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, membership);
        return true;
    }

    /** Request attribute a body-caching component may set to the {@code beneficiaryMemberId} of the body (the interceptor cannot read a body before the handler). */
    public static final String BODY_BENEFICIARY_ATTRIBUTE = "com.dossier.api.authz.bodyBeneficiary";

    private void enterpriseCheck(HttpServletRequest request, OrgPermissionRequired required, Map<String, String> vars, Long orgId, TenantContext tenant) {
        Beneficiary beneficiary = required.beneficiary();
        Long beneficiaryId = null;
        switch (beneficiary) {
            case NONE, SELF -> {}
            case PATH_MEMBER -> beneficiaryId = id(vars == null ? null : vars.get(required.scopeTarget().isBlank() ? "memberId" : required.scopeTarget()));
            case QUERY_MEMBER -> {
                Set<String> given = new LinkedHashSet<>();
                for (String name : List.of("for", "memberId")) {
                    String[] values = request.getParameterValues(name);
                    if (values != null) for (String v : values) if (v != null && !v.isBlank()) given.add(v.trim());
                }
                if (given.isEmpty()) beneficiary = Beneficiary.SELF; // no ?for=: the caller's own
                else if (given.size() > 1) throw new OrgNotFoundException(); // two different answers: refuse, never pick one
                else beneficiaryId = id(given.iterator().next());
            }
            case BODY_MEMBER -> {
                if (!(request.getAttribute(BODY_BENEFICIARY_ATTRIBUTE) instanceof Long fromBody)) {
                    LOG.error("{} needs the body beneficiary but nothing supplied it; refusing", request.getRequestURI());
                    throw new OrgNotFoundException();
                }
                beneficiaryId = fromBody;
            }
        }
        List<String> keys = java.util.Arrays.stream(required.value()).map(OrgPermission::key).toList();
        AuthzRequest authz = new AuthzRequest(
            orgId, keys, beneficiary, beneficiaryId, AuthzOperation.ofHttpMethod(request.getMethod()), required.stateAction(), tenant,
            tokenTenant(), null, 0, null
        );
        AuthzDecision decision = authorization.require(authz);
        request.setAttribute(OrgPermissionRequired.MEMBERSHIP_ATTRIBUTE, decision.membership());
        request.setAttribute(AuthzDecision.ATTRIBUTE, decision);
    }

    private static Long tokenTenant() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        return auth instanceof JwtAuthenticationToken jwt ? TenantTokenBinding.tenantOf(jwt.getToken()) : null;
    }

    private static Long id(String raw) {
        try {
            long v = Long.parseLong(raw == null ? "" : raw.trim());
            if (v <= 0) throw new OrgNotFoundException();
            return v;
        } catch (NumberFormatException e) {
            throw new OrgNotFoundException(); // a member id that is not a number names nobody
        }
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
