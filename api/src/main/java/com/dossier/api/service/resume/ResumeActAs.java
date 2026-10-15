package com.dossier.api.service.resume;

import com.dossier.api.domain.User;
import java.util.List;
import java.util.Optional;
import java.util.function.Supplier;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * "Act for": runs a piece of the existing Resume Builder code as the OWNER of a resume while the audit trail names the person who is really
 * acting (Enterprise V2, doc 30 section 6: a marketer prepares a resume for an assigned consultant; the resume stays the consultant's and
 * every version / created-by / updated-by login records the marketer).
 *
 * <p>This is the one place in the product that swaps the authenticated user, so it is deliberately small and strict:
 * <ul>
 *   <li>the caller (a service in {@code service.ent}) has ALREADY proven the actor may act for that owner (organization from the host, permission,
 *       ASSIGNED scope, the consultant's seat); nothing here decides access;</li>
 *   <li>the swap lives only for the duration of the supplied body and is always undone, on return and on an exception;</li>
 *   <li>the thread-local {@link Scope} is what the builder services read to stamp {@code actorLogin}; it never survives the call.</li>
 * </ul>
 * There is no HTTP surface that opens a longer window, and the share-link, original-file and AI entry points are never run through it.
 */
public final class ResumeActAs {

    /** Who is acting, for which organization, and the seat's account id (so the directory link can name the actor's member row). */
    public record Scope(Long orgId, String actorLogin, Long actorUserId) {}

    private static final ThreadLocal<Scope> CURRENT = new ThreadLocal<>();

    private ResumeActAs() {}

    /** The acting scope of this thread, empty when nobody is acting for anybody (every ordinary request). */
    public static Optional<Scope> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    /** The login to record as the author: the actor while acting for someone, else {@code ownerLogin}. */
    public static String authorOr(String ownerLogin) {
        Scope s = CURRENT.get();
        return s == null ? ownerLogin : s.actorLogin();
    }

    /** An open acting window; closing it restores the caller. Idempotent. */
    public static final class Handle implements AutoCloseable {
        private final SecurityContext before;
        private boolean closed;

        private Handle(SecurityContext before) {
            this.before = before;
        }

        @Override
        public void close() {
            if (closed) return;
            closed = true;
            CURRENT.remove();
            SecurityContextHolder.setContext(before);
        }
    }

    /**
     * Opens an acting window: the thread runs as {@code owner} until the handle is closed. Nesting is refused: acting for someone while already acting for
     * someone else is a bug, not a feature. The caller MUST close it (try-with-resources, or a request interceptor's after-completion).
     */
    public static Handle open(User owner, Scope scope) {
        if (owner == null || owner.getLogin() == null || scope == null || scope.actorLogin() == null) throw new IllegalArgumentException("owner and acting scope are required");
        if (CURRENT.get() != null) throw new IllegalStateException("already acting for someone");
        SecurityContext before = SecurityContextHolder.getContext();
        SecurityContext swapped = SecurityContextHolder.createEmptyContext();
        swapped.setAuthentication(new UsernamePasswordAuthenticationToken(owner.getLogin(), "n/a", List.of(new SimpleGrantedAuthority("ROLE_USER"))));
        SecurityContextHolder.setContext(swapped);
        CURRENT.set(scope);
        return new Handle(before);
    }

    /** Runs {@code body} as {@code owner} (see {@link #open}); always undone, on return and on an exception. */
    public static <T> T run(User owner, Scope scope, Supplier<T> body) {
        try (Handle ignored = open(owner, scope)) {
            return body.get();
        }
    }
}
