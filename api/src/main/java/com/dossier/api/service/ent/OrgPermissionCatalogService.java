package com.dossier.api.service.ent;

import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.service.dto.ent.PermissionCatalogDTO;
import com.dossier.api.service.ent.authz.EntPermissions;
import com.dossier.api.service.org.OrgMembership;
import com.dossier.api.service.org.OrgNotFoundException;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The permissions catalog of the Roles and Permissions page (X4.1): the {@link EntPermissions} registry grouped by the five board
 * categories ({@link PermissionCategories}), with a {@code grantable} flag per key and per scope computed against the CALLER's own
 * ceiling ({@link RoleCeiling}, 05-permission-model.md section 3), so the editor disables what the API would refuse with 422
 * {@code ROLE_CEILING} instead of letting the admin click into it. Any active member may read it (the page is read-only for them and
 * everything is non-grantable); the catalog names no organization data, only the registry and the caller's own reach.
 *
 * <p>The scope choices of a key are the scopes it makes sense at: a key whose natural scope is OWN (a consultant's own work, the self
 * keys) only has OWN; a key about people (members, consultants, resumes, the pipeline, reports, assignments) has ASSIGNED, TEAM,
 * DEPARTMENT and ORG; every other key (billing, licences, audit, settings) has ORG. Whatever scope a shipped template grants a key at
 * is always a choice too, so cloning a template can never produce a row the grid cannot show.
 */
@Service
public class OrgPermissionCatalogService {

    private static final Set<String> OWNER_ONLY = Set.of("org.close", "org.transfer_ownership");
    private static final Set<String> PEOPLE_FAMILIES = Set.of("member", "members", "consultants", "resumes", "pipeline", "reports", "assignments");
    private static final List<PermissionScope> PEOPLE_SCOPES = List.of(PermissionScope.ASSIGNED, PermissionScope.TEAM, PermissionScope.DEPARTMENT, PermissionScope.ORG);

    private final OrgRoleWriteService roleService;

    public OrgPermissionCatalogService(OrgRoleWriteService roleService) {
        this.roleService = roleService;
    }

    @Transactional(readOnly = true)
    public PermissionCatalogDTO.Catalog catalog(OrgMembership me) {
        if (me == null || !roleService.rolesEnabled(me.orgId())) throw new OrgNotFoundException();
        Optional<RoleCeiling> ceiling = roleService.callerCeiling(me);
        Map<String, Set<PermissionScope>> templateScopes = templateScopes();

        Map<String, List<PermissionCatalogDTO.Entry>> byCategory = new LinkedHashMap<>();
        Map<String, Set<String>> familiesByCategory = new LinkedHashMap<>();
        for (PermissionCategories.Category c : PermissionCategories.all()) {
            byCategory.put(c.key(), new ArrayList<>());
            familiesByCategory.put(c.key(), new LinkedHashSet<>());
        }
        Set<String> allFamilies = new LinkedHashSet<>();
        int total = 0;
        for (EntPermissions.Def def : EntPermissions.all()) {
            String category = PermissionCategories.of(def.key()).key();
            byCategory.get(category).add(entry(def, ceiling, templateScopes.getOrDefault(def.key(), Set.of())));
            familiesByCategory.get(category).add(def.family());
            allFamilies.add(def.family());
            total++;
        }
        List<PermissionCatalogDTO.Category> categories = new ArrayList<>();
        for (PermissionCategories.Category c : PermissionCategories.all()) {
            List<PermissionCatalogDTO.Entry> entries = byCategory.get(c.key());
            categories.add(new PermissionCatalogDTO.Category(c.key(), c.label(), entries.size(), familiesByCategory.get(c.key()).size(), entries));
        }
        return new PermissionCatalogDTO.Catalog(ceiling.isPresent(), total, allFamilies.size(), categories);
    }

    private PermissionCatalogDTO.Entry entry(EntPermissions.Def def, Optional<RoleCeiling> ceiling, Set<PermissionScope> templateScopes) {
        List<PermissionCatalogDTO.ScopeChoice> scopes = new ArrayList<>();
        boolean any = false;
        for (PermissionScope scope : choices(def, templateScopes)) {
            PermissionCatalogDTO.ScopeChoice choice = choice(def, scope, ceiling);
            any |= choice.grantable();
            scopes.add(choice);
        }
        String reason = null;
        if (!any) reason = ceiling.isEmpty() ? "NO_PERMISSION" : OWNER_ONLY.contains(def.key()) ? "OWNER_ONLY" : "BEYOND_YOUR_ACCESS";
        return new PermissionCatalogDTO.Entry(
            def.key(), def.family(), label(def.key()), def.description(), def.dangerous(), def.actsFor(), def.defaultScope().name(), scopes, any, reason
        );
    }

    private static PermissionCatalogDTO.ScopeChoice choice(EntPermissions.Def def, PermissionScope scope, Optional<RoleCeiling> ceiling) {
        if (ceiling.isEmpty()) return new PermissionCatalogDTO.ScopeChoice(scope.name(), false, null, null);
        RoleCeiling c = ceiling.get();
        // The attributes a NEW row must carry at this scope: the ones of the caller's own covering row (the ceiling compares them), so
        // an Organization Admin's members.role.set is offered with BELOW_ADMIN and the editor sends it along.
        for (RoleCeiling.Row held : c.heldRows(def.key())) {
            if (!held.scope().covers(scope)) continue;
            RoleCeiling.Row wanted = new RoleCeiling.Row(def.key(), scope, held.ceilingRoleKey(), held.rowFilter());
            if (c.allows(wanted)) return new PermissionCatalogDTO.ScopeChoice(scope.name(), true, held.ceilingRoleKey(), held.rowFilter());
        }
        boolean allowed = c.allows(new RoleCeiling.Row(def.key(), scope, null, null));
        return new PermissionCatalogDTO.ScopeChoice(scope.name(), allowed, null, null);
    }

    private static List<PermissionScope> choices(EntPermissions.Def def, Set<PermissionScope> templateScopes) {
        EnumSet<PermissionScope> out = EnumSet.noneOf(PermissionScope.class);
        if (def.defaultScope() == PermissionScope.OWN) out.add(PermissionScope.OWN);
        else if (PEOPLE_FAMILIES.contains(def.family())) out.addAll(PEOPLE_SCOPES);
        else out.add(PermissionScope.ORG);
        if (!def.key().startsWith("self.")) out.addAll(templateScopes); // a self key is OWN only, whatever a template says
        if (def.actsFor()) out.remove(PermissionScope.OWN); // a permission that acts for another person cannot be OWN
        return List.copyOf(out);
    }

    private static Map<String, Set<PermissionScope>> templateScopes() {
        Map<String, Set<PermissionScope>> out = new LinkedHashMap<>();
        for (RoleTemplates.Template t : RoleTemplates.all()) {
            for (RoleTemplates.Grant g : t.grants()) out.computeIfAbsent(g.key(), k -> EnumSet.noneOf(PermissionScope.class)).add(g.scope());
        }
        return out;
    }

    /** "members.role.set" becomes "Members role set"; the wildcard "ops.*" becomes "Ops (all)". */
    static String label(String key) {
        String text = key.endsWith(".*") ? key.substring(0, key.length() - 2) + " (all)" : key.replace('.', ' ').replace('_', ' ');
        return text.isEmpty() ? key : text.substring(0, 1).toUpperCase(Locale.ROOT) + text.substring(1);
    }
}
