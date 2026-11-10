package com.dossier.api.domain.enumeration;

import java.util.Arrays;
import java.util.Optional;

/**
 * What an org actor may be allowed to do (docs/design/org/tenant-model.md section 4). A permission is a fixed
 * key, not data: {@link OrgRole#permissions()} says which roles hold it. The {@link #key()} is the wire form the
 * web gates its UI on ({@code permissions[]} of {@code GET /api/orgs/{orgId}}).
 *
 * <p>There is deliberately NO permission that submits an application, ticks an attestation box, signs in as a
 * member, or reads a member's answers cache or inbox. Those are not "denied": they do not exist
 * (marketer-workspace.md section 6).
 */
public enum OrgPermission {
    ORG_SETTINGS_MANAGE("org.settings.manage"),
    ORG_CLOSE("org.close"),
    ORG_TRANSFER_OWNERSHIP("org.transfer_ownership"),
    MEMBERS_INVITE("members.invite"),
    MEMBERS_IMPORT("members.import"),
    MEMBERS_ROLE_SET("members.role.set"),
    MEMBERS_REMOVE("members.remove"),
    MEMBERS_SUSPEND("members.suspend"),
    MEMBERS_SUPPORT_OWNER_SET("members.support_owner.set"),
    GROUPS_MANAGE("groups.manage"),
    ASSIGNMENTS_MANAGE("assignments.manage"),
    BILLING_VIEW("billing.view"),
    BILLING_MANAGE("billing.manage"),
    REPORTS_VIEW("reports.view"),
    REPORTS_EXPORT("reports.export"),
    MEMBER_VIEW_SUMMARY("member.view_summary"),
    MEMBER_VIEW_FULL("member.view_full"),
    MEMBER_ACT_FOR("member.act_for"),
    SERVICES_ORDER_FOR_MEMBER("services.order_for_member"),
    AUDIT_VIEW("audit.view"),
    INTEGRATIONS_MANAGE("integrations.manage"),
    /** The {@code ops.*} row: timesheet approval and finances (Phase 23). */
    OPS_MANAGE("ops.*"),
    /** The same row's "own hours" cell for a MEMBER: their own timesheet, nobody else's. */
    OPS_OWN_HOURS("ops.own_hours"),
    SELF_SHARE_SCOPE_SET("self.share_scope.set"),
    SELF_LEAVE("self.leave");

    private final String key;

    OrgPermission(String key) {
        this.key = key;
    }

    /** The wire / document form, e.g. {@code members.invite}. */
    public String key() {
        return key;
    }

    public static Optional<OrgPermission> ofKey(String key) {
        return Arrays.stream(values()).filter(p -> p.key.equals(key)).findFirst();
    }
}
