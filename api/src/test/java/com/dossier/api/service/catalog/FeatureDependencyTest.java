package com.dossier.api.service.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

/** K1.2: the cycle search of the dependency editor (docs/enterprise-v2/21 section 9 FeatureDependencyTest), without a database. */
class FeatureDependencyTest {

    @Test
    void anAcyclicGraphHasNoCycle() {
        DependencyGraph g = new DependencyGraph().add("c", "b").add("b", "a").add("c", "a");
        assertThat(g.findCycle()).isEmpty();
    }

    @Test
    void aToBToAIsACycleAndTheCycleIsReported() {
        DependencyGraph g = new DependencyGraph().add("a", "b").add("b", "a");
        assertThat(g.findCycle()).containsExactly("a", "b", "a");
    }

    @Test
    void aSelfDependencyIsACycle() {
        assertThat(new DependencyGraph().add("a", "a").findCycle()).containsExactly("a", "a");
    }

    @Test
    void aLongerLoopThroughOtherServicesIsFound() {
        DependencyGraph g = new DependencyGraph().add("x", "a").add("a", "b").add("b", "c").add("c", "a");
        List<String> cycle = g.findCycle();
        assertThat(cycle).hasSize(4);
        assertThat(cycle.get(0)).isEqualTo(cycle.get(3));
        assertThat(cycle).contains("a", "b", "c");
    }

    @Test
    void anAnyOfRequirementIsNotAnEdge() {
        DependencyGraph g = new DependencyGraph().add("ai.credits_extra", DependencyGraph.ANY_CONSUMES_AI).add("ai.x", "ai.credits_extra");
        assertThat(g.findCycle()).isEmpty();
        assertThat(DependencyGraph.isAnyOf(DependencyGraph.ANY_CONSUMES_AI)).isTrue();
        assertThat(DependencyGraph.isAnyOf("ai.x")).isFalse();
    }

    @Test
    void clearingAServicesEdgesBreaksTheLoopAReplacementWouldReplace() {
        DependencyGraph g = new DependencyGraph().add("a", "b").add("b", "a");
        g.clear("b").add("b", "c");
        assertThat(g.findCycle()).isEmpty();
    }
}
