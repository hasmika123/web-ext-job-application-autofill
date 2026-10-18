package com.dossier.api.repository.ent;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.repository.Repository;

/**
 * The tenant-isolation rule for the Enterprise V2 persistence layer (ADR-001): every method of every repository in
 * {@code repository.ent} names the organization FIRST, there is no {@code findById} (a bare {@link Repository}), and the
 * only exceptions are the two host-to-tenant lookups below. Adding to the allow-list is a deliberate, reviewed act. X1.9
 * generalises this into {@code TenantRepositoryContractTest} over {@code repository.org} and {@code repository.ent}.
 */
class EntRepositoryContractTest {

    private static final Set<String> SAVE_METHODS = Set.of("save", "saveAndFlush", "flush", "saveAll", "saveAllAndFlush", "delete", "deleteAll"); // entity-in writes (the entity carries its own org_id; no id lookups)

    /** Lookups that exist to FIND the tenant from a host, so they cannot take an org id (04-tenancy-and-security.md section 2.2). */
    private static final Set<String> ALLOW_LISTED = Set.of(
        "OrgHostnameRepository.findActiveByHostname",
        "OrgHostnameRepository.findBySubdomain",
        // System role templates belong to no organization (org_id NULL); only the seeder and the legacy-seat sync read them (X1.6).
        "OrgRoleRepository.findSystemByRoleKey",
        "OrgRoleRepository.findSystemRoles",
        "OrgRolePermissionRepository.findAllSystemRolePermissions",
        "OrgRolePermissionRepository.deleteSystemRolePermissions",
        // Policy reviews (docs/enterprise-v2/62): the Kiwiply reviewer reads submissions across organizations; reachable only through the ROLE_ADMIN resource.
        "OrgPolicyVersionRepository.findByStatusOldestFirst",
        "OrgPolicyVersionRepository.findOneById"
    );

    private static List<Class<?>> entRepositories() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        List<Class<?>> out = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.ent")) {
            out.add(Class.forName(bd.getBeanClassName()));
        }
        return out;
    }

    @Test
    void theEntRepositoriesAreFound() throws Exception {
        assertThat(entRepositories()).extracting(Class::getSimpleName).contains("OrgHostnameRepository", "OrgBrandingRepository", "OrgSettingRepository", "OrgRoleRepository", "OrgRolePermissionRepository", "OrgMemberRoleRepository");
    }

    @Test
    void noEntRepositoryExtendsAJpaOrCrudRepository() throws Exception {
        for (Class<?> repo : entRepositories()) {
            // Only the bare marker interface: JpaRepository / CrudRepository would bring findById, deleteById, findAll...
            assertThat(repo.getInterfaces()).as(repo.getSimpleName()).containsExactly(Repository.class);
        }
    }

    @Test
    void theOrgIdIsTheFirstParameterOfEveryMethodExceptTheAllowList() throws Exception {
        List<String> checked = new ArrayList<>();
        for (Class<?> repo : entRepositories()) {
            for (Method m : repo.getMethods()) {
                String id = repo.getSimpleName() + "." + m.getName();
                if (SAVE_METHODS.contains(m.getName()) || ALLOW_LISTED.contains(id)) continue;
                assertThat(m.getParameterCount()).as(id).isGreaterThan(0);
                assertThat(m.getParameters()[0].isNamePresent()).as("compiled with -parameters").isTrue();
                assertThat(m.getParameters()[0].getName()).as(id + " must take the orgId first").isEqualTo("orgId");
                checked.add(id);
            }
        }
        assertThat(checked).isNotEmpty();
    }

    @Test
    void theAllowListNamesRealMethods() throws Exception {
        List<String> real = new ArrayList<>();
        for (Class<?> repo : entRepositories()) {
            for (Method m : repo.getMethods()) real.add(repo.getSimpleName() + "." + m.getName());
        }
        assertThat(real).containsAll(ALLOW_LISTED);
    }
}
