package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.org.OrgAccessService;
import com.dossier.api.service.org.OrgMembership;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The one authorization function, with a fixed order that every protected operation goes through (05-permission-model.md section
 * 2). The steps stop at the FIRST failure and the failure code maps to an HTTP status in one place ({@link ReasonToHttp}):
 *
 * <ol>
 *   <li>active tenant: the host, the token's tenant and the path organization agree;</li>
 *   <li>active membership of the caller in that organization;</li>
 *   <li>the organization's state allows the operation ({@link OrgStateRules});</li>
 *   <li>the caller's effective permissions hold every key asked for;</li>
 *   <li>the target member is inside the scope the caller holds each key at ({@link ScopeEvaluator});</li>
 *   <li>6, 7, 8: module availability, beneficiary licence, allowance: {@link AuthzStep} hooks (X5.6), absent until then;</li>
 *   <li>9: acting for someone else needs an effective assignment of the right kind (a wide scope is enough for a READ);</li>
 *   <li>10, 11: consent and subscription state: hooks (X7.6, X5.6), absent until then.</li>
 * </ol>
 *
 * Fails closed throughout: a null organization, an unregistered permission key, a beneficiary that was asked for but not
 * supplied, a hook that throws: all refuse. A refusal carries only its reason; nothing about the caller or the organization.
 * Callers gate on the enterprise flag (the interceptor does); with the flag off the legacy path in
 * {@code OrgPermissionInterceptor} is used and this class is never reached.
 */
@Service
public class AuthorizationService {

    private static final Logger LOG = LoggerFactory.getLogger(AuthorizationService.class);

    private final OrgAccessService access;
    private final ScopeEvaluator scopes;
    private final OrgAssignments assignments;
    private final List<AuthzStep> steps;

    @Autowired
    public AuthorizationService(OrgAccessService access, ScopeEvaluator scopes, OrgAssignments assignments, ObjectProvider<AuthzStep> stepBeans) {
        this(access, scopes, assignments, stepBeans.orderedStream().toList());
    }

    /** For tests: the hooks given directly. Each must be step 6, 7, 8, 10 or 11. */
    public AuthorizationService(OrgAccessService access, ScopeEvaluator scopes, OrgAssignments assignments, List<AuthzStep> steps) {
        this.access = access;
        this.scopes = scopes;
        this.assignments = assignments;
        for (AuthzStep s : steps) {
            if (!List.of(6, 7, 8, 10, 11).contains(s.step())) throw new IllegalStateException(s.getClass().getName() + " implements step " + s.step() + ": only 6, 7, 8, 10 and 11 are hooks");
        }
        this.steps = steps.stream().sorted(Comparator.comparingInt(AuthzStep::step)).toList();
    }

    /** Throws the HTTP form of a refusal ({@link ReasonToHttp}); returns the decision otherwise. */
    @Transactional(readOnly = true)
    public AuthzDecision require(AuthzRequest request) {
        AuthzDecision d = authorize(request);
        if (!d.allowed()) throw ReasonToHttp.toException(d);
        return d;
    }

    @Transactional(readOnly = true)
    public AuthzDecision authorize(AuthzRequest request) {
        Long orgId = request == null ? null : request.orgId();
        List<String> asked = request == null ? List.of() : request.permissionKeys();
        if (request == null || orgId == null) return AuthzDecision.deny(orgId, AuthzReason.NOT_MEMBER, asked);

        // ---- 1. active tenant --------------------------------------------------------------------------------------
        TenantContext tenant = request.tenant();
        if (tenant != null && tenant.isExplicitlyUnknown()) return refuse(orgId, AuthzReason.TENANT_UNKNOWN, asked);
        if (tenant != null && tenant.isTenant() && !Objects.equals(tenant.orgId(), orgId)) return refuse(orgId, AuthzReason.TENANT_MISMATCH, asked);
        if (request.tokenTenantId() != null && !request.tokenTenantId().equals(orgId)) return refuse(orgId, AuthzReason.TENANT_MISMATCH, asked);

        // ---- 2. active membership ----------------------------------------------------------------------------------
        Optional<OrgMembership> resolved = request.actor() != null ? Optional.of(request.actor()) : access.resolve(orgId);
        if (resolved.isEmpty() || !Objects.equals(resolved.get().orgId(), orgId) || resolved.get().status() != com.dossier.api.domain.enumeration.OrgMemberStatus.ACTIVE) {
            return refuse(orgId, AuthzReason.NOT_MEMBER, asked);
        }
        OrgMembership me = resolved.get();

        List<String> keys = new ArrayList<>();
        for (String k : asked) keys.add(EntPermissions.canonical(k));

        // ---- 3. organization state ---------------------------------------------------------------------------------
        if (!OrgStateRules.allows(me.orgStatus(), request.operation(), keys)) {
            return refuse(orgId, request.stateAction() ? AuthzReason.ORG_STATE : AuthzReason.ORG_INACTIVE, asked);
        }

        // ---- 4. permission -----------------------------------------------------------------------------------------
        for (String key : keys) {
            if (!EntPermissions.isRegistered(key)) {
                LOG.error("authorization asked for an unregistered permission key '{}'; refusing (fail closed)", key);
                return refuse(orgId, AuthzReason.PERMISSION_DENIED, asked);
            }
            if (!me.canKey(key)) return refuse(orgId, AuthzReason.PERMISSION_DENIED, asked);
        }
        Map<String, PermissionScope> held = new LinkedHashMap<>();
        for (String key : keys) held.put(key, me.scopeFor(key).orElseThrow());

        // ---- 5. resource scope -------------------------------------------------------------------------------------
        Long target = switch (request.beneficiary()) {
            case NONE -> null;
            case SELF -> me.memberId();
            default -> request.beneficiaryMemberId();
        };
        if (request.beneficiary() != Beneficiary.NONE && target == null) {
            return refuse(orgId, AuthzReason.OUT_OF_SCOPE, asked); // a beneficiary kind that names a member, none given: nothing to compare, so no
        }
        if (target != null) {
            for (Map.Entry<String, PermissionScope> e : held.entrySet()) {
                if (!scopes.inScope(me, e.getValue(), target)) {
                    // an ASSIGNED-scope miss is reported as what it is: this consultant is not assigned to you
                    return refuse(orgId, e.getValue() == PermissionScope.ASSIGNED ? AuthzReason.NOT_ASSIGNED : AuthzReason.OUT_OF_SCOPE, asked);
                }
            }
        }

        // ---- 6-8. module, licence, allowance (hooks) ---------------------------------------------------------------
        AuthzStep.Context ctx = new AuthzStep.Context(request, me, held, target);
        Optional<AuthzReason> hook = runHooks(ctx, 6, 8);
        if (hook.isPresent()) return refuse(orgId, hook.get(), asked);

        // ---- 9. acting for someone else ----------------------------------------------------------------------------
        boolean forSomeoneElse = target != null && !target.equals(me.memberId());
        if (forSomeoneElse) {
            for (Map.Entry<String, PermissionScope> e : held.entrySet()) {
                var kinds = EntPermissions.actingKinds(e.getKey());
                if (kinds.isEmpty()) continue; // the key does not act for another person: scope was the whole question
                boolean wideRead = request.operation() == AuthzOperation.READ && e.getValue().covers(PermissionScope.TEAM);
                if (!wideRead && !assignments.isActingFor(orgId, me.memberId(), target, kinds)) {
                    return refuse(orgId, AuthzReason.NOT_ASSIGNED, asked);
                }
            }
        }

        // ---- 10-11. consent, subscription state (hooks) ------------------------------------------------------------
        hook = runHooks(ctx, 10, 11);
        if (hook.isPresent()) return refuse(orgId, hook.get(), asked);

        return AuthzDecision.allow(orgId, me, target, keys, held);
    }

    private Optional<AuthzReason> runHooks(AuthzStep.Context ctx, int from, int to) {
        for (AuthzStep s : steps) {
            if (s.step() < from || s.step() > to) continue;
            boolean needsFeature = s.step() == 7 || s.step() == 8 || s.step() == 11;
            if (needsFeature && ctx.request().featureKey() == null) continue; // consumes no licensed feature
            if (s.step() == 10 && (ctx.beneficiaryMemberId() == null || ctx.beneficiaryMemberId().equals(ctx.actor().memberId()))) continue; // actor is the beneficiary
            try {
                Optional<AuthzReason> r = s.check(ctx);
                if (r.isPresent()) return r;
            } catch (RuntimeException e) {
                LOG.error("authorization step {} ({}) failed; refusing (fail closed)", s.step(), s.getClass().getSimpleName(), e);
                return Optional.of(defaultReasonFor(s.step()));
            }
        }
        return Optional.empty();
    }

    private static AuthzReason defaultReasonFor(int step) {
        return switch (step) {
            case 6 -> AuthzReason.MODULE_OFF;
            case 7 -> AuthzReason.FEATURE_NOT_LICENSED;
            case 8 -> AuthzReason.FEATURE_ALLOWANCE_EXHAUSTED;
            case 10 -> AuthzReason.CONSENT_REQUIRED;
            default -> AuthzReason.SUBSCRIPTION_STATE;
        };
    }

    private AuthzDecision refuse(Long orgId, AuthzReason reason, List<String> asked) {
        if (LOG.isDebugEnabled()) LOG.debug("authorization refused: org={} reason={} (step {}) keys={}", orgId, reason, reason.step(), asked.stream().collect(Collectors.joining(",")));
        return AuthzDecision.deny(orgId, reason, asked);
    }
}
