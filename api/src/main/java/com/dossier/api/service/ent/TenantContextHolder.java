package com.dossier.api.service.ent;

import java.util.Optional;

/**
 * The tenant of the request being served on this thread (04-tenancy-and-security.md section 3). Set by the tenant filter
 * and cleared in its {@code finally}; a plain {@link ThreadLocal}, never an inheritable one, so a context can not leak into a
 * pooled or child thread. Code that runs off the request thread (a job, an {@code @Async} method) must be handed its
 * {@code orgId} explicitly and must not read this. Empty means "no tenant resolution ran": enterprise is off, or the request
 * is not an API request.
 */
public final class TenantContextHolder {

    /** The request attribute the tenant filter also sets, for code that has the request in hand (interceptors, resources). */
    public static final String REQUEST_ATTRIBUTE = TenantContext.class.getName();

    private static final ThreadLocal<TenantContext> CURRENT = new ThreadLocal<>();

    private TenantContextHolder() {}

    public static Optional<TenantContext> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    public static void set(TenantContext context) {
        if (context == null) CURRENT.remove();
        else CURRENT.set(context);
    }

    public static void clear() {
        CURRENT.remove();
    }
}
