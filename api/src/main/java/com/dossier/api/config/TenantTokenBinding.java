package com.dossier.api.config;

import com.dossier.api.security.SecurityUtils;
import com.dossier.api.service.ent.TenantContext;
import com.dossier.api.service.ent.TenantContextHolder;
import java.util.Optional;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * The token-to-tenant rules of 04-tenancy-and-security.md section 3 (ADR-004, X1.5) that can be decided from the token and
 * the resolved host alone. The path-dependent half (which routes are "tenant routes") lives in
 * {@code TenantTokenBindingFilter}. Pure and dependency-free so the sliced security tests can wire it.
 *
 * <p>No tenant context on the thread (enterprise off, or a non-API call) means no opinion: the token is judged as it was
 * before Enterprise V2. Fails closed otherwise.
 */
public final class TenantTokenBinding {

    public static final String MISMATCH = "TOKEN_TENANT_MISMATCH";

    private TenantTokenBinding() {}

    /** The {@code tid} claim, or null when the token is not tenant-bound. */
    public static Long tenantOf(Jwt jwt) {
        return jwt.getClaim(SecurityUtils.TENANT_CLAIM) instanceof Number n ? n.longValue() : null;
    }

    /** The decoder-level rule: a tenant-bound token only works on its own tenant's host (or a host with no opinion on tenants). */
    public static OAuth2TokenValidatorResult validate(Jwt jwt) {
        Long tid = tenantOf(jwt);
        if (tid == null) return OAuth2TokenValidatorResult.success();
        Optional<TenantContext> context = TenantContextHolder.current();
        if (context.isEmpty()) return OAuth2TokenValidatorResult.success();
        TenantContext c = context.get();
        // Another tenant's host, or a host we do not serve: the same refusal (fail closed). PLATFORM / no host accept the token
        // for user-scoped routes; the filter keeps it away from /api/orgs/{id}.
        boolean ok = c.isTenant() ? tid.equals(c.orgId()) : !c.isExplicitlyUnknown();
        return ok ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", MISMATCH, null));
    }
}
