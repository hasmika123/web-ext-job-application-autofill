package com.dossier.api.repository.org;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.Repository;

/**
 * O1.4: the audit trail is append-only (tenant-model.md section 2.7). The repository exposes {@code save} and reads;
 * no delete, no update, no bulk modifying query, and it inherits nothing from {@code JpaRepository} that could.
 */
class OrgAuditRepositoryNoDeleteTest {

    private static final List<String> FORBIDDEN_WORDS = List.of("delete", "remove", "update", "truncate", "purge", "clear");

    @Test
    void inheritsOnlyTheBareRepositoryMarker() {
        assertThat(OrgAuditEventRepository.class.getInterfaces()).containsExactly(Repository.class);
    }

    @Test
    void hasNoMethodThatCouldDeleteOrUpdate() {
        for (Method m : OrgAuditEventRepository.class.getMethods()) {
            String name = m.getName().toLowerCase(Locale.ROOT);
            assertThat(FORBIDDEN_WORDS.stream().noneMatch(name::contains)).as(m.getName()).isTrue();
            assertThat(m.isAnnotationPresent(Modifying.class)).as(m.getName() + " must not be @Modifying").isFalse();
        }
    }

    @Test
    void theOnlyWriteIsSaveOfNewRows() {
        List<String> names = Arrays.stream(OrgAuditEventRepository.class.getMethods()).map(Method::getName).sorted().toList();
        assertThat(names).contains("save");
        assertThat(names).noneMatch(n -> n.startsWith("saveAll") || n.equals("saveAndFlush") || n.equals("flush"));
    }
}
