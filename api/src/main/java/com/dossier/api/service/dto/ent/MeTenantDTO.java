package com.dossier.api.service.dto.ent;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * The one call the tenant shell makes (GET /api/me/tenant; 12-identity.md section 3, 09 row 2). Everything in it is about the
 * CALLER in the organization of the host they are on: nothing here is another member's data, and no field is a financial,
 * identity-document or date-of-birth value. {@code person} is the name, photo and email the basic profile already shows.
 *
 * <p>{@code workspaces} contains only workspaces the caller may open, and each workspace's {@code nav} only the pages the
 * caller's real permissions (through {@code AuthorizationService}) and the organization's modules allow: a page the caller may
 * not open is absent, never greyed. The API still re-checks every page; this is the menu, not the gate.
 */
public record MeTenantDTO(
    Org org,
    Member member,
    Person person,
    List<Role> roles,
    Map<String, String> permissions,
    Map<String, Boolean> modules,
    List<Workspace> workspaces,
    String landing,
    String landingKey,
    Consent consent,
    Features features
) {
    /** {@code terminology} are the organization's published label overrides; {@code flags} drive the shell banners. */
    public record Org(Long id, String displayName, String status, String type, String primaryHost, Map<String, String> terminology, Flags flags) {}

    /** {@code pastDue} = the organization is PAST_DUE; {@code billingActionRequired} = pastDue and the caller may fix it. */
    public record Flags(boolean pastDue, boolean billingActionRequired, boolean greeting) {}

    /** The caller's seat. Group, manager and title arrive with the employee stories (X4); until then they are null. */
    public record Member(Long id, String status, String title, Long departmentGroupId, Long teamGroupId, Long managerMemberId, Instant joinedAt) {}

    /** What the basic profile already shows: display name, email, photo. */
    public record Person(String name, String email, String imageUrl) {}

    public record Role(Long id, String key, String name, boolean isPrimary, String workspaceKey) {}

    /**
     * {@code key} is the URL slug ({@code admin}); {@code workspaceKey} the stored key ({@code ADMIN}); {@code roleKeys} the caller's roles that grant it;
     * {@code groups} the menu's group labels, in order (a nav item names one by {@code group}, or none).
     */
    public record Workspace(String key, String workspaceKey, String label, String home, int order, List<String> roleKeys, List<NavItem> nav, List<String> bottomTabs, List<NavGroup> groups) {}

    public record NavItem(String key, String label, String icon, String href, String badge, String group) {}

    public record NavGroup(String key, String label) {}

    /** {@code scope} is NONE until the data-share grant exists; {@code fullTo} the member id a FULL grant is limited to. */
    public record Consent(String scope, Long fullTo) {}

    /** {@code pending} is true until the entitlement service (X5.6) can list the licensed feature keys. */
    public record Features(List<String> licensed, boolean pending) {}
}
