package com.dossier.api.service.pricing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dossier.api.service.pricing.DependencyRules.Dependency;
import com.dossier.api.service.pricing.DependencyRules.Kind;
import com.dossier.api.service.pricing.DependencyRules.Outcome;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** Golden G14 (docs/enterprise-v2/22 section 9) and the dependency semantics of docs/enterprise-v2/21 section 4. */
class DependencyRulesTest {

    static final List<Dependency> GRAPH = List.of(
        new Dependency("automation.approved_apply", "ai.job_matching", Kind.COMMERCIAL, true, 499, "AI job matching"),
        new Dependency("analytics.applications", "inbox.monitoring", Kind.TECHNICAL, false, 0, "Inbox monitoring"),
        new Dependency("marketing.assisted_applications", "inbox.monitoring", Kind.TECHNICAL, true, 499, "Inbox monitoring")
    );

    @Test
    void g14CommercialDependencyIsPromptedThenRefusedUnconfirmedThenAccepted() {
        Set<String> wanted = Set.of("base.consultant", "automation.approved_apply");
        Outcome quote = DependencyRules.resolve(wanted, GRAPH, false, Set.of());
        assertThat(quote.requiresConfirmation()).singleElement().satisfies(c -> {
            assertThat(c.requires()).isEqualTo("ai.job_matching");
            assertThat(c.kind()).isEqualTo(Kind.COMMERCIAL);
            assertThat(c.priceMinor()).isEqualTo(499);
        });
        assertThatThrownBy(() -> DependencyRules.resolve(wanted, GRAPH, true, Set.of()))
            .isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("DEPENDENCY_UNCONFIRMED"));
        Outcome confirmed = DependencyRules.resolve(wanted, GRAPH, true, Set.of("ai.job_matching"));
        assertThat(confirmed.finalFeatures()).contains("ai.job_matching");
        assertThat(confirmed.requiresConfirmation()).isEmpty();
    }

    @Test
    void aFreeTechnicalDependencyIsAddedAndAPaidOneIsRefused() {
        Outcome free = DependencyRules.resolve(Set.of("base.consultant", "analytics.applications"), GRAPH, false, Set.of());
        assertThat(free.autoAdded()).containsExactly("inbox.monitoring");
        assertThat(free.finalFeatures()).contains("inbox.monitoring");
        assertThatThrownBy(() -> DependencyRules.resolve(Set.of("base.consultant", "marketing.assisted_applications"), GRAPH, false, Set.of()))
            .isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("DEPENDENCY_REQUIRED"));
    }

    @Test
    void removingTheBaseIsACancelAndTechnicalDependentsBlockRemoval() {
        assertThatThrownBy(() -> DependencyRules.checkRemoval("base.consultant", "base.consultant", Set.of(), GRAPH))
            .isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("DEPENDENCY_BLOCKS_REMOVAL"));
        assertThatThrownBy(() -> DependencyRules.checkRemoval("inbox.monitoring", "base.consultant", Set.of("analytics.applications"), GRAPH))
            .isInstanceOfSatisfying(PricingException.class, e -> assertThat(e.code()).isEqualTo("DEPENDENCY_BLOCKS_REMOVAL"));
        // G14 row 2: removing a feature nothing technically depends on is allowed
        assertThatCode(() -> DependencyRules.checkRemoval("inbox.monitoring", "base.consultant", Set.of("base.consultant"), GRAPH)).doesNotThrowAnyException();
        assertThatCode(() -> DependencyRules.checkRemoval("ai.job_matching", "base.consultant", Set.of("automation.approved_apply"), GRAPH)).doesNotThrowAnyException();
    }

    @Test
    void g14LicenseTotalWithTheConfirmedDependencyIs3997() {
        InMemoryCatalog c = Draft.org();
        c.add("AUTO", "FEATURE", Audience.ORG, BillingInterval.MONTH, "USD", 1999, 300);
        PricingResult r = new PricingEngine(c).price(PricingEngineGoldenTest.orgInputs(List.of(PricingEngineGoldenTest.g("D", "BASE", "JM", "AUTO")), 1, null));
        assertThat(r.groupTotal("D")).isEqualTo(3997);
    }
}
