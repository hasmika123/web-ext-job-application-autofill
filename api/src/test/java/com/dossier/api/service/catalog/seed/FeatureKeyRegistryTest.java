package com.dossier.api.service.catalog.seed;

import static org.assertj.core.api.Assertions.assertThat;

import com.dossier.api.service.catalog.DependencyGraph;
import com.dossier.api.service.catalog.ServiceService;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Dep;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Prod;
import com.dossier.api.service.catalog.seed.CatalogSeedData.Svc;
import com.dossier.api.service.entitlement.FeatureKeys;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * K1.4: a gate in code can never name a feature the catalog does not know. Both directions: every constant of {@link FeatureKeys} is a seeded row and
 * every seeded service has a constant; every {@code entitlements.has/require/limit(ctx, "x.y")} literal in the main sources is a seeded service, capability
 * or limit key; and the seed itself is coherent (key format, allowances, dependencies acyclic, no price anywhere).
 */
class FeatureKeyRegistryTest {

    private static final Path MAIN = Path.of("src", "main", "java");

    /** {@code entitlements.has(ctx, "ai.server")}, {@code resolver.require(c, "x.y")}, {@code entitlementService.limit(ctx, "resumes.max")}. */
    private static final Pattern GATE = Pattern.compile(
        "\\b(?:entitlements?|entitlementService|resolver)\\s*\\.\\s*(?:has|require|limit)\\s*\\(\\s*[^,()]+(?:\\([^()]*\\))?\\s*,\\s*\"([a-z][a-z0-9_]*(?:\\.[a-z0-9_]+)+)\"\\s*\\)"
    );

    static List<String> gateLiterals(String source) {
        List<String> out = new ArrayList<>();
        Matcher m = GATE.matcher(source);
        while (m.find()) out.add(m.group(1));
        return out;
    }

    private static Set<String> known() {
        Set<String> k = new HashSet<>(CatalogSeedData.serviceKeys());
        k.addAll(CatalogSeedData.capabilityKeys());
        k.addAll(CatalogSeedData.limitKeys());
        return k;
    }

    @Test
    void everyConstantIsASeededServiceAndEverySeededServiceHasAConstant() {
        assertThat(CatalogSeedData.serviceKeys()).doesNotHaveDuplicates();
        assertThat(FeatureKeys.services()).containsExactlyInAnyOrderElementsOf(CatalogSeedData.serviceKeys());
    }

    @Test
    void capabilityAndLimitConstantsMatchWhatTheSeedConfers() {
        assertThat(FeatureKeys.capabilities()).containsExactlyInAnyOrderElementsOf(CatalogSeedData.capabilityKeys());
        assertThat(CatalogSeedData.limitKeys()).containsAll(FeatureKeys.limits());
    }

    @Test
    void everyGateLiteralInTheMainSourcesIsKnownToTheSeed() throws IOException {
        Set<String> known = known();
        List<String> unknown = new ArrayList<>();
        int files = 0;
        try (Stream<Path> paths = Files.walk(MAIN)) {
            for (Path p : (Iterable<Path>) paths.filter(f -> f.toString().endsWith(".java"))::iterator) {
                files++;
                for (String literal : gateLiterals(Files.readString(p, StandardCharsets.UTF_8))) {
                    if (!known.contains(literal)) unknown.add(p.getFileName() + ": " + literal);
                }
            }
        }
        assertThat(files).as("the main sources were scanned").isGreaterThan(100);
        assertThat(unknown).as("gate literals with no seeded row").isEmpty();
    }

    @Test
    void theScannerFlagsAnUnknownLiteralAndAcceptsAKnownOne() {
        String source = """
            if (!entitlements.has(ctx, "ai.server")) throw x;
            entitlementService.require(ctx(user), "ai.not_a_real_service");
            int n = resolver.limit(c, "resumes.max");
            permissions.has(ctx, "billing.view"); // not an entitlement gate
            """;
        List<String> found = gateLiterals(source);
        assertThat(found).containsExactly("ai.server", "ai.not_a_real_service", "resumes.max");
        assertThat(found.stream().filter(l -> !known().contains(l))).containsExactly("ai.not_a_real_service");
    }

    @Test
    void theSeedIsCoherent() {
        Set<String> keys = new LinkedHashSet<>(CatalogSeedData.serviceKeys());
        for (Svc s : CatalogSeedData.SERVICES) {
            assertThat(ServiceService.KEY.matcher(s.key()).matches()).as("key format %s", s.key()).isTrue();
            assertThat(s.name()).as("name of %s", s.key()).isNotBlank().hasSizeLessThanOrEqualTo(80);
            assertThat(s.description()).as("description of %s", s.key()).isNotBlank().hasSizeLessThanOrEqualTo(300);
            assertThat(ServiceService.AUDIENCES).contains(s.audience());
            assertThat(ServiceService.CATEGORIES).contains(s.category());
            assertThat(ServiceService.PERIODS).contains(s.period());
            assertThat(ServiceService.POOL_MODES).contains(s.poolMode());
            assertThat(ServiceService.VISIBILITIES).contains(s.visibility());
            // nothing is unlimited: an allowance above 0, or 0 for a pure access service (unit none)
            if (!"none".equals(s.unit())) assertThat(s.allowance()).as("allowance of %s", s.key()).isPositive();
            if (s.stackable()) assertThat(s.maxQuantity()).as("max quantity of stackable %s", s.key()).isNotNull().isGreaterThanOrEqualTo(1);
            else assertThat(s.maxQuantity()).as("%s is not stackable", s.key()).isNull();
            if (s.additive()) assertThat(s.limitKey()).as("additive %s adds to a limit", s.key()).isNotNull();
            for (String k : s.entitlementKeys()) assertThat(k).doesNotContain("\"", "\\");
            assertThat(s.key()).doesNotContain("\"", "\\");
        }
        Set<String> codes = new HashSet<>();
        for (Prod p : CatalogSeedData.PRODUCTS) {
            assertThat(codes.add(p.code())).as("product code %s is unique", p.code()).isTrue();
            assertThat(p.name()).hasSizeLessThanOrEqualTo(100);
            assertThat(p.description()).hasSizeLessThanOrEqualTo(300);
            assertThat(p.kind()).isIn("SUBSCRIPTION", "FEATURE", "BASE_LICENSE", "ORG_MODULE", "FEE", "SERVICE", "BUNDLE");
            if (p.featureKey() != null) assertThat(keys).as("feature of product %s", p.code()).contains(p.featureKey());
            if ("FEATURE".equals(p.kind()) || "ORG_MODULE".equals(p.kind()) || "BASE_LICENSE".equals(p.kind())) assertThat(p.featureKey()).as("%s needs a feature", p.code()).isNotNull();
        }
        DependencyGraph graph = new DependencyGraph();
        for (Dep d : CatalogSeedData.DEPENDENCIES) {
            assertThat(keys).as("dependency owner %s", d.feature()).contains(d.feature());
            assertThat(DependencyGraph.isAnyOf(d.requires()) || keys.contains(d.requires())).as("dependency target %s", d.requires()).isTrue();
            assertThat(d.kind()).isIn("TECHNICAL", "COMMERCIAL", "INTEGRATION", "CONSENT");
            graph.add(d.feature(), d.requires());
        }
        assertThat(graph.findCycle()).as("the seeded dependency graph has no cycle").isEmpty();
        CatalogSeedData.LIMITS.forEach(l -> assertThat(keys).contains(l.feature()));
        CatalogSeedData.PRESETS.forEach(p -> {
            assertThat(keys).containsAll(p.features());
            if (p.mirrorsProductCode() != null) assertThat(codes).contains(p.mirrorsProductCode());
        });
    }

    @Test
    void theSeedKeepsTodaysLockedBehaviourNumbers() {
        // documentation of today's behaviour (02 section 2.4); K2.1 expresses Pro 25 / Autopilot 50 as plan overrides of these
        assertThat(CatalogSeedData.SERVICES.stream().filter(s -> s.key().equals(FeatureKeys.RESUME_LIBRARY)).findFirst().orElseThrow().allowance()).isEqualTo(3L);
        assertThat(CatalogSeedData.SERVICES.stream().filter(s -> s.key().equals(FeatureKeys.MATCHES_BASIC)).findFirst().orElseThrow().allowance()).isEqualTo(3L);
        assertThat(CatalogSeedData.SERVICES.stream().filter(s -> s.key().equals(FeatureKeys.AI_CREDITS_EXTRA)).findFirst().orElseThrow().maxQuantity()).isEqualTo(4);
    }
}
