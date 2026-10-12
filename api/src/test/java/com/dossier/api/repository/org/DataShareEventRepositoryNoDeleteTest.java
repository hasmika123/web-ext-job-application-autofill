package com.dossier.api.repository.org;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.Repository;

/** O6.1: the consent history is append-only, like the org audit trail. */
class DataShareEventRepositoryNoDeleteTest {

    private static final List<String> FORBIDDEN_WORDS = List.of("delete", "remove", "update", "truncate", "purge", "clear");

    @Test
    void inheritsOnlyTheBareRepositoryMarker() {
        assertThat(DataShareEventRepository.class.getInterfaces()).containsExactly(Repository.class);
    }

    @Test
    void hasNoMethodThatCouldDeleteOrUpdate() {
        for (Method m : DataShareEventRepository.class.getMethods()) {
            String name = m.getName().toLowerCase(Locale.ROOT);
            assertThat(FORBIDDEN_WORDS.stream().noneMatch(name::contains)).as(m.getName()).isTrue();
            assertThat(m.isAnnotationPresent(Modifying.class)).as(m.getName() + " must not be @Modifying").isFalse();
            assertThat(name).doesNotStartWith("saveall").isNotEqualTo("saveandflush").isNotEqualTo("flush");
        }
    }
}
