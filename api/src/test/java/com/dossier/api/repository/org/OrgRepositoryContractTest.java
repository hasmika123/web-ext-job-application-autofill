package com.dossier.api.repository.org;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.lang.reflect.Parameter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.data.repository.Repository;

/**
 * The tenant-isolation rule for persistence (docs/design/org/tenant-model.md decision 4 and section 7.3): every
 * method of every repository in {@code repository.org} names the organization, so there is no way to load a row
 * by its bare id. The only exceptions are {@code findMine(userId)} (a person's own memberships) and the explicit
 * allow-list below; adding to that list is a deliberate, reviewed act.
 */
class OrgRepositoryContractTest {

    private static final Set<String> SAVE_METHODS = Set.of("save", "saveAndFlush", "flush");

    /** Tenant-root lookups that cannot take an org id because they exist to FIND the org (slug is globally unique). */
    private static final Set<String> ALLOW_LISTED = Set.of("OrganizationRepository.existsBySlug", "OrganizationRepository.findBySlug");

    private static List<Class<?>> orgRepositories() throws ClassNotFoundException {
        ClassPathScanningCandidateComponentProvider scanner = new ClassPathScanningCandidateComponentProvider(false) {
            @Override
            protected boolean isCandidateComponent(org.springframework.beans.factory.annotation.AnnotatedBeanDefinition bd) {
                return bd.getMetadata().isInterface();
            }
        };
        scanner.addIncludeFilter(new AssignableTypeFilter(Repository.class));
        List<Class<?>> out = new ArrayList<>();
        for (BeanDefinition bd : scanner.findCandidateComponents("com.dossier.api.repository.org")) {
            out.add(Class.forName(bd.getBeanClassName()));
        }
        return out;
    }

    private static boolean namesTheOrg(Method m) {
        for (Parameter p : m.getParameters()) {
            String n = p.getName();
            if (n.equals("orgId") || n.equals("organizationId") || n.startsWith("orgIds")) return true;
        }
        return false;
    }

    @Test
    void theOrgRepositoriesAreFound() throws Exception {
        assertThat(orgRepositories()).extracting(Class::getSimpleName).contains(
            "OrganizationRepository", "OrgMemberRepository", "OrgGroupRepository", "OrgInviteBatchRepository",
            "OrgJoinCodeRepository", "OrgDomainRepository", "OrgAuditEventRepository", "DataShareRepository", "DataShareEventRepository"
        );
    }

    @Test
    void noOrgRepositoryExtendsAJpaOrCrudRepository() throws Exception {
        for (Class<?> repo : orgRepositories()) {
            // Only the bare marker interface: JpaRepository / CrudRepository would bring findById, deleteById, findAll...
            assertThat(repo.getInterfaces()).as(repo.getSimpleName()).containsExactly(Repository.class);
        }
    }

    @Test
    void everyMethodNamesTheOrganizationExceptFindMineAndTheAllowList() throws Exception {
        for (Class<?> repo : orgRepositories()) {
            for (Method m : repo.getMethods()) {
                String id = repo.getSimpleName() + "." + m.getName();
                if (SAVE_METHODS.contains(m.getName()) || m.getName().equals("findMine") || ALLOW_LISTED.contains(id)) continue;
                assertThat(m.getParameters()[0].isNamePresent()).as("compiled with -parameters").isTrue();
                assertThat(namesTheOrg(m)).as(id + " must take an orgId parameter").isTrue();
            }
        }
    }

    @Test
    void findMineTakesOnlyAUserId() throws Exception {
        List<Method> mine = new ArrayList<>();
        for (Class<?> repo : orgRepositories()) {
            mine.addAll(Arrays.stream(repo.getMethods()).filter(m -> m.getName().equals("findMine")).toList());
        }
        assertThat(mine).isNotEmpty();
        for (Method m : mine) {
            assertThat(m.getParameters()).hasSize(1);
            assertThat(m.getParameters()[0].getName()).isEqualTo("userId");
        }
    }

    @Test
    void theOrgIdComesFirstInEveryFinder() throws Exception {
        for (Class<?> repo : orgRepositories()) {
            for (Method m : repo.getMethods()) {
                if (SAVE_METHODS.contains(m.getName()) || m.getName().equals("findMine") || ALLOW_LISTED.contains(repo.getSimpleName() + "." + m.getName())) continue;
                assertThat(m.getParameters()[0].getName()).as(repo.getSimpleName() + "." + m.getName()).startsWith("org");
            }
        }
    }
}
