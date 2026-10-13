package com.dossier.api.service.ent;

import java.util.Map;
import java.util.concurrent.Callable;
import java.util.function.Supplier;
import org.slf4j.MDC;

/**
 * The one way background work (a scheduler iterating organizations, an {@code @Async} method, a pooled executor task)
 * acts for a tenant (X1.10, 04-tenancy-and-security.md section 3). {@link TenantContextHolder} is a plain thread-local and
 * is never inherited, so off the request thread there is NO tenant unless the job names one here, and the tenant it names
 * is gone again when the scope ends, however it ends:
 *
 * <ul>
 *   <li>{@link #run(Long, Runnable)} / {@link #call(Long, Callable)} / {@link #get(Long, Supplier)} - work FOR one org.
 *       Sets the holder and the MDC ({@code tenant=<orgId>}; {@code host} and {@code member} are cleared, a job has none)
 *       and restores exactly what was there before in {@code finally}.</li>
 *   <li>{@link #unscoped(Runnable)} - work for NO tenant (platform jobs). Explicitly clears the holder and the tenant MDC
 *       keys for the scope, so even a thread that somehow arrived dirty is not read as a tenant.</li>
 *   <li>{@link #wrap(Long, Runnable)} / {@link #wrapUnscoped(Runnable)} - the same, as a {@code Runnable} to hand to an
 *       executor. The tenant is captured at wrap time as an explicit {@code orgId}, never copied from the submitting
 *       thread's context.</li>
 * </ul>
 *
 * A null or non-positive org id is refused: fail closed, never "no tenant, carry on".
 */
public final class TenantScoped {

    private static final String[] MDC_KEYS = { "tenant", "host", "member" };

    private TenantScoped() {}

    public static void run(Long orgId, Runnable work) {
        get(orgId, () -> {
            work.run();
            return null;
        });
    }

    public static <T> T get(Long orgId, Supplier<T> work) {
        requireOrg(orgId);
        Saved saved = Saved.capture();
        try {
            enter(orgId);
            return work.get();
        } finally {
            saved.restore();
        }
    }

    public static <T> T call(Long orgId, Callable<T> work) throws Exception {
        requireOrg(orgId);
        Saved saved = Saved.capture();
        try {
            enter(orgId);
            return work.call();
        } finally {
            saved.restore();
        }
    }

    /** Runs {@code work} with no tenant at all: the holder and the tenant MDC keys are cleared for the scope. */
    public static void unscoped(Runnable work) {
        Saved saved = Saved.capture();
        try {
            TenantContextHolder.clear();
            clearMdc();
            work.run();
        } finally {
            saved.restore();
        }
    }

    public static Runnable wrap(Long orgId, Runnable work) {
        requireOrg(orgId);
        return () -> run(orgId, work);
    }

    public static Runnable wrapUnscoped(Runnable work) {
        return () -> unscoped(work);
    }

    private static void enter(Long orgId) {
        TenantContextHolder.set(TenantContext.tenant(orgId, null, null));
        clearMdc();
        MDC.put("tenant", String.valueOf(orgId));
    }

    private static void requireOrg(Long orgId) {
        if (orgId == null || orgId <= 0) throw new IllegalArgumentException("a tenant scope needs an explicit organization id");
    }

    private static void clearMdc() {
        for (String key : MDC_KEYS) MDC.remove(key);
    }

    /** What the thread had before the scope, so a nested scope (or a caller's own) is put back exactly. */
    private record Saved(TenantContext context, Map<String, String> mdc) {
        static Saved capture() {
            return new Saved(TenantContextHolder.current().orElse(null), MDC.getCopyOfContextMap());
        }

        void restore() {
            TenantContextHolder.set(context);
            if (mdc == null) MDC.clear();
            else MDC.setContextMap(mdc);
        }
    }
}
