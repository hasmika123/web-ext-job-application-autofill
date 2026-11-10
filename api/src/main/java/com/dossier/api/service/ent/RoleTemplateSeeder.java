package com.dossier.api.service.ent;

import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps the system role templates in the database equal to {@link RoleTemplates} (X1.6): the role headers exist from the
 * Liquibase seed, and this runner (idempotent, every start) writes their names, descriptions and permission rows, so a
 * template change in code reaches the database with the next deploy and a hand edit of a system row is undone. Organization
 * roles (clones, X1.14) are never touched: a later template change does not propagate to them (05 section 3).
 *
 * <p>Like {@code AdminBootstrap} it must run after the migrations (production sets {@code application.liquibase.async-start=false})
 * and it never stops the application from starting: a failure is logged and the roles read path falls back to the legacy enum
 * for any seat whose role has no permission rows.
 */
@Component
public class RoleTemplateSeeder implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(RoleTemplateSeeder.class);

    /** What one run changed (for the log and the tests). */
    public record Result(int rolesCreated, int rolesUpdated, int permissionsAdded, int permissionsUpdated, int permissionsRemoved) {
        public boolean changedAnything() {
            return rolesCreated + rolesUpdated + permissionsAdded + permissionsUpdated + permissionsRemoved > 0;
        }
    }

    private final OrgRoleRepository roles;
    private final OrgRolePermissionRepository permissions;

    public RoleTemplateSeeder(OrgRoleRepository roles, OrgRolePermissionRepository permissions) {
        this.roles = roles;
        this.permissions = permissions;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        try {
            Result r = seed();
            if (r.changedAnything()) LOG.info("Role templates synchronised: {}", r);
        } catch (RuntimeException e) {
            LOG.error("Role template seeding failed; roles read from data fall back to the legacy role until it succeeds", e);
        }
    }

    /** Writes the templates; safe to call any number of times. */
    @Transactional
    public Result seed() {
        int created = 0, updated = 0, added = 0, changed = 0, removed = 0;
        Map<String, OrgRoleDefinition> byKey = new HashMap<>();
        for (OrgRoleDefinition d : roles.findSystemRoles()) byKey.put(d.getRoleKey(), d);
        Map<Long, Map<String, OrgRolePermission>> current = new HashMap<>();
        for (OrgRolePermission p : permissions.findAllSystemRolePermissions()) {
            current.computeIfAbsent(p.getRoleId(), k -> new HashMap<>()).put(p.getPermissionKey(), p);
        }

        for (RoleTemplates.Template t : RoleTemplates.all()) {
            OrgRoleDefinition def = byKey.get(t.key());
            if (def == null) {
                def = new OrgRoleDefinition();
                def.setOrgId(null);
                def.setRoleKey(t.key());
                created++;
            } else if (!matches(def, t)) {
                updated++;
            }
            def.setName(t.name());
            def.setDescription(t.description());
            def.setTemplateKey(t.key());
            def.setWorkspaceKey(t.workspaceKey());
            def.setSystem(true);
            def.setEditable(false);
            def = roles.saveAndFlush(def);

            Map<String, OrgRolePermission> have = current.getOrDefault(def.getId(), Map.of());
            Map<String, RoleTemplates.Grant> want = t.byKey();
            for (RoleTemplates.Grant g : want.values()) {
                OrgRolePermission row = have.get(g.key());
                if (row == null) {
                    permissions.save(new OrgRolePermission(def.getId(), g.key(), g.scope(), g.ceilingRoleKey(), g.rowFilter()));
                    added++;
                } else if (row.getScope() != g.scope() || !Objects.equals(row.getCeilingRoleKey(), g.ceilingRoleKey()) || !Objects.equals(row.getRowFilter(), g.rowFilter())) {
                    row.setScope(g.scope());
                    row.setCeilingRoleKey(g.ceilingRoleKey());
                    row.setRowFilter(g.rowFilter());
                    permissions.save(row);
                    changed++;
                }
            }
            Set<String> stale = new HashSet<>(have.keySet());
            stale.removeAll(want.keySet());
            if (!stale.isEmpty()) removed += permissions.deleteSystemRolePermissions(def.getId(), stale);
        }
        return new Result(created, updated, added, changed, removed);
    }

    private static boolean matches(OrgRoleDefinition d, RoleTemplates.Template t) {
        return (
            Objects.equals(d.getName(), t.name()) &&
            Objects.equals(d.getDescription(), t.description()) &&
            Objects.equals(d.getTemplateKey(), t.key()) &&
            Objects.equals(d.getWorkspaceKey(), t.workspaceKey()) &&
            d.isSystem() &&
            !d.isEditable()
        );
    }

    /** The template keys, in order (for tests and the verification job). */
    public static List<String> templateKeys() {
        return RoleTemplates.all().stream().map(RoleTemplates.Template::key).toList();
    }
}
