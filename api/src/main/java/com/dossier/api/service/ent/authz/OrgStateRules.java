package com.dossier.api.service.ent.authz;

import com.dossier.api.domain.enumeration.OrgStatus;
import java.util.Collection;
import java.util.Set;

/**
 * Step 3 of the evaluation order: what an organization in each lifecycle state still allows (05-permission-model.md section 2).
 * A table, not scattered {@code if}s, so "what can a PAST_DUE organization do" has one answer.
 *
 * <pre>
 *   ACTIVE             everything
 *   PAST_DUE           reads; writes only billing and the caller's own account actions
 *   DRAFT, PENDING_SETUP_FEE
 *                      reads; writes only organization settings, billing, closing, own account actions
 *   SUSPENDED, CLOSED  reads; the only write is leaving (a person can always leave)
 * </pre>
 *
 * Reads stay open in every state so an administrator can see why (and a CLOSED organization stays read-only, as before). A
 * write that names no permission (a handler for "any active member") is refused outside ACTIVE: the rule cannot tell what it
 * does. An unknown state is refused. This only runs for organizations in the enterprise flag; the legacy path is unchanged.
 */
public final class OrgStateRules {

    private static final Set<String> PAST_DUE_WRITES = Set.of("billing.view", "billing.manage", "self.share_scope.set", "self.leave");
    private static final Set<String> SETUP_WRITES = Set.of(
        "org.settings.manage", "org.close", "billing.view", "billing.manage", "self.share_scope.set", "self.leave"
    );
    private static final Set<String> INACTIVE_WRITES = Set.of("self.leave");

    private OrgStateRules() {}

    /** True when an organization in {@code status} allows {@code operation} that needs all of {@code permissionKeys}. */
    public static boolean allows(OrgStatus status, AuthzOperation operation, Collection<String> permissionKeys) {
        if (status == null || operation == null) return false;
        if (status == OrgStatus.ACTIVE) return true;
        if (operation == AuthzOperation.READ) return true;
        if (permissionKeys == null || permissionKeys.isEmpty()) return false;
        Set<String> allowed = switch (status) {
            case PAST_DUE -> PAST_DUE_WRITES;
            case DRAFT, PENDING_SETUP_FEE -> SETUP_WRITES;
            case SUSPENDED, CLOSED -> INACTIVE_WRITES;
            case ACTIVE -> Set.of(); // handled above
        };
        return allowed.containsAll(permissionKeys);
    }
}
