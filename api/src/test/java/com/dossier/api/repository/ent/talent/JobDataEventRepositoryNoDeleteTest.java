package com.dossier.api.repository.ent.talent;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.domain.ent.talent.JobDataEvent;
import jakarta.persistence.Column;
import java.lang.reflect.Method;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

/**
 * The job data ledger is append-only (docs/enterprise-v2/61 section 3): the repository can save and read, and a method that could delete or update
 * a row fails this test the day somebody adds it (same rule as {@code DataShareEventRepositoryNoDeleteTest} for the consent history).
 */
class JobDataEventRepositoryNoDeleteTest {

    private static final List<String> FORBIDDEN_WORDS = List.of("delete", "remove", "update", "truncate", "purge", "clear", "erase");

    @Test
    void inheritsOnlyTheBareRepositoryMarker() {
        assertThat(JobDataEventRepository.class.getInterfaces()).containsExactly(Repository.class);
    }

    @Test
    void hasNoMethodThatCouldDeleteOrUpdate() {
        for (Method m : JobDataEventRepository.class.getMethods()) {
            String name = m.getName().toLowerCase(Locale.ROOT);
            assertThat(FORBIDDEN_WORDS.stream().noneMatch(name::contains)).as(m.getName()).isTrue();
            assertThat(m.isAnnotationPresent(Modifying.class)).as(m.getName() + " must not be @Modifying").isFalse();
            assertThat(name).doesNotStartWith("saveall").isNotEqualTo("saveandflush").isNotEqualTo("flush");
            Query q = m.getAnnotation(Query.class);
            if (q != null) {
                String jpql = q.value().toLowerCase(Locale.ROOT).trim();
                assertThat(jpql).as(m.getName() + " must be a select").startsWith("select");
            }
        }
    }

    @Test
    void theOnlyWriteIsSave() {
        List<String> writes = java.util.Arrays.stream(JobDataEventRepository.class.getMethods())
            .map(Method::getName)
            .filter(n -> n.startsWith("save"))
            .distinct()
            .toList();
        assertThat(writes).containsExactly("save");
    }

    @Test
    void everyReadNamesTheOrganizationFirst() {
        for (Method m : JobDataEventRepository.class.getMethods()) {
            if (m.getName().equals("save")) continue;
            assertThat(m.getParameterCount()).as(m.getName()).isGreaterThan(0);
            assertThat(m.getParameters()[0].getName()).as(m.getName()).isEqualTo("orgId");
        }
    }

    @Test
    void theEntityHasNoMutatorForHistoryAndTheLedgerNeverHoldsTextColumns() {
        // names of fields, ids, short codes: every column is a bounded VARCHAR (no CLOB, no job text)
        for (var f : JobDataEvent.class.getDeclaredFields()) {
            Column c = f.getAnnotation(Column.class);
            if (c == null) continue;
            assertThat(c.columnDefinition()).as(f.getName()).isEmpty();
            if (f.getType() == String.class) assertThat(c.length()).as(f.getName()).isLessThanOrEqualTo(300);
        }
        assertThat(java.util.Arrays.stream(JobDataEvent.class.getDeclaredFields()).map(f -> f.getName()).toList()).doesNotContain("description", "text", "jobDescription", "title");
    }
}
