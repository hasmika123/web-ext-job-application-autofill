package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.IntegrationTest;
import com.dossier.api.domain.ent.OrgRoleDefinition;
import com.dossier.api.domain.ent.OrgRolePermission;
import com.dossier.api.domain.enumeration.OrgStatus;
import com.dossier.api.domain.enumeration.PermissionScope;
import com.dossier.api.domain.org.Organization;
import com.dossier.api.repository.UserRepository;
import com.dossier.api.repository.ent.OrgRolePermissionRepository;
import com.dossier.api.repository.ent.OrgRoleRepository;
import com.dossier.api.repository.org.OrgMemberRepository;
import com.dossier.api.repository.org.OrganizationRepository;
import com.dossier.api.web.rest.org.OrgFixtures;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

/**
 * The seeder against the real schema: the startup run already made the database equal to the code; a second run changes
 * nothing; a hand edit of a system row (changed scope, deleted row, extra row, renamed role) is undone; an organization's own
 * role is never touched.
 */
@IntegrationTest
@Transactional
class RoleTemplateSeederIT {

    @Autowired private RoleTemplateSeeder seeder;
    @Autowired private OrgRoleRepository roles;
    @Autowired private OrgRolePermissionRepository permissions;
    @Autowired private OrganizationRepository orgs;
    @Autowired private OrgMemberRepository members;
    @Autowired private UserRepository users;
    @Autowired private EntityManager em;

    private Map<Long, Map<String, OrgRolePermission>> storedByRole() {
        em.flush();
        em.clear();
        return permissions
            .findAllSystemRolePermissions()
            .stream()
            .collect(Collectors.groupingBy(OrgRolePermission::getRoleId, Collectors.toMap(OrgRolePermission::getPermissionKey, p -> p)));
    }

    @Test
    void theDatabaseEqualsTheCodeAfterStartupAndASecondRunChangesNothing() {
        seeder.seed(); // idempotent: whatever the startup run left, this converges
        RoleTemplateSeeder.Result again = seeder.seed();
        assertThat(again.changedAnything()).as("second run: %s", again).isFalse();

        List<OrgRoleDefinition> system = roles.findSystemRoles();
        assertThat(system).extracting(OrgRoleDefinition::getRoleKey).containsExactlyInAnyOrderElementsOf(RoleTemplateSeeder.templateKeys());
        Map<Long, Map<String, OrgRolePermission>> stored = storedByRole();
        for (OrgRoleDefinition d : system) {
            RoleTemplates.Template t = RoleTemplates.find(d.getRoleKey()).orElseThrow();
            assertThat(d.getOrgId()).isNull();
            assertThat(d.isSystem()).isTrue();
            assertThat(d.isEditable()).isFalse();
            assertThat(d.getName()).isEqualTo(t.name());
            assertThat(d.getWorkspaceKey()).isEqualTo(t.workspaceKey());
            assertThat(d.getTemplateKey()).isEqualTo(t.key());
            Map<String, OrgRolePermission> rows = stored.getOrDefault(d.getId(), Map.of());
            assertThat(rows.keySet()).as(t.key()).containsExactlyInAnyOrderElementsOf(t.byKey().keySet());
            for (RoleTemplates.Grant g : t.grants()) {
                OrgRolePermission p = rows.get(g.key());
                assertThat(p.getScope()).as(t.key() + "/" + g.key()).isEqualTo(g.scope());
                assertThat(p.getCeilingRoleKey()).as(t.key() + "/" + g.key()).isEqualTo(g.ceilingRoleKey());
                assertThat(p.getRowFilter()).as(t.key() + "/" + g.key()).isEqualTo(g.rowFilter());
            }
        }
    }

    @Test
    void aHandEditOfASystemRoleIsUndone() {
        seeder.seed();
        OrgRoleDefinition admin = roles.findSystemByRoleKey("ORG_ADMIN").orElseThrow();
        Map<String, OrgRolePermission> rows = storedByRole().get(admin.getId());
        OrgRolePermission scope = rows.get("billing.view");
        scope.setScope(PermissionScope.OWN);
        permissions.saveAndFlush(scope);
        permissions.deleteSystemRolePermissions(admin.getId(), List.of("audit.view"));
        permissions.saveAndFlush(new OrgRolePermission(admin.getId(), "org.close", PermissionScope.ORG, null, null)); // an ORG_ADMIN may never close the org
        OrgRoleDefinition renamed = roles.findSystemByRoleKey("ORG_ADMIN").orElseThrow();
        renamed.setName("Super admin");
        renamed.setEditable(true);
        roles.saveAndFlush(renamed);
        em.flush();
        em.clear();

        RoleTemplateSeeder.Result r = seeder.seed();
        assertThat(r.rolesUpdated()).isEqualTo(1);
        assertThat(r.permissionsUpdated()).isEqualTo(1);
        assertThat(r.permissionsAdded()).isEqualTo(1);
        assertThat(r.permissionsRemoved()).isEqualTo(1);

        Map<String, OrgRolePermission> fixed = storedByRole().get(admin.getId());
        assertThat(fixed.get("billing.view").getScope()).isEqualTo(PermissionScope.ORG);
        assertThat(fixed).containsKey("audit.view").doesNotContainKey("org.close");
        OrgRoleDefinition again = roles.findSystemByRoleKey("ORG_ADMIN").orElseThrow();
        assertThat(again.getName()).isEqualTo("Organization Admin");
        assertThat(again.isEditable()).isFalse();
    }

    @Test
    void anOrganizationsOwnRoleIsNeverTouched() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        Organization org = fx.org("seed-it-" + System.nanoTime(), OrgStatus.ACTIVE);
        OrgRoleDefinition clone = new OrgRoleDefinition();
        clone.setOrgId(org.getId());
        clone.setRoleKey("ORG_ADMIN"); // same key as a system template: its own role, in its own organization
        clone.setName("Our admins");
        clone.setTemplateKey("ORG_ADMIN");
        clone = roles.saveAndFlush(clone);
        permissions.saveAndFlush(new OrgRolePermission(clone.getId(), "billing.view", PermissionScope.TEAM, null, null));
        em.flush();
        em.clear();

        seeder.seed();

        OrgRoleDefinition kept = roles.findVisibleByOrgIdAndId(org.getId(), clone.getId()).orElseThrow();
        assertThat(kept.getName()).isEqualTo("Our admins");
        assertThat(kept.isEditable()).isTrue();
        assertThat(permissions.findForRoles(org.getId(), List.of(clone.getId()))).hasSize(1).first().satisfies(p -> assertThat(p.getScope()).isEqualTo(PermissionScope.TEAM));
        assertThat(roles.findSystemRoles()).extracting(OrgRoleDefinition::getId).doesNotContain(clone.getId());
    }

    @Test
    void anOrganizationSeesSystemTemplatesAndItsOwnRolesButNeverAnotherOrganizationsRoles() {
        OrgFixtures fx = new OrgFixtures(users, orgs, members);
        Organization a = fx.org("seed-a-" + System.nanoTime(), OrgStatus.ACTIVE);
        Organization b = fx.org("seed-b-" + System.nanoTime(), OrgStatus.ACTIVE);
        OrgRoleDefinition mine = new OrgRoleDefinition();
        mine.setOrgId(a.getId());
        mine.setRoleKey("A_ONLY");
        mine.setName("A only");
        roles.saveAndFlush(mine);
        seeder.seed();

        assertThat(roles.findVisibleToOrg(a.getId())).extracting(OrgRoleDefinition::getRoleKey).contains("A_ONLY", "OWNER").hasSize(13);
        assertThat(roles.findVisibleToOrg(b.getId())).extracting(OrgRoleDefinition::getRoleKey).doesNotContain("A_ONLY").hasSize(12);
        assertThat(roles.findVisibleByOrgIdAndId(b.getId(), mine.getId())).as("B can not read A's role by id").isEmpty();
        assertThat(roles.findVisibleByOrgIdAndIdIn(b.getId(), List.of(mine.getId()))).isEmpty();
        assertThat(permissions.findForRoles(b.getId(), List.of(mine.getId()))).isEmpty();
    }
}
