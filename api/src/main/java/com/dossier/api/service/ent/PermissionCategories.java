package com.dossier.api.service.ent;

import com.dossier.api.service.ent.authz.EntPermissions;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The five groups of the Roles and Permissions page's permission overview (Core Platform, Recruiting, Consultants, Finance,
 * Administration), derived from the {@link EntPermissions} family of each key so the registry stays the one source: a new family
 * must be placed here ({@code PermissionCategoriesTest} fails otherwise) and a new key lands in its family's category by itself.
 */
public final class PermissionCategories {

    public record Category(String key, String label) {}

    public static final Category CORE = new Category("CORE_PLATFORM", "Core Platform");
    public static final Category RECRUITING = new Category("RECRUITING", "Recruiting");
    public static final Category CONSULTANTS = new Category("CONSULTANTS", "Consultants");
    public static final Category FINANCE = new Category("FINANCE", "Finance");
    public static final Category ADMINISTRATION = new Category("ADMINISTRATION", "Administration");

    private static final List<Category> ORDER = List.of(CORE, RECRUITING, CONSULTANTS, FINANCE, ADMINISTRATION);

    private static final Map<String, Category> BY_FAMILY = new LinkedHashMap<>();

    static {
        for (String f : new String[] { "self", "dashboard", "reports", "member", "services" }) BY_FAMILY.put(f, CORE);
        for (String f : new String[] { "pipeline", "clients", "placements", "talent", "resumes" }) BY_FAMILY.put(f, RECRUITING);
        for (String f : new String[] { "consultants", "assignments", "licenses" }) BY_FAMILY.put(f, CONSULTANTS);
        for (String f : new String[] { "billing", "finance", "ops" }) BY_FAMILY.put(f, FINANCE);
        for (String f : new String[] { "org", "members", "groups", "roles", "audit", "integrations", "hr" }) BY_FAMILY.put(f, ADMINISTRATION);
    }

    private PermissionCategories() {}

    /** The categories in display order. */
    public static List<Category> all() {
        return ORDER;
    }

    /** The category of a registered key's family; Administration (the most guarded) for a family nobody placed. */
    public static Category of(String permissionKey) {
        return EntPermissions.find(permissionKey).map(d -> BY_FAMILY.getOrDefault(d.family(), ADMINISTRATION)).orElse(ADMINISTRATION);
    }

    public static boolean placed(String family) {
        return BY_FAMILY.containsKey(family);
    }
}
