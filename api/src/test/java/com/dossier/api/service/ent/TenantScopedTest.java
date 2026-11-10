package com.dossier.api.service.ent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;

/** X1.10: background work carries an explicit tenant for its scope only, and a pooled thread never keeps one. */
class TenantScopedTest {

    @AfterEach
    void clean() {
        TenantContextHolder.clear();
        MDC.clear();
    }

    @Test
    void runSetsHolderAndMdcForTheScopeAndRestoresAfter() {
        List<String> seen = new ArrayList<>();
        TenantScoped.run(7L, () ->
            seen.add(TenantContextHolder.current().map(TenantContext::tenantLabel).orElse("none") + "/" + MDC.get("tenant") + "/" + MDC.get("host"))
        );
        assertThat(seen).containsExactly("7/7/null");
        assertThat(TenantContextHolder.current()).isEmpty();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void restoresWhenTheWorkThrows() {
        assertThatThrownBy(() ->
            TenantScoped.run(7L, () -> {
                throw new IllegalStateException("boom");
            })
        ).isInstanceOf(IllegalStateException.class);
        assertThat(TenantContextHolder.current()).isEmpty();
        assertThat(MDC.get("tenant")).isNull();
    }

    @Test
    void aSchedulerIteratingTwoOrgsSeesEachOrgAndNeverAStaleOne() {
        List<String> seen = new ArrayList<>();
        for (Long org : List.of(1L, 2L)) {
            TenantScoped.run(org, () -> seen.add(MDC.get("tenant") + ":" + TenantContextHolder.current().orElseThrow().orgId()));
            seen.add("between:" + TenantContextHolder.current().isPresent() + ":" + MDC.get("tenant"));
        }
        assertThat(seen).containsExactly("1:1", "between:false:null", "2:2", "between:false:null");
    }

    @Test
    void nestedScopesRestoreTheOuterTenantAndAnOuterRequestContextSurvives() {
        TenantContextHolder.set(TenantContext.tenant(5L, 6L, "acme.localhost"));
        MDC.put("tenant", "5");
        MDC.put("host", "acme.localhost");
        TenantScoped.run(9L, () -> {
            assertThat(MDC.get("host")).isNull();
            TenantScoped.unscoped(() -> {
                assertThat(TenantContextHolder.current()).isEmpty();
                assertThat(MDC.get("tenant")).isNull();
            });
            assertThat(MDC.get("tenant")).isEqualTo("9");
        });
        assertThat(TenantContextHolder.current().orElseThrow().orgId()).isEqualTo(5L);
        assertThat(MDC.get("host")).isEqualTo("acme.localhost");
    }

    @Test
    void unscopedClearsADirtyThread() {
        TenantContextHolder.set(TenantContext.tenant(5L, 6L, "acme.localhost"));
        MDC.put("tenant", "5");
        TenantScoped.unscoped(() -> assertThat(TenantContextHolder.current()).isEmpty());
    }

    @Test
    void failsClosedWithoutAnExplicitOrg() {
        assertThatThrownBy(() -> TenantScoped.run(null, () -> {})).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TenantScoped.wrap(0L, () -> {})).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void aPooledThreadNeverKeepsAPreviousTenantNorInheritsTheSubmitters() throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(1); // one thread, so every task reuses the same thread
        try {
            // the submitting thread is mid-request for org 5; the pool thread must not inherit it
            TenantContextHolder.set(TenantContext.tenant(5L, 6L, "acme.localhost"));
            MDC.put("tenant", "5");
            assertThat(pool.submit(() -> TenantContextHolder.current().isPresent() + "/" + MDC.get("tenant")).get()).isEqualTo("false/null");

            pool.submit(TenantScoped.wrap(7L, () -> assertThat(MDC.get("tenant")).isEqualTo("7"))).get();
            // the same thread, next task: nothing left over
            assertThat(pool.submit(() -> TenantContextHolder.current().isPresent() + "/" + MDC.get("tenant")).get()).isEqualTo("false/null");

            // even a task that throws inside a scope leaves the thread clean
            Future<?> failing = pool.submit(
                TenantScoped.wrap(8L, () -> {
                    throw new IllegalStateException("x");
                })
            );
            assertThatThrownBy(failing::get).hasCauseInstanceOf(IllegalStateException.class);
            assertThat(pool.submit(() -> TenantContextHolder.current().isPresent() + "/" + MDC.get("tenant")).get()).isEqualTo("false/null");
        } finally {
            pool.shutdownNow();
        }
    }
}
