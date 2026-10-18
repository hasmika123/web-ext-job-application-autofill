package com.dossier.api.domain.enumeration;

import static com.dossier.api.domain.enumeration.OrgPermission.*;
import static com.dossier.api.domain.enumeration.OrgScope.*;

import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * A member's role inside one organization (docs/design/org/tenant-model.md section 4). A fixed enum with a fixed
 * permission matrix, not custom roles. {@link #COACH} is reserved: it holds no permission and the service layer
 * rejects it until a flag enables it.
 *
 * <p>The matrix below transcribes section 4 cell by cell; {@code OrgPermissionMatrixTest} embeds the table and
 * diffs it against the document, so the code and the design cannot drift apart.
 */
public enum OrgRole {
    OWNER,
    ADMIN,
    /** Looks after a subset of members (their "support owner"). */
    STAFF,
    MEMBER,
    /** Consultancy marketer (Phase 22): prepares, never submits and never signs in as a consultant. */
    MARKETER,
    /** Billing and ops finance (Phase 23): records money, never moves it. */
    FINANCE,
    /** Reserved (tenant-model.md decision 10): no permissions. */
    COACH;

    private static final Map<OrgRole, Map<OrgPermission, OrgScope>> GRANTS = buildGrants();

    /** True for a value the product does not accept yet. */
    public boolean isReserved() {
        return this == COACH;
    }

    /** Every permission this role holds, with the narrowing that comes with it. Unmodifiable. */
    public Map<OrgPermission, OrgScope> grants() {
        return GRANTS.get(this);
    }

    public Set<OrgPermission> permissions() {
        return GRANTS.get(this).keySet();
    }

    public boolean can(OrgPermission permission) {
        return GRANTS.get(this).containsKey(permission);
    }

    /** The narrowing on {@code permission}, or empty when this role does not hold it at all. */
    public Optional<OrgScope> scopeOf(OrgPermission permission) {
        return Optional.ofNullable(GRANTS.get(this).get(permission));
    }

    private static Map<OrgRole, Map<OrgPermission, OrgScope>> buildGrants() {
        Map<OrgRole, Map<OrgPermission, OrgScope>> all = new EnumMap<>(OrgRole.class);

        Map<OrgPermission, OrgScope> owner = new EnumMap<>(OrgPermission.class);
        for (OrgPermission p : new OrgPermission[] {
            ORG_SETTINGS_MANAGE, ORG_CLOSE, ORG_TRANSFER_OWNERSHIP, MEMBERS_INVITE, MEMBERS_IMPORT, MEMBERS_ROLE_SET, MEMBERS_REMOVE,
            MEMBERS_SUSPEND, MEMBERS_SUPPORT_OWNER_SET, GROUPS_MANAGE, ASSIGNMENTS_MANAGE, BILLING_VIEW, BILLING_MANAGE, REPORTS_VIEW,
            REPORTS_EXPORT, MEMBER_VIEW_SUMMARY, SERVICES_ORDER_FOR_MEMBER, AUDIT_VIEW, INTEGRATIONS_MANAGE, OPS_MANAGE,
        }) owner.put(p, ALL);
        owner.put(SELF_SHARE_SCOPE_SET, SELF);
        owner.put(SELF_LEAVE, SELF_AFTER_TRANSFER); // the matrix footnote: an OWNER must transfer ownership before leaving
        all.put(OWNER, owner);

        Map<OrgPermission, OrgScope> admin = new EnumMap<>(OrgPermission.class);
        admin.putAll(owner);
        admin.remove(ORG_CLOSE);
        admin.remove(ORG_TRANSFER_OWNERSHIP);
        admin.put(MEMBERS_ROLE_SET, BELOW_ADMIN_ROLES);
        admin.put(SELF_LEAVE, SELF);
        all.put(ADMIN, admin);

        Map<OrgPermission, OrgScope> staff = new EnumMap<>(OrgPermission.class);
        staff.put(MEMBERS_INVITE, MEMBER_ROLE_ONLY);
        staff.put(MEMBERS_IMPORT, MEMBER_ROLE_ONLY);
        staff.put(REPORTS_VIEW, OWN_MEMBERS);
        staff.put(MEMBER_VIEW_SUMMARY, OWN_MEMBERS);
        staff.put(SELF_SHARE_SCOPE_SET, SELF);
        staff.put(SELF_LEAVE, SELF);
        all.put(STAFF, staff);

        Map<OrgPermission, OrgScope> member = new EnumMap<>(OrgPermission.class);
        member.put(OPS_OWN_HOURS, OWN_HOURS);
        member.put(SELF_SHARE_SCOPE_SET, SELF);
        member.put(SELF_LEAVE, SELF);
        all.put(MEMBER, member);

        Map<OrgPermission, OrgScope> marketer = new EnumMap<>(OrgPermission.class);
        marketer.put(REPORTS_VIEW, OWN_CONSULTANTS);
        marketer.put(MEMBER_VIEW_SUMMARY, OWN_CONSULTANTS);
        marketer.put(MEMBER_VIEW_FULL, PAIRED);
        marketer.put(MEMBER_ACT_FOR, PAIRED);
        marketer.put(SELF_SHARE_SCOPE_SET, SELF);
        marketer.put(SELF_LEAVE, SELF);
        all.put(MARKETER, marketer);

        Map<OrgPermission, OrgScope> finance = new EnumMap<>(OrgPermission.class);
        finance.put(BILLING_VIEW, ALL);
        finance.put(BILLING_MANAGE, ALL);
        finance.put(REPORTS_VIEW, ALL);
        finance.put(REPORTS_EXPORT, ALL);
        finance.put(AUDIT_VIEW, BILLING_AND_OPS_ROWS);
        finance.put(OPS_MANAGE, ALL);
        finance.put(SELF_SHARE_SCOPE_SET, SELF);
        finance.put(SELF_LEAVE, SELF);
        all.put(FINANCE, finance);

        all.put(COACH, Map.of());

        all.replaceAll((role, grants) -> Collections.unmodifiableMap(grants));
        return Collections.unmodifiableMap(all);
    }
}
